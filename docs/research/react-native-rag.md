# Local PDF RAG findings

Research checked on 2026-10-03. React Native RAG source is pinned to commit `68aad4dbc2caba5c4deda71dad08f14248ca91ce`. Context7 did not contain this library; its source supplied the API facts. Context7 did supply OP-SQLite and React Native ExecuTorch documentation.

Implementation note: the app loads embeddings independently and skips the wrapper's schema-creating `load()`. The shipped database contains the vectors table and an FTS5 keyword index. The optional ANN index shown below is omitted because the wrapper scans all vectors. See [current setup](../RAG.md).

## Supported integration

- Import `OPSQLiteVectorStore` from `@react-native-rag/op-sqlite`. Construct with `{ name, embeddings }`. Construction opens the database immediately, so import the bundled file first. `load()` loads the embedding model, embeds `dummy` to determine its dimension, and attempts schema/index creation. There is no database path or import option in this wrapper. [Source](https://github.com/software-mansion-labs/react-native-rag/blob/68aad4dbc2caba5c4deda71dad08f14248ca91ce/packages/op-sqlite/src/wrappers/op-sqlite.ts)
- `query({ queryText, nResults, predicate })` returns `QueryResult[]` with `id`, `document`, `embedding`, `metadata`, and cosine `similarity`. `queryEmbedding` can replace `queryText`. It scans and sorts all vectors in SQL, then applies filtering and the result limit in JavaScript. The created index does not make this query an indexed nearest-neighbor lookup. Benchmark the actual corpus before introducing a custom indexed query. [Source](https://github.com/software-mansion-labs/react-native-rag/blob/68aad4dbc2caba5c4deda71dad08f14248ca91ce/packages/op-sqlite/src/wrappers/op-sqlite.ts)
- Use retrieval independently, retain the existing Bielik session, and build the prompt with retrieved text and source metadata. `RAG.generate()` returns only text; its default prompt omits citations. [RAG implementation](https://github.com/software-mansion-labs/react-native-rag/blob/68aad4dbc2caba5c4deda71dad08f14248ca91ce/src/rag/rag.ts)

## Prebuilt database

Required schema for the selected 384-dimensional model:

```sql
CREATE TABLE vectors (
  id TEXT PRIMARY KEY,
  document TEXT NOT NULL,
  embedding F32_BLOB(384) NOT NULL,
  metadata JSON DEFAULT NULL
);
CREATE INDEX idx_vectors_embedding ON vectors(
  libsql_vector_idx(embedding, 'compress_neighbors=float8', 'max_neighbors=100')
);
```

Populate through a compatible libsql engine with `vector(?)` and serialized JSON metadata. Ordinary SQLite does not supply these libsql functions. Preserve source filename, page range, section, language, chunk ID and document hash in metadata. Keep the model revision, tokenizer hash, preprocessing, dimension, corpus version and database hash in a separate manifest. [Wrapper SQL](https://github.com/software-mansion-labs/react-native-rag/blob/68aad4dbc2caba5c4deda71dad08f14248ca91ce/packages/op-sqlite/src/wrappers/op-sqlite.ts), [required libsql configuration](https://github.com/software-mansion-labs/react-native-rag/blob/main/packages/op-sqlite/README.md)

Set `"op-sqlite": { "libsql": true }` in `package.json`; `sqliteVec` is unnecessary. This uses local `open({ name })`, with no server or synchronization requirement. [Package README](https://github.com/software-mansion-labs/react-native-rag/blob/main/packages/op-sqlite/README.md)

Native linked assets support `await moveAssetsDatabase({ filename: 'rag-pl-v1.sqlite' })` before constructing the store with the same filename. The copy is idempotent unless `overwrite` is requested. OP-SQLite defaults are the iOS Library directory and Android database directory. In Expo CNG, prefer an Expo asset bundled through configuration and copied into those directories, or a config plugin that links the native asset. Do not edit generated native projects. Versioned filenames avoid overwriting an open database. [OP-SQLite configuration](https://op-engineering.github.io/op-sqlite/docs/configuration/), [copy signature](https://github.com/OP-Engineering/op-sqlite/blob/main/src/functions.ts)

The wrapper sends both DDL statements in one `execute()` call. OP-SQLite documents that libsql does not support multi-statement execution. Prebuild both table and index, then verify wrapper loading on iOS and Android; adapt initialization into separate statements if necessary. [OP-SQLite API](https://op-engineering.github.io/op-sqlite/docs/api/)

## Embeddings and version risks

The app uses Expo 57, React Native 0.86.3 and React Native ExecuTorch 0.10.4. Expo 57 targets React Native 0.86. [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/)

`@react-native-rag/executorch` 0.9.0 requires `react-native-executorch ^0.9.0`, which excludes 0.10.4. Use a small adapter implementing `Embeddings.load()`, `unload()` and `embed(text): Promise<number[]>` against the installed ExecuTorch API. OP-SQLite wrapper 0.9.0 requires OP-SQLite `^15.2.7`; pin compatible versions and verify the native build instead of mixing latest majors. [ExecuTorch peer dependencies](https://github.com/software-mansion-labs/react-native-rag/blob/68aad4dbc2caba5c4deda71dad08f14248ca91ce/packages/executorch/package.json), [OP-SQLite peer dependencies](https://github.com/software-mansion-labs/react-native-rag/blob/68aad4dbc2caba5c4deda71dad08f14248ca91ce/packages/op-sqlite/package.json), [Embeddings contract](https://github.com/software-mansion-labs/react-native-rag/blob/68aad4dbc2caba5c4deda71dad08f14248ca91ce/src/interfaces/embeddings.ts)

The installed 0.10.4 catalog provides `models.textEmbeddings.PARAPHRASE_MULTILINGUAL_MINILM_L12_V2.XNNPACK_FP32`. Resolve its resources to local paths, then use `createTextEmbedder({ modelPath, tokenizerPath })`. Its `embed()` returns `Float32Array`; `dispose()` releases resources. The model card includes Polish, 384 dimensions, mean pooling and a 128-token sequence limit. Use tokenizer-sized chunks and preserve headings rather than arbitrary long paragraphs. [ExecuTorch task source](https://github.com/software-mansion/react-native-executorch/blob/main/packages/react-native-executorch/src/extensions/nlp/tasks/textEmbedding.ts), [model catalog](https://github.com/software-mansion/react-native-executorch/blob/main/packages/react-native-executorch/src/models.ts), [model card](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2)

Build-time vectors and device queries must use matching weights, tokenizer, truncation, pooling and normalization. A desktop SentenceTransformer model with the same name does not prove parity with the exported `.pte`. Compare embeddings and Polish retrieval rankings before committing to the build pipeline. Follow-up research found that the published ExecuTorch program accepts 126 input tokens and adds two special tokens internally; its runtime version is 1.4.1. Use the same exported program for build-time indexing where possible. Bundle the embedding model and tokenizer as well if first-use retrieval must work without network access. [Build-time approach](./build-time-embeddings.md), [exported model card](https://huggingface.co/software-mansion/react-native-executorch-paraphrase-multilingual-MiniLM-L12-v2/blob/608cf9e40e4c815b05b9ee353c6b1974cd5b3b08/README.md)
