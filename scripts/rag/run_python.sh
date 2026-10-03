#!/usr/bin/env bash
set -euo pipefail

rag_project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
rag_runtime_dir="$rag_project_root/.rag-cache/runtime"
rag_requirements="$rag_project_root/scripts/rag/requirements.txt"
rag_lock_hash="$(shasum -a 256 "$rag_requirements" | cut -d ' ' -f 1)"

if [[ ! -f "$rag_runtime_dir/.ready" ]] || [[ "$(cat "$rag_runtime_dir/.ready")" != "$rag_lock_hash" ]]; then
  if [[ ! -x "$rag_runtime_dir/bin/python" ]]; then
    uv venv --python 3.14 "$rag_runtime_dir"
  fi
  # ExecuTorch imports export helpers even when only the runtime is needed.
  # These are the exact minimal, verified dependencies, with no training stack.
  uv pip install --python "$rag_runtime_dir/bin/python" --no-deps -r "$rag_requirements"
  uv pip install --python "$rag_runtime_dir/bin/python" --no-deps --prerelease allow \
    --index https://download.pytorch.org/whl/nightly/cpu torch==2.15.0.dev20261003
  "$rag_runtime_dir/bin/python" -c "from executorch.runtime import Runtime; assert Runtime.get().backend_registry.is_available('XnnpackBackend')"
  printf '%s' "$rag_lock_hash" > "$rag_runtime_dir/.ready"
fi

exec "$rag_runtime_dir/bin/python" "$@"
