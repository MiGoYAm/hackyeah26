// Said by the app when the search finds nothing, and by the model when the sources lack the answer.
export const NO_ANSWER = 'Nie znalazłem informacji na ten temat w polskich poradnikach.';

const MIN_REPEATED_SENTENCE = 25;
const REPEATED_TAIL = 80;
const MAX_ANSWER_CHARS = 350;

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

// The model ignores length limits given in the prompt, so past the limit the answer
// stops at the next end of a sentence or a line.
export function reachedLimit(text: string): boolean {
  'worklet';
  if (text.length < MAX_ANSWER_CHARS) return false;
  // A line ending in a colon announces a list; stopping there would leave it empty.
  if (/[^:\s]\s*\n\s*$/.test(text)) return true;
  // A period after an abbreviation or a list number does not end a sentence.
  const abbreviation = /(?:^|[\s(])(?:np|m\.in|tj|tzw|itd|itp|ok|godz|ul|nr|tel|pkt|art|wg|r|s|\d+)\.\s*$/i;
  return /[.!?]\s*$/.test(text) && !abbreviation.test(text);
}

// Preserve Markdown and internal whitespace for both streamed and final replies.
// Source numbers such as [1] are removed: the sources are listed under the answer.
export function cleanAnswer(text: string): string {
  return text
    .replace(/^([ \t]*(?:[-*•]|\d+[.)])?[ \t]*)\[\d+(?:\s*[,;–-]\s*\d+)*\]:?[ \t]*/gm, '$1')
    .replace(/[ \t]*\[\d+(?:\s*[,;–-]\s*\d+)*\]/g, '')
    .trim();
}

export function finalizeAnswer(text: string): string {
  const repeated = repetitionStart(text);
  if (repeated === -1) return cleanAnswer(text);
  // Drop a list marker left dangling in front of the removed repetition.
  return cleanAnswer(text.slice(0, repeated)).replace(/\n[ \t]*(?:\d+[.)]|-)?[ \t]*$/, '').trim();
}
