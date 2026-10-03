#!/usr/bin/env python3
"""Build the shipped corpus with the exact on-device ExecuTorch PTE."""

import hashlib
import json
from pathlib import Path
import re
import unicodedata
import subprocess

import numpy as np
import pymupdf
from tokenizers import Tokenizer
import torch
from executorch.runtime import Runtime

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets/offline/rag"
MODEL_PATH = ASSETS / "models/multilingual_minilm_fp32.pte"
TOKENIZER_PATH = ASSETS / "models/multilingual_minilm.tokenizer"
MAX_INPUT_TOKENS = 126


def digest(path, algorithm="sha256"):
    value = hashlib.new(algorithm)
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


class Embedder:
    def __init__(self):
        self.tokenizer = Tokenizer.from_file(str(TOKENIZER_PATH))
        self.runtime = Runtime.get()
        if not self.runtime.backend_registry.is_available("XnnpackBackend"):
            raise RuntimeError("ExecuTorch runtime has no XNNPACK backend")
        self.program = self.runtime.load_program(str(MODEL_PATH))
        self.forward = self.program.load_method("forward")
        torch.set_num_threads(4)

    def embed(self, text):
        ids = self.tokenizer.encode(text, add_special_tokens=False).ids[:MAX_INPUT_TOKENS]
        if not ids:
            raise ValueError("Cannot embed empty text")
        inputs = torch.tensor([ids], dtype=torch.int64)
        mask = torch.ones_like(inputs)
        with torch.inference_mode():
            vector = self.forward.execute([inputs, mask])[0].reshape(-1).numpy().copy()
        if vector.shape != (384,) or not np.isfinite(vector).all():
            raise ValueError("Invalid embedding from model")
        # Mean pooling, special tokens and normalization are inside the PTE.
        return vector


def clean_page(text, page_number):
    text = unicodedata.normalize("NFKC", text).replace("\u00ad", "")
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", " ", text)
    text = re.sub(r"(\w)-\s*\n\s*(\w)", r"\1\2", text)
    lines = []
    for line in text.splitlines():
        line = re.sub(r"\s+", " ", line).strip()
        if not line or re.fullmatch(r"(?:str\.\s*\d+\s*)+", line, re.IGNORECASE):
            continue
        if lines and line == lines[-1]:
            continue
        lines.append(line)
    if lines and lines[-1] == str(page_number):
        lines.pop()
    return "\n".join(lines)


def page_heading(page):
    # Preserve original body order (column-by-column), but recover short
    # headings from their visual position: many PDFs store them after the body.
    blocks = sorted(page.get_text("blocks"), key=lambda block: (block[1], block[0]))
    headings = []
    for block in blocks:
        if block[6] != 0 or block[1] > page.rect.height * 0.08:
            continue
        text = re.sub(r"\s+", " ", clean_page(block[4], -1)).strip()
        if 4 <= len(text) <= 100 and text not in headings:
            headings.append(text)
    return " / ".join(headings)[:140]


