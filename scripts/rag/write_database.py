#!/usr/bin/env python3
"""Write the libSQL artifact from completed embedding records."""

import json
from pathlib import Path
import libsql_experimental as libsql

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets/offline/rag"


def main():
    temporary = ASSETS / "knowledge_pl.build.db"
    if temporary.exists():
        temporary.unlink()
    connection = libsql.connect(str(temporary))
    try:
        connection.execute("PRAGMA journal_mode=DELETE")
        connection.execute("PRAGMA user_version=2")
        connection.execute("CREATE TABLE vectors (id TEXT PRIMARY KEY, document TEXT NOT NULL, embedding F32_BLOB(384) NOT NULL, metadata JSON DEFAULT NULL)")
        connection.execute("CREATE VIRTUAL TABLE keywords USING fts5(id UNINDEXED, document, tokenize='unicode61 remove_diacritics 2')")
        with (ROOT / ".rag-cache/vectors.jsonl").open() as stream:
            for line in stream:
                chunk = json.loads(line)
                connection.execute("INSERT INTO vectors VALUES (?, ?, vector(?), ?)", (
                    chunk["id"], chunk["document"], json.dumps(chunk["embedding"]),
                    json.dumps(chunk["metadata"], ensure_ascii=False),
                ))
                connection.execute("INSERT INTO keywords(id, document) VALUES (?, ?)", (chunk["id"], chunk["document"]))
        # The RAG adapter uses an exact cosine scan. An ANN index adds size
        # without accelerating that query for this small corpus.
        connection.commit()
        if connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError("Corrupt database")
    finally:
        connection.close()
    temporary.replace(ASSETS / "knowledge_pl.db")


if __name__ == "__main__":
    main()
