#!/usr/bin/env python3
"""Fetch pinned embedding resources, checking every range and final SHA-256."""

import concurrent.futures
import hashlib
import json
from pathlib import Path
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
REVISION = "608cf9e40e4c815b05b9ee353c6b1974cd5b3b08"
BASE_URL = f"https://huggingface.co/software-mansion/react-native-executorch-paraphrase-multilingual-MiniLM-L12-v2/resolve/{REVISION}"
RESOURCES = [
    {
        "filename": "multilingual_minilm.original.json",
        "remote": "tokenizer.json",
        "size": 17082987,
        "sha256": "cad551d5600a84242d0973327029452a1e3672ba6313c2a3c3d69c4310e12719",
    },
    {
        "filename": "multilingual_minilm_fp32.pte",
        "remote": "xnnpack/paraphrase_multilingual_minilm_l12_v2_xnnpack_fp32.pte",
        "size": 470258816,
        "sha256": "25e273575a9a04c2a460c040b1011ac397211d304f9fdaf3bb2506bfb87e95e8",
    },
]


def sha256(path):
    with path.open("rb") as stream:
        digest = hashlib.sha256()
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
        return digest.hexdigest()


def download(resource):
    target = ROOT / "assets/offline/rag/models" / resource["filename"]
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and sha256(target) == resource["sha256"]:
        print(f"Verified {target.name}", flush=True)
        return
    cache = ROOT / ".rag-cache/downloads" / resource["filename"]
    cache.mkdir(parents=True, exist_ok=True)
    block_size = 2 * 1024 * 1024
    ranges = [(start, min(start + block_size, resource["size"]) - 1)
              for start in range(0, resource["size"], block_size)]
    url = f'{BASE_URL}/{resource["remote"]}'

    def fetch(bounds):
        start, end = bounds
        part = cache / str(start)
        if part.exists() and part.stat().st_size == end - start + 1:
            return part
        for attempt in range(5):
            try:
                # Distinct URLs avoid intermediaries reusing a different range.
                request = urllib.request.Request(
                    f"{url}?range={start}", headers={"Range": f"bytes={start}-{end}"})
                with urllib.request.urlopen(request, timeout=90) as response:
                    expected = f'bytes {start}-{end}/{resource["size"]}'
                    if response.status != 206 or response.headers.get("Content-Range") != expected:
                        raise RuntimeError(f"Server did not return {expected}")
                    data = response.read()
                if len(data) != end - start + 1:
                    raise RuntimeError("Incomplete download range")
                temporary = part.with_suffix(".partial")
                temporary.write_bytes(data)
                temporary.replace(part)
                return part
            except Exception:
                if attempt == 4:
                    raise
                time.sleep(attempt + 1)
        raise RuntimeError("Download failed")

    with concurrent.futures.ThreadPoolExecutor(max_workers=24) as executor:
        for count, _ in enumerate(executor.map(fetch, ranges), 1):
            if count % 10 == 0 or count == len(ranges):
                print(f'{target.name}: {count}/{len(ranges)} ranges', flush=True)
    temporary = target.with_suffix(".partial")
    with temporary.open("wb") as stream:
        for start, _ in ranges:
            stream.write((cache / str(start)).read_bytes())
    if sha256(temporary) != resource["sha256"]:
        temporary.unlink()
        raise RuntimeError(f"SHA-256 mismatch: {target.name}; remove {cache} and retry")
    temporary.replace(target)
    print(f"Downloaded and verified {target.name}", flush=True)


if __name__ == "__main__":
    for resource in RESOURCES:
        download(resource)
    model_directory = ROOT / "assets/offline/rag/models"
    tokenizer = json.loads((model_directory / "multilingual_minilm.original.json").read_text())
    # The PTE wraps XLM-R IDs 0/2 itself. Native and build tooling both use
    # this tokenizer, so neither adds a second pair nor pads to 128 tokens.
    tokenizer.update(post_processor=None, truncation=None, padding=None)
    (model_directory / "multilingual_minilm.tokenizer").write_text(
        json.dumps(tokenizer, ensure_ascii=False, separators=(",", ":")))
    (ROOT / "assets/offline/rag/models/resources.json").write_text(
        json.dumps({"revision": REVISION, "files": RESOURCES}, indent=2) + "\n")