def split_page(text, title, tokenizer):
    prefix = title + "\n" if title else ""
    budget = min(100, MAX_INPUT_TOKENS - len(tokenizer.encode(prefix, add_special_tokens=False).ids) - 4)
    encoding = tokenizer.encode(text, add_special_tokens=False)
    start = 0
    while start < len(encoding.ids):
        end = min(start + budget, len(encoding.ids))
        if end == len(encoding.ids) and start > 0:
            # Keep the final fragment substantial, rather than embedding an
            # isolated list tail whose heading dominates its meaning.
            start = max(0, end - budget)
        # Prefer ending at a sentence or line boundary in the final third.
        if end < len(encoding.ids):
            for candidate in range(end, start + budget * 2 // 3, -1):
                offset = encoding.offsets[candidate - 1][1]
                if text[max(0, offset - 1):offset] in ".!?" or text[offset:offset + 1] == "\n":
                    end = candidate
                    break
        # Avoid cutting the first or final word in half at subword offsets.
        lower = encoding.offsets[start][0]
        upper = encoding.offsets[end - 1][1]
        while upper < len(text) and text[upper].isalnum() and end > start + 1:
            end -= 1
            upper = encoding.offsets[end - 1][1]
        while lower > 0 and text[lower - 1].isalnum():
            start += 1
            lower = encoding.offsets[start][0]
        body = text[lower:upper].strip()
        document = prefix + body
        if len(body) >= 35:
            if len(tokenizer.encode(document, add_special_tokens=False).ids) > MAX_INPUT_TOKENS:
                raise ValueError("Chunk exceeds native embedding input length")
            yield document
        if end >= len(encoding.ids):
            break
        start = max(start + 1, end - 18)


def build_chunks(tokenizer):
    sources = json.loads((ROOT / "scripts/rag/sources.json").read_text())
    chunks = []
    source_manifest = []
    audit_pages = []
    seen = set()
    for source in sources:
        if source["language"] != "pl":
            raise ValueError("Only Polish sources are allowed")
        path = ROOT / "assets/offline/pdfs" / (source["id"] + ".pdf")
        reader = pymupdf.open(path)
        source_hash = digest(path)
        source_manifest.append({**source, "sha256": source_hash, "pages": len(reader)})
        for page_number, page in enumerate(reader, 1):
            raw_text = page.get_text()
            if "\x00" in raw_text or "\ufffd" in raw_text:
                raise ValueError(f"Invalid Unicode extraction: {path}, page {page_number}")
            text = clean_page(raw_text, page_number)
            heading = page_heading(page)
            audit_pages.append({"documentId": source["id"], "page": page_number, "text": text})
            # Covers, table of contents and colophons are not actionable evidence.
            contents_heading = re.sub(r"\s+", "", heading + text[:500]).upper()
            if "SPISTREŚCI" in contents_heading:
                continue
            if len(text) < 80:
                continue
            for document in split_page(text, heading, tokenizer):
                text_hash = hashlib.sha256(document.encode()).hexdigest()
                if text_hash in seen:
                    continue
                seen.add(text_hash)
                chunk_id = f'{source["id"]}:p{page_number}:{text_hash[:12]}'
                metadata = {
                    **source, "documentId": source["id"], "page": page_number, "section": heading,
                    "sourcePath": str(path.relative_to(ROOT)), "sourceSha256": source_hash,
                }
                chunks.append({"id": chunk_id, "document": document, "metadata": metadata})
        print(f'{source["id"]}: {len(reader)} PDF pages', flush=True)
        reader.close()
    cache = ROOT / ".rag-cache"
    cache.mkdir(exist_ok=True)
    (cache / "pages.json").write_text(json.dumps(audit_pages, ensure_ascii=False, indent=2))
    (cache / "chunks.json").write_text(json.dumps(chunks, ensure_ascii=False, indent=2))
    return chunks, source_manifest


def main():
    resources = json.loads((ASSETS / "models/resources.json").read_text())
    for resource in resources["files"]:
        path = ASSETS / "models" / resource["filename"]
        if digest(path) != resource["sha256"]:
            raise ValueError(f'Invalid model resource: {resource["filename"]}')
    embedder = Embedder()
    chunks, sources = build_chunks(embedder.tokenizer)
    if not chunks:
        raise ValueError("Empty Polish corpus")
    with (ROOT / ".rag-cache/vectors.jsonl").open("w") as stream:
        for index, chunk in enumerate(chunks, 1):
            vector = embedder.embed(chunk["document"])
            stream.write(json.dumps({**chunk, "embedding": vector.tolist()}, ensure_ascii=False) + "\n")
            if index % 25 == 0:
                print(f"Embedded {index}/{len(chunks)} chunks", flush=True)
    # libSQL currently provides macOS wheels for Python <=3.13, while the
    # ExecuTorch tool environment uses 3.14. Keep the storage step independent.
    subprocess.run(["uv", "run", "--python", "3.13", "--with", "libsql-experimental==0.0.55",
                    "python", str(ROOT / "scripts/rag/write_database.py")], check=True)
    database = ASSETS / "knowledge_pl.db"
    database_hash = digest(database)
    manifest = {
        "schemaVersion": 2,
        "database": {
            "filename": f"knowledge_pl_{database_hash[:12]}.db", "sha256": database_hash,
            "md5": digest(database, "md5"), "size": database.stat().st_size, "chunks": len(chunks),
        },
        "model": {
            "id": "paraphrase-multilingual-MiniLM-L12-v2", "revision": resources["revision"],
            "sha256": digest(MODEL_PATH), "size": MODEL_PATH.stat().st_size,
            "tokenizerSha256": digest(TOKENIZER_PATH), "tokenizerMd5": digest(TOKENIZER_PATH, "md5"),
            "tokenizerSize": TOKENIZER_PATH.stat().st_size, "dimensions": 384,
            "maxInputTokens": MAX_INPUT_TOKENS, "normalization": "PTE mean pooling + L2",
        },
        "sources": sources,
        "probe": {"text": chunks[0]["document"], "id": chunks[0]["id"]},
        "retrieval": json.loads((ROOT / "scripts/rag/retrieval.json").read_text()),
    }
    (ASSETS / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(f"Built {database}: {len(chunks)} chunks, {database.stat().st_size} bytes", flush=True)


if __name__ == "__main__":
    main()
