// Said by the app when the search finds nothing, and by the model when the sources lack the answer.
export const NO_ANSWER = 'Nie znalazłem informacji na ten temat w polskich poradnikach.';

const MIN_REPEATED_SENTENCE = 25;
const REPEATED_TAIL = 80;

// The native runner exposes no repetition penalty, so a looping answer has to be
// caught here. Returns the offset where repeated content starts, or -1.
export function repetitionStart(text: string): number {
  'worklet';
  const seen: string[] = [];
  // Only terminated sentences count: an unfinished one may still diverge.
  const sentences = /[^.!?\n]*[.!?\n]+/g;
  let match: RegExpExecArray | null;
  while ((match = sentences.exec(text)) !== null) {
    const key = match[0].toLowerCase().replace(/\[\d+\]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (key.length < MIN_REPEATED_SENTENCE) continue;
    if (seen.includes(key)) return match.index;
    seen.push(key);
  }
  // Loops without punctuation: the newest characters already occurred verbatim.
  let second = text.length - REPEATED_TAIL;
  if (second <= 0) return -1;
  let first = text.indexOf(text.slice(second));
  if (first + REPEATED_TAIL > second) return -1;
  while (first > 0 && second > first + REPEATED_TAIL && text[first - 1] === text[second - 1]) {
    first -= 1;
    second -= 1;
  }
  return second;
}

// Preserve Markdown and internal whitespace for both streamed and final replies.
export function cleanAnswer(text: string): string {
  return text.trim();
}

// A small model sometimes cites a source it was never given; drop that number, keep the advice.
// Lists and ranges such as [1, 2] or [1-3] become [1][2][3], the only form the chat resolves.
export function dropUnknownCitations(text: string, sourceCount: number): string {
  return text
    .replace(/([ \t]*)\[(\d+(?:\s*[,;–-]\s*\d+)*)\]/g, (_, space: string, list: string) => {
      const references = new Set<number>();
      for (const part of list.split(/[,;]/)) {
        const [first, last = first] = part.split(/[–-]/).map(Number);
        for (let reference = Math.max(first, 1); reference <= Math.min(last, sourceCount); reference += 1) {
          references.add(reference);
        }
      }
      return references.size ? space + [...references].map((reference) => `[${reference}]`).join('') : '';
    })
    .trim();
}

export function finalizeAnswer(text: string): string {
  const repeated = repetitionStart(text);
  if (repeated === -1) return cleanAnswer(text);
  // Drop a list marker left dangling in front of the removed repetition.
  return cleanAnswer(text.slice(0, repeated)).replace(/\n[ \t]*(?:\d+[.)]|-)?[ \t]*$/, '').trim();
}
