import type { Source } from './types';

type RetrievalConfig = {
  minSimilarity: number;
  maxSources: number;
  keywordBoost: number;
  keywordPrefixLength: number;
  stopWords: string[];
};

export function keywordExpression(question: string, config: RetrievalConfig): string {
  const words = question.toLocaleLowerCase('pl').match(/[\p{L}\p{N}]+/gu) ?? [];
  const prefixes = words.filter((word) => word.length >= 4 && !config.stopWords.includes(word))
    .map((word) => word.slice(0, config.keywordPrefixLength));
  // BM25 ranks matching content words; a missing verb must not reject the topic.
  // The independent semantic threshold still filters unrelated matches.
  return [...new Set(prefixes)].slice(0, 12).map((word) => `"${word}"*`).join(' OR ');
}

export function selectSources(vectors: Source[], keywordIds: string[], config: RetrievalConfig): Source[] {
  const lexicalRanks = new Map(keywordIds.map((id, index) => [id, index + 1]));
  const ranked = vectors
    .filter((source) => Number.isFinite(source.similarity) && source.similarity >= config.minSimilarity)
    .map((source) => {
      const lexicalRank = lexicalRanks.get(source.id);
      // Matching the question's words adds to the similarity, most for the best
      // keyword match. Rank fusion let any fragment present in both lists pass
      // the closest semantic match, however weak its own similarity was.
      const bonus = lexicalRank ? config.keywordBoost * (1 - (lexicalRank - 1) / keywordIds.length) : 0;
      return { source, score: source.similarity + bonus };
    })
    .sort((a, b) => b.score - a.score);
  const selected: Source[] = [];
  const taken = new Map<string, number>();
  for (const { source } of ranked) {
    // One fragment per PDF page. A section of a gov.pl page can be much longer
    // than a page, so it may give two, but not crowd out every other source.
    const part = `${source.documentId}:${source.page ?? source.section}`;
    const count = taken.get(part) ?? 0;
    if (count >= (source.page ? 1 : 2)) continue;
    taken.set(part, count + 1);
    selected.push(source);
    if (selected.length === config.maxSources) break;
  }
  return selected;
}
