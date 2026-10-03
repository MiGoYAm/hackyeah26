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

// The chat renders plain text, so Markdown from the model would show up as stray characters.
export function cleanAnswer(text: string): string {
  return text
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]*[*•][ \t]+/gm, '- ')
    .replace(/\*+|_{2,}|`+/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function finalizeAnswer(text: string): string {
  const repeated = repetitionStart(text);
  if (repeated === -1) return cleanAnswer(text);
  // Drop a list marker left dangling in front of the removed repetition.
  return cleanAnswer(text.slice(0, repeated)).replace(/\n[ \t]*(?:\d+[.)]|-)?[ \t]*$/, '').trim();
}
