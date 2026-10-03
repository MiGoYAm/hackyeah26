# Exact build-time embeddings

Checked 2026-10-03 using Context7, official source, package metadata and real Python/native execution of the exported `.pte`.

Implementation note: both paths use the verified canonical tokenizer. The app uses `preprocessor.render(..., { addGenPrompt: true }).text` for each complete bounded prompt, rather than the stateful `process()` path described below. See [current setup](../RAG.md).

## Pin the exported model

The installed React Native ExecuTorch 0.10.4 catalog uses `models.textEmbeddings.PARAPHRASE_MULTILINGUAL_MINILM_L12_V2.XNNPACK_FP32`, with HF revision `v0.10.0`. That revision resolves to `608cf9e40e4c815b05b9ee353c6b1974cd5b3b08`. Download these files from the same revision:

- `xnnpack/paraphrase_multilingual_minilm_l12_v2_xnnpack_fp32.pte`
- `tokenizer.json`

The model card requires ExecuTorch 1.4.1, matching the installed native header `third-party/include/executorch/runtime/core/version.h`. The program takes two `int64` tensors with batch size 1, token IDs and an attention mask. It outputs `[1,384]` float32. It adds XLM-R start/end tokens itself, applies mean pooling and L2 normalization, and accepts at most 126 input tokens. Do not apply pooling or normalization a second time. FP32 is roughly 448 MiB, plus a 16.3 MB tokenizer. [Pinned model card](https://huggingface.co/software-mansion/react-native-executorch-paraphrase-multilingual-MiniLM-L12-v2/blob/608cf9e40e4c815b05b9ee353c6b1974cd5b3b08/README.md), [input/output configuration](https://huggingface.co/software-mansion/react-native-executorch-paraphrase-multilingual-MiniLM-L12-v2/blob/608cf9e40e4c815b05b9ee353c6b1974cd5b3b08/xnnpack/config.json)

## Python runtime on this Mac

PyPI provides `executorch==1.4.1` wheels for macOS 14+ arm64 and CPython 3.10 through 3.14. Prefer an isolated CPython 3.12 environment; the system Python 3.9 cannot use them. The full wheel contains runtime bindings and XNNPACK. A minimal wheel omits runtime bindings and cannot execute this model. [Versioned wheel metadata](https://pypi.org/pypi/executorch/1.4.1/json), [wheel documentation](https://github.com/pytorch/executorch/blob/v1.4.1/README-wheel.md)

Important dependencies from the pinned wheel metadata are `torch>=2.13.0a0`, `torchao>=0.18.0`, `pytorch-tokenizers>=1.4.1`, `numpy>=2.0.0`, and `coremltools==9.0` on supported Macs. It also declares `expecttest`, `flatbuffers`, `hypothesis`, `kgb`, `mpmath==1.3.0`, `packaging`, `pandas>=2.2.2`, `parameterized`, `py-cpuinfo`, `pyyaml`, `ruamel.yaml`, `sympy`, `tabulate`, `typing-extensions>=4.10.0`, `scikit-learn>=1.7.1`, `hydra-core>=1.3.0`, and `omegaconf>=2.3.0`. Use normal dependency resolution first; if its required PyTorch version is not on the release index, resolve it from the official nightly CPU index with `--pre`, then record the exact working versions. Do not install this into the project JS dependencies. [Pinned metadata](https://pypi.org/pypi/executorch/1.4.1/json), [official source installation](https://github.com/pytorch/executorch/blob/main/docs/source/using-executorch-building-from-source.md)

```bash
python3.12 -m venv /tmp/hackyeah-rag-python
/tmp/hackyeah-rag-python/bin/python -m pip install executorch==1.4.1 tokenizers
```

### Verified installation on this Mac

An isolated CPython 3.14.8 environment at `/tmp/hackyeah-rag-runtime` successfully imports `Runtime` from the 1.4.1 wheel and registers `XnnpackBackend`. Stable `torch==2.12.0` failed with a missing `_pthreadpool_create_v2` symbol. The official nightly index resolved `torch==2.15.0.dev20261003`, which passed both runtime import and actual model inference. Commands used:

```bash
uv venv --python /opt/homebrew/bin/python3.14 /tmp/hackyeah-rag-runtime
uv pip install --python /tmp/hackyeah-rag-runtime/bin/python --no-deps executorch==1.4.1 numpy==2.5.3 tokenizers==0.23.2 pytorch-tokenizers==1.4.1 torchao==0.18.0 typing-extensions==4.16.0 filelock==4.0.9 sympy==1.14.0 networkx==3.7 jinja2==3.1.6 fsspec==2026.9.0 setuptools==84.0.0 mpmath==1.4.1 markupsafe==3.0.4 packaging==26.3 flatbuffers==25.12.19 ruamel.yaml==0.19.1 pyyaml==6.0.3 expecttest==0.3.0 hypothesis==6.168.3 kgb==7.3 parameterized==0.9.0 tabulate==0.10.0 sortedcontainers==2.4.0
uv pip install --python /tmp/hackyeah-rag-runtime/bin/python --no-deps --prerelease allow --index https://download.pytorch.org/whl/nightly/cpu torch==2.15.0.dev20261003
```

The `--no-deps` installation intentionally avoids export-only dependency overhead; its versions do not satisfy every declared package constraint. Treat it as a tested runtime environment and preserve the pinned versions. The full freeze is `/tmp/hackyeah-rag-runtime-freeze.txt`. [Official nightly index guidance](https://github.com/pytorch/executorch/blob/main/README.md)

## Identical token IDs and forward execution

React Native uses `pytorch::tokenizers::HFTokenizer`. The published JSON includes `<s>A</s>` TemplateProcessing, 128-token truncation and BatchLongest padding. A real simulator test against the installed native framework showed that `encode(text,0,0)` returns IDs without the special tokens, exactly matching Python HF `encode(text, add_special_tokens=False)` for the Polish sample below. Keep the published tokenizer bytes; no preprocessing rewrite is needed. The embedding task truncates those IDs to the model's schema limit and sets every attention-mask element to 1. The native source comment about JSON post-processing does not fully describe the tested `bos=0,eos=0` behavior. [Published tokenizer](https://huggingface.co/software-mansion/react-native-executorch-paraphrase-multilingual-MiniLM-L12-v2/blob/608cf9e40e4c815b05b9ee353c6b1974cd5b3b08/tokenizer.json), [native wrapper](https://github.com/software-mansion/react-native-executorch/blob/main/packages/react-native-executorch/cpp/extensions/nlp/tokenizer.cpp), [embedding task](https://github.com/software-mansion/react-native-executorch/blob/main/packages/react-native-executorch/src/extensions/nlp/tasks/textEmbedding.ts), [HF Python encode](https://github.com/huggingface/tokenizers/blob/main/bindings/python/src/tokenizer.rs)

Simulator check on the booted iPhone 17 Pro used a small `/tmp` C++ executable linked against the installed `ExecutorchLib.xcframework` simulator framework. Both MiniLM Unigram and Distiluse WordPiece tokenizers loaded successfully. For `Jak przygotować plecak ewakuacyjny podczas powodzi?`, MiniLM returned `[4422,182960,85385,92,28,634,56056,60470,19219,160,15263,708,32]`, matching HF with special tokens disabled. A canonical copy with `post_processor`, `padding`, and `truncation` set to `null` passed the same native check and returned identical IDs. The application may use that canonical copy on both indexing and device paths. PyPI `pytorch-tokenizers` 1.4.1 and 1.5.0 both failed these files, because their C++ tokenizer implementation differs from the native framework. Do not use that Python package as a native parity proxy.

```python
import json
from pathlib import Path

import torch
from executorch.runtime import Runtime
from tokenizers import Tokenizer

root = Path("assets/offline/models/embeddings")
tokenizer_path = root / "tokenizer.json"
tokenizer = Tokenizer.from_file(str(tokenizer_path))

runtime = Runtime.get()
assert runtime.backend_registry.is_available("XnnpackBackend")
program = runtime.load_program(
    root / "paraphrase_multilingual_minilm_l12_v2_xnnpack_fp32.pte"
)
forward = program.load_method("forward")
assert forward is not None

def embed(text: str) -> list[float]:
    ids = tokenizer.encode(text, add_special_tokens=False).ids[:126]
    if not ids:
        raise ValueError("Empty embedding input")
    tokens = torch.tensor([ids], dtype=torch.int64)
    mask = torch.ones((1, len(ids)), dtype=torch.int64)
    vector = forward.execute([tokens, mask])[0].reshape(-1).clone()
    assert vector.numel() == 384 and torch.isfinite(vector).all()
    assert abs(float(torch.linalg.vector_norm(vector)) - 1.0) < 1e-3
    return vector.tolist()
```

Load `program` and `forward` once and reuse them for every chunk. The runtime API and XNNPACK registry check are public in 1.4.1. Validate dynamic input lengths against the downloaded program rather than assuming its configuration's example length requires padding. [Versioned runtime API](https://github.com/pytorch/executorch/blob/v1.4.1/runtime/__init__.py)

### Verified native embedding parity

The complete downloaded `.pte` and canonical tokenizer executed successfully through both Python `Runtime.load_program().load_method('forward').execute(...)` and an iOS simulator CLI linked against the project's actual native framework, XNNPACK backend and threadpool archive. For `Jak przygotować plecak ewakuacyjny podczas powodzi?`, both returned 384 finite float32 values with L2 norm 1. Their float32 vectors were bit identical, with maximum absolute difference 0, RMSE 0, and cosine similarity 1. This checks one Polish input, not corpus-wide retrieval quality.

Temporary validation artifacts are `/tmp/hackyeah-embedding-test.cpp`, `/tmp/hackyeah-embedding-test`, `/tmp/hackyeah-native-embedding.json` and `/tmp/hackyeah-python-embedding.json`. The native CLI uses `tokenizers::HFTokenizer::encode(text,0,0)`, two `from_blob(..., ScalarType::Long)` tensors and `executorch::extension::Module::forward`. It requires force-linking `libXnnpackBackend.a` and linking `libthreadpool_simulator.a`. [Module API](https://github.com/pytorch/executorch/blob/v1.4.1/docs/source/extension-module.md), [tensor API](https://github.com/pytorch/executorch/blob/v1.4.1/docs/source/extension-tensor.md)

## Database and fallback

The Python `libsql-experimental` package has macOS arm64 wheels and a sqlite3-style local connection. The maintained `libsql` package uses the same libSQL engine family. Verify `SELECT vector('[1,2,3]')`, `vector_distance_cos` and the intended index parameters before generating the artifact, then reopen the database on native OP-SQLite. Do not substitute the newer Turso rewrite when building the libsql database. Commit and checkpoint the WAL before shipping the main file. [Python package](https://pypi.org/project/libsql-experimental/), [driver engines](https://docs.turso.tech/sdk/python/reference), [libSQL vector functions](https://docs.turso.tech/features/ai-and-embeddings)

The maintained `libsql` package did not provide a usable CPython 3.14 macOS wheel in the installation test. Use a separate compatible Python environment or pass embedding output to a Node libsql builder, rather than requiring it in the verified 3.14 inference environment.

If Python runtime installation or model execution fails, native artifacts already exist in `node_modules/react-native-executorch/third-party`: iOS device and simulator ExecuTorch frameworks, iOS XNNPACK archives, and Android `.so` libraries. They are built for iOS/Android, so they are not macOS CLI libraries. Use a temporary iOS simulator indexing tool with the existing `.pte`, tokenizer and `createTextEmbedder`, then export the completed SQLite database. Another option is building ExecuTorch 1.4.1 desktop bindings with XNNPACK. Neither fallback should silently switch to a different embedding model. [Native artifact downloader](https://github.com/software-mansion/react-native-executorch/blob/main/packages/react-native-executorch/scripts/download-libs.js), [desktop installation](https://github.com/pytorch/executorch/blob/main/docs/source/using-executorch-building-from-source.md)

## Bounded RAG chat without weight reload

The installed library publicly exposes `llm.createLLMRunner`, `llm.createChatPreprocessor`, and `llm.parseTokenizerConfig` through the `llm` namespace. The runner has `reset()`, `generate()`, `stop()` and `getKVCacheState()`. Create it once with local model/tokenizer paths. For each turn, reset its KV cache, build an app-owned history containing only recent clean user/assistant messages and the current retrieved context, then call `preprocessor.process(history, history.length)`. This formats the full bounded history with the model's Jinja template. Execute generation through `wrapAsync` on a worklet runtime and send token updates through `scheduleOnRN`. Filter parsed stop tokens as the built-in chat session does. Call `preprocessor.clear()` after generation and dispose resources on teardown. [Runner](https://github.com/software-mansion/react-native-executorch/blob/main/packages/react-native-executorch/src/extensions/llm/llmRunner.ts), [preprocessor](https://github.com/software-mansion/react-native-executorch/blob/main/packages/react-native-executorch/src/extensions/llm/utils/chatPreprocessor.ts), [built-in generation wrapper](https://github.com/software-mansion/react-native-executorch/blob/main/packages/react-native-executorch/src/extensions/llm/tasks/llmChatSession.ts)

`createLLMChatSession` retains its own history and exposes no history replacement/reset operation. `resetOnTurn` resets the KV cache but still prefills the entire accumulated history, so it does not bound history or remove old retrieval context. The low-level runner API is experimental; pin the installed library version. [Session implementation](https://github.com/software-mansion/react-native-executorch/blob/main/packages/react-native-executorch/src/extensions/llm/tasks/llmChatSession.ts)
