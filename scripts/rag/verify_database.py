#!/usr/bin/env python3
"""Exercise real PTE inference and the shipped corpus, without mock embeddings."""

import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import time

import numpy as np
from build_database import ASSETS, ROOT, Embedder, digest


def application_ranking(payload):
    result = subprocess.run(["node", "scripts/rag/evaluate_ranking.mjs"], cwd=ROOT,
                            input=json.dumps(payload, ensure_ascii=False), text=True,
                            capture_output=True, check=True)
    return json.loads(result.stdout)


def main():
    manifest = json.loads((ASSETS / "manifest.json").read_text())
    database = ASSETS / "knowledge_pl.db"
    assert digest(database) == manifest["database"]["sha256"], "Database checksum mismatch"
    connection = sqlite3.connect(f"file:{database}?mode=ro", uri=True)
    rows = connection.execute("SELECT id, document, embedding, metadata FROM vectors").fetchall()
    connection.close()
    assert len(rows) == manifest["database"]["chunks"]
    allowed = {item["id"] for item in json.loads((ROOT / "scripts/rag/sources.json").read_text())}
    for source in manifest["sources"]:
        path = source["file"] if source.get("type") == "web" else f'assets/offline/pdfs/{source["id"]}.pdf'
        assert digest(ROOT / path) == source["sha256"], f'Source changed since the build: {path}'
    vectors = []
    documents = []
    found_sources = set()
    for chunk_id, text, blob, metadata_json in rows:
        metadata = json.loads(metadata_json)
        assert metadata["language"] == "pl" and metadata["documentId"] in allowed
        source = next(source for source in manifest["sources"] if source["id"] == metadata["documentId"])
        if source.get("type") == "web":
            assert "page" not in metadata and metadata["url"].startswith("https://www.gov.pl/")
        else:
            assert 1 <= metadata["page"] <= source["pages"]
        assert metadata["sourceSha256"] == source["sha256"]
        vector = np.frombuffer(blob, dtype="<f4")
        assert vector.shape == (384,) and np.isfinite(vector).all()
        assert abs(float(np.linalg.norm(vector)) - 1) < 0.001
        vectors.append(vector)
        documents.append({**metadata, "id": chunk_id, "text": text})
        found_sources.add(metadata["documentId"])
    assert found_sources == allowed, "Missing Polish source"
    matrix = np.stack(vectors)
    embedder = Embedder()
    probe = embedder.embed(manifest["probe"]["text"])
    probe_index = next(index for index, document in enumerate(documents) if document["id"] == manifest["probe"]["id"])
    assert float(matrix[probe_index] @ probe) >= 0.995
    evaluation = json.loads((ROOT / "scripts/rag/evaluation.json").read_text())
    keyword_connection = sqlite3.connect(f"file:{database}?mode=ro", uri=True)
    assert keyword_connection.execute("SELECT COUNT(*) FROM keywords").fetchone()[0] == len(rows)
    # Known gaps are questions the corpus answers but retrieval still misses.
    # They are reported, not hidden, and do not fail the run until fixed.
    cases = evaluation["questions"] + evaluation["knownGaps"]
    # Known accepted questions are outside the corpus, yet a fragment passes the
    # similarity threshold on its own. Like known gaps, they are reported only.
    unrelated_cases = [{"question": question} if isinstance(question, str) else question
                       for question in evaluation["unrelated"] + evaluation["knownAccepted"]]
    prepared = application_ranking({"action": "prepare", "cases": cases + unrelated_cases})
    expressions = application_ranking({"action": "keywords", "config": manifest["retrieval"],
                                       "questions": [text or "" for text in prepared]})
    report = {"questions": [], "knownGaps": [], "unrelated": [], "knownAccepted": [], "chunks": len(rows)}
    failures = []

    def select(search_text, expression):
        # The same steps as the app: vector ranking, keyword candidates, fusion.
        scores = matrix @ embedder.embed(search_text)
        order = np.argsort(scores)[::-1]
        keyword_ids = [row[0] for row in keyword_connection.execute(
            "SELECT id FROM keywords WHERE keywords MATCH ? ORDER BY bm25(keywords) LIMIT ?",
            (expression, manifest["retrieval"]["keywordCandidates"]))] if expression else []
        vectors = [{**documents[int(index)], "similarity": float(scores[index])} for index in order]
        selected = application_ranking({"action": "rank", "config": manifest["retrieval"],
                                       "cases": [{"vectors": vectors, "keywordIds": keyword_ids}]})[0]
        return selected, float(scores[order[0]])

    def summary(selected):
        return [{"id": doc["id"], "similarity": round(doc["similarity"], 3)} for doc in selected]

    for number, (case, search_text, expression) in enumerate(zip(cases, prepared, expressions)):
        gap = number >= len(evaluation["questions"])
        started = time.perf_counter()
        selected, top = select(search_text, expression)
        # A hit is one fragment from an expected document that itself holds the
        # answer; a generic word somewhere in the selection proves nothing.
        rank = next((position for position, doc in enumerate(selected, 1)
                     if doc["documentId"] in case["documents"]
                     and any(term in doc["text"].lower() for term in case["answerTerms"])), None)
        hit = rank is not None
        report["knownGaps" if gap else "questions"].append({
            "question": case["question"], "searchText": search_text, "hit": hit, "rank": rank,
            "milliseconds": round((time.perf_counter() - started) * 1000), "results": summary(selected)})
        label = ("FIXED" if hit else "GAP") if gap else ("PASS" if hit else "MISS")
        print(f'{label} rank={rank} {case["question"]} top={top:.3f}', flush=True)
        if not hit and not gap:
            failures.append(case["question"])
    for number, (case, search_text, expression) in enumerate(zip(unrelated_cases, prepared[len(cases):], expressions[len(cases):], strict=True)):
        question = case["question"]
        known = number >= len(evaluation["unrelated"])
        # Rejected means the app would answer "no information": nothing is selected.
        selected, top = select(search_text, expression) if search_text is not None else ([], None)
        rejected = not selected
        report["knownAccepted" if known else "unrelated"].append({"question": question, "searchText": search_text, "maxSimilarity": top,
                                   "rejected": rejected, "results": summary(selected)})
        score = f"{top:.3f}" if top is not None else "outside scope"
        label = ("FIXED" if rejected else "KNOWN") if known else ("REJECT" if rejected else "ACCEPT")
        print(f'{label} {question} top={score}', flush=True)
        if not rejected and not known:
            failures.append(question)
    keyword_connection.close()
    report["recallAt4"] = sum(case["hit"] for case in report["questions"]) / len(evaluation["questions"])
    report["hitsAtRank1"] = sum(case["rank"] == 1 for case in report["questions"])
    report["meanReciprocalRank"] = round(sum(1 / case["rank"] for case in report["questions"] if case["rank"]) / len(evaluation["questions"]), 3)
    report["unrelatedRejected"] = sum(case["rejected"] for case in report["unrelated"])
    # Check vector arithmetic through libSQL too, rather than just numpy.
    subprocess.run(["uv", "run", "--python", "3.13", "--with", "libsql-experimental==0.0.55", "python", "-c",
                    "import libsql_experimental as l; import json; from pathlib import Path; "
                    "c=l.connect('assets/offline/rag/knowledge_pl.db'); "
                    "r=c.execute('SELECT document, 1-vector_distance_cos(embedding, embedding) FROM vectors LIMIT 1').fetchone(); "
                    "assert abs(r[1]-1)<0.0001; c.close()"], cwd=ROOT, check=True)
    (ROOT / "docs/research/rag-evaluation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(f"Corpus integrity passed. Recall@4: {report['recallAt4']:.0%}, "
          f"rank 1: {report['hitsAtRank1']}/{len(evaluation['questions'])}, MRR: {report['meanReciprocalRank']}")
    if failures:
        sys.exit(1)


if __name__ == "__main__":
    main()
