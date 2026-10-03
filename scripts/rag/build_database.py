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
MARGIN = 0.08
ICON_FONTS = {"Arrows"}
MIN_SECTION = 200
# Broken font maps turn "mówimy" into "mBwimy" without any replacement character.
BROKEN_LETTERS = re.compile(r"[a-ząćęłńóśźż][A-Z@][a-ząćęłńóśźż]")


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


def clean_page(text):
    text = unicodedata.normalize("NFKC", text).replace("\u00ad", "").replace("◻", "- ")
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", " ", text)
    text = re.sub(r"(\w)-\s*\n\s*(\w)", r"\1\2", text)
    lines = []
    for line in text.splitlines():
        line = re.sub(r"\s+", " ", line).strip()
        # Page footers, and list numbers the PDF stores apart from their items.
        if not line or re.fullmatch(r"(?:str\.\s*\d+\s*)+|\d+[.)]", line, re.IGNORECASE):
            continue
        if lines and line == lines[-1]:
            continue
        lines.append(line)
    return "\n".join(lines)


def clean_transcript(text):
    # Timestamps and screen descriptions are not advice; the film header repeats the title.
    text = re.sub(r"\[[^\]]*\]", " ", text)
    text = re.sub(r"^.*?Data publikacji:[^\n]*\n", "", text, flags=re.DOTALL)
    return re.sub(r"^\s*Narrator[^\n:]*:\s*$", "", text, flags=re.MULTILINE)


def extract_page(page):
    # Keep the original body order (column-by-column), but lift short headings
    # out of the top margin: many PDFs store them after the body, and leaving
    # them in the body too would spend the token budget on repeats.
    height = page.rect.height
    headings = []
    body = []
    for block in page.get_text("dict")["blocks"]:
        if block["type"] != 0:
            continue
        lines = []
        for line in block["lines"]:
            # Rotated side labels repeat the chapter name on every page.
            if abs(line["dir"][0] - 1) > 0.01:
                continue
            text = "".join(span["text"] for span in line["spans"] if span["font"] not in ICON_FONTS)
            margin = line["bbox"][1] < height * MARGIN or line["bbox"][3] > height * (1 - MARGIN)
            if margin and re.fullmatch(r"\s*\d+\s*", text):
                continue
            lines.append(text)
        text = "\n".join(lines)
        heading = re.sub(r"\s+", " ", clean_page(text)).strip()
        if block["bbox"][1] <= height * MARGIN and 4 <= len(heading) <= 100:
            if heading not in headings:
                headings.append(heading)
        else:
            body.append(text)
    return " / ".join(headings)[:140], "\n".join(body)


def is_subheading(line, following):
    # gov.pl pages mark most of their headings only by layout: a short line
    # without closing punctuation, followed by a paragraph or a list.
    return (3 <= len(line) <= 70 and len(line.split()) <= 9 and line[-1] not in ".,;:!"
            and not line.startswith(("-", "http")) and following is not None
            and (following.startswith("-") or len(following) > len(line)))


def web_sections(text):
    # Only the page's own text: attachments are separate sources or unusable scans.
    lines = []
    inside = False
    for line in text.splitlines():
        if line.startswith("## Ze strony"):
            inside = True
        elif line.startswith(("## Z załącznika", "## Uwaga o załączniku")):
            break
        elif inside and line.strip() not in ("", "---", "-"):
            lines.append(line.strip())
    sections = [["", []]] if lines else []
    for index, line in enumerate(lines):
        following = lines[index + 1] if index + 1 < len(lines) else None
        marked = line.startswith("## ")
        line = line.removeprefix("## ")
        # Callouts such as "## UWAGA!" introduce a sentence, not a section.
        # The first line repeats the page title, which every fragment already carries.
        if index and (marked and not line.endswith("!") or not marked and is_subheading(line, following)):
            sections.append([line.rstrip(":"), []])
        elif index:
            sections[-1][1].append(line)
    merged = []
    for heading, body in sections:
        # A section too short to stand alone stays with the text before it.
        if merged and sum(map(len, body)) < MIN_SECTION:
            merged[-1][1].extend([heading, *body])
        else:
            merged.append([heading, body])
    return [(heading, "\n".join(body)) for heading, body in merged]


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

    def add(source, source_hash, part, text, heading, page=None):
        for document in split_page(text, heading, tokenizer):
            text_hash = hashlib.sha256(document.encode()).hexdigest()
            if text_hash in seen:
                continue
            seen.add(text_hash)
            # Only what the app shows and what verification traces back to the source.
            metadata = {
                "documentId": source["id"], "title": source["title"], "publisher": source["publisher"],
                "language": source["language"], "section": heading, "sourceSha256": source_hash,
                **{key: source[key] for key in ("year", "url") if key in source},
            }
            if page is not None:
                metadata["page"] = page
            chunks.append({"id": f'{source["id"]}:{part}:{text_hash[:12]}', "document": document, "metadata": metadata})

    for source in sources:
        if source["language"] != "pl":
            raise ValueError("Only Polish sources are allowed")
        if source.get("type") == "web":
            path = ROOT / source["file"]
            source_hash = digest(path)
            source_manifest.append({**source, "sha256": source_hash})
            sections = web_sections(path.read_text())
            if not sections:
                raise ValueError(f"No page text: {path}")
            for index, (section, raw_text) in enumerate(sections, 1):
                text = clean_page(raw_text)
                audit_pages.append({"documentId": source["id"], "section": section, "text": text})
                heading = " / ".join(filter(None, [source["title"], section]))[:140]
                add(source, source_hash, f"s{index}", text, heading)
            print(f'{source["id"]}: {len(sections)} sections', flush=True)
            continue
        path = ROOT / "assets/offline/pdfs" / (source["id"] + ".pdf")
        reader = pymupdf.open(path)
        source_hash = digest(path)
        source_manifest.append({**source, "sha256": source_hash, "pages": len(reader)})
        broken = 0
        for page_number, page in enumerate(reader, 1):
            heading, raw_text = extract_page(page)
            if "\x00" in raw_text or "\ufffd" in raw_text:
                raise ValueError(f"Invalid Unicode extraction: {path}, page {page_number}")
            broken += len(BROKEN_LETTERS.findall(raw_text))
            text = clean_page(clean_transcript(raw_text) if source.get("transcript") else raw_text)
            audit_pages.append({"documentId": source["id"], "page": page_number, "heading": heading, "text": text})
            # Covers, table of contents and colophons are not actionable evidence.
            contents_heading = re.sub(r"\s+", "", heading + text[:500]).upper()
            if "SPISTREŚCI" in contents_heading:
                continue
            if len(text) < 80:
                continue
            # A page without its own heading is still about its document's topic.
            add(source, source_hash, f"p{page_number}", text, heading or source["title"], page_number)
        if broken > 10:
            raise ValueError(f"Broken Polish letters in the text layer: {path}")
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
