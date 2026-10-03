import type { Source } from './types';

type RetrievalConfig = {
  minSimilarity: number;
  maxSources: number;
  reciprocalRankOffset: number;
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
  const ranked = vectors.map((source, index) => {
    const lexicalRank = lexicalRanks.get(source.id);
    const score = 1 / (config.reciprocalRankOffset + index + 1)
      + (lexicalRank ? 1 / (config.reciprocalRankOffset + lexicalRank) : 0);
    return { source, score };
  }).filter(({ source }) => Number.isFinite(source.similarity) && source.similarity >= config.minSimilarity)
    .sort((a, b) => b.score - a.score);
  const selected: Source[] = [];
  const pages = new Set<string>();
  for (const { source } of ranked) {
    const page = `${source.documentId}:${source.page ?? source.id}`;
    if (pages.has(page)) continue;
    pages.add(page);
    selected.push(source);
    if (selected.length === config.maxSources) break;
  }
  return selected;
}
