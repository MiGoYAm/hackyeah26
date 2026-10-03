import { OPSQLiteVectorStore } from '@react-native-rag/op-sqlite';

import manifest from '../../../assets/offline/rag/manifest.json';
import { prepareKnowledgeAssets } from './assets';
import { PolishEmbeddings } from './embeddings';
import { keywordExpression, selectSources } from './ranking';
import type { Source } from './types';

function toSource(row: Record<string, unknown>): Source {
  const metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : undefined;
  if (
    typeof row.id !== 'string' || typeof row.document !== 'string' || typeof row.similarity !== 'number' ||
    metadata?.language !== 'pl' || typeof metadata.documentId !== 'string' ||
    typeof metadata.title !== 'string' || typeof metadata.publisher !== 'string' || typeof metadata.year !== 'number' ||
    (typeof metadata.page !== 'number' && typeof metadata.url !== 'string')
  ) throw new Error('Nieprawidłowe źródło w bazie wiedzy.');
  return {
    id: row.id, documentId: metadata.documentId, title: metadata.title,
    publisher: metadata.publisher, year: metadata.year, page: metadata.page, url: metadata.url,
    text: row.document, similarity: row.similarity,
  };
}

type Retrieval = Awaited<ReturnType<typeof createRetrieval>>;
let shared: Promise<Retrieval> | undefined;
let closing: Promise<void> = Promise.resolve();
let leases = 0;

// React StrictMode may mount twice while native initialization is still running.
// Share that initialization and close only after the final screen releases it.
export async function acquireRetrieval() {
  leases += 1;
  shared ??= closing.then(createRetrieval);
  const initialization = shared;
  try {
    const service = await initialization;
    let released = false;
    return {
      service,
      release() {
        if (released) return;
        released = true;
        leases -= 1;
        if (leases === 0) {
          shared = undefined;
          // A failed close must not block the next screen from reopening the store.
          closing = service.dispose().catch(() => {});
        }
      },
    };
  } catch (error) {
    leases -= 1;
    if (leases === 0) shared = undefined;
    throw error;
  }
}

export async function createRetrieval() {
  const paths = await prepareKnowledgeAssets();
  const embeddings = new PolishEmbeddings(paths);
  let store: OPSQLiteVectorStore | undefined;
  try {
    await embeddings.load();
    store = new OPSQLiteVectorStore({ name: paths.databaseName, embeddings });
    // The file already has its schema. Avoid the wrapper's multi-statement
    // load() DDL, which is unsupported by the libSQL backend.
    const { rows } = await store.db.execute('SELECT COUNT(*) AS count FROM vectors');
    if (rows[0]?.count !== manifest.database.chunks) throw new Error('Niepełna baza wiedzy.');
    const keywords = await store.db.execute('SELECT COUNT(*) AS count FROM keywords');
    if (keywords.rows[0]?.count !== manifest.database.chunks) throw new Error('Niepełny indeks słów kluczowych.');
    const probeVector = await embeddings.embed(manifest.probe.text);
    const probe = await store.db.execute(
      'SELECT 1-vector_distance_cos(embedding, vector(?)) AS similarity FROM vectors WHERE id = ?',
      [JSON.stringify(probeVector), manifest.probe.id],
    );
    if (typeof probe.rows[0]?.similarity !== 'number' || probe.rows[0].similarity < 0.995) {
      throw new Error('Model wyszukiwania nie pasuje do bazy wiedzy.');
    }
    const loadedStore = store;
    return {
      async search(question: string): Promise<Source[]> {
        const vector = await embeddings.embed(question);
        // The adapter's query() returns every row with its embedding. Only rows
        // above the threshold can be selected, and they keep their rank.
        const results = await loadedStore.db.execute(
          'SELECT id, document, metadata, similarity FROM (SELECT id, document, metadata, ' +
          '1-vector_distance_cos(embedding, vector(?)) AS similarity FROM vectors) ' +
          'WHERE similarity >= ? ORDER BY similarity DESC',
          [JSON.stringify(vector), manifest.retrieval.minSimilarity],
        );
        const expression = keywordExpression(question, manifest.retrieval);
        const keywords = expression ? await loadedStore.db.execute(
          'SELECT id FROM keywords WHERE keywords MATCH ? ORDER BY bm25(keywords) LIMIT ?',
          [expression, manifest.retrieval.keywordCandidates],
        ) : undefined;
        return selectSources(results.rows.map(toSource), keywords?.rows.map((row) => String(row.id)) ?? [], manifest.retrieval);
      },
      async dispose() { await loadedStore.unload(); },
    };
  } catch (error) {
    await embeddings.unload();
    store?.db.close();
    throw error;
  }
}
