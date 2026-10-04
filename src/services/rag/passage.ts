import type { Source, SourcePassage } from './types';

export type Fragment = { id: string; document: string };

// About 400 Bielik tokens: most pages and sections fit whole.
const MAX_PASSAGE_CHARS = 1500;
// Neighbouring fragments share at least a sentence; a shorter match is a coincidence.
const MIN_OVERLAP = 12;

// Fragment ids are "<document>:<page or section>:<hash>".
export function partOf(id: string): string {
  return id.slice(0, id.lastIndexOf(':') + 1);
}

// What `next` adds after `previous`: the build step makes neighbouring fragments overlap.
function continuation(previous: string, next: string): string {
  for (let length = Math.min(previous.length, next.length); length >= MIN_OVERLAP; length -= 1) {
    if (previous.endsWith(next.slice(0, length))) return next.slice(length);
  }
  return `\n${next}`;
}

// A fragment holds at most 126 embedding tokens, often half a list, and the model fills
// the missing half from memory. It reads the page or section around the match instead.
// `parts` maps partOf(id) to that part's fragments in reading order.
export function widenSources(sources: Source[], parts: Map<string, Fragment[]>): SourcePassage[] {
  const taken = new Map<string, Set<number>>();
  const widened: SourcePassage[] = [];
  for (const source of sources) {
    const part = partOf(source.id);
    const fragments = parts.get(part) ?? [];
    const hit = fragments.findIndex((fragment) => fragment.id === source.id);
    if (hit === -1) {
      widened.push({ ...source, passage: source.text });
      continue;
    }
    const used = taken.get(part) ?? new Set<number>();
    taken.set(part, used);
    // A better match from the same section already carries this fragment.
    if (used.has(hit)) continue;
    // Every fragment repeats its heading; the passage needs it once.
    const heading = source.section ? `${source.section}\n` : '';
    const bodies = fragments.map(({ document }) =>
      document.startsWith(heading) ? document.slice(heading.length) : document);
    const added = bodies.map((body, index) => index ? continuation(bodies[index - 1], body) : body);
    let first = hit;
    let last = hit;
    let size = bodies[hit].length;
    for (let grew = true; grew;) {
      grew = false;
      // Forward first: a list usually continues past the fragment that matched.
      if (last + 1 < bodies.length && !used.has(last + 1) && size + added[last + 1].length <= MAX_PASSAGE_CHARS) {
        last += 1;
        size += added[last].length;
        grew = true;
      }
      const before = first > 0 && !used.has(first - 1)
        ? bodies[first - 1].length + added[first].length - bodies[first].length : Infinity;
      if (size + before <= MAX_PASSAGE_CHARS) {
        first -= 1;
        size += before;
        grew = true;
      }
    }
    // Right after another passage of this section, start where that one ended.
    const start = first > 0 && used.has(first - 1) ? added[first].trimStart() : bodies[first];
    for (let index = first; index <= last; index += 1) used.add(index);
    widened.push({ ...source, passage: heading + start + added.slice(first + 1, last + 1).join('') });
  }
  return widened;
}
