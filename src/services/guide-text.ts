export type GuideBlock = { type: 'heading' | 'paragraph' | 'item'; text: string };

// gov.pl pages mark most of their headings only by layout: a short line without
// closing punctuation, followed by a paragraph or a list. Same rule as in
// scripts/rag/build_database.py, so the library and the chat split pages alike.
function isSubheading(line: string, following?: string) {
  return line.length >= 3 && line.length <= 70 && line.split(/\s+/).length <= 9 &&
    !'.,;:!'.includes(line[line.length - 1]) && !line.startsWith('-') && !line.startsWith('http') &&
    following !== undefined && (following.startsWith('-') || following.length > line.length);
}

export function parseGuide(text: string): GuideBlock[] {
  // Only the page's own text: attachments are transcripts and scans of uneven quality.
  const lines: string[] = [];
  let inside = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('## Ze strony')) inside = true;
    else if (line.startsWith('## Z załącznika') || line.startsWith('## Uwaga o załączniku')) break;
    else if (inside && line && line !== '---') lines.push(line);
  }
  const blocks: GuideBlock[] = [];
  // The first line repeats the page title, which the screen header already shows.
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === '-') {
      // Some pages put the bullet and its text on separate lines.
      const text = lines[index + 1];
      if (text !== undefined && !text.startsWith('-')) {
        blocks.push({ type: 'item', text });
        index += 1;
      }
    } else if (line.startsWith('- ')) blocks.push({ type: 'item', text: line.slice(2) });
    else if (line.startsWith('## ')) blocks.push({ type: 'heading', text: line.slice(3) });
    else if (isSubheading(line, lines[index + 1])) blocks.push({ type: 'heading', text: line });
    else blocks.push({ type: 'paragraph', text: line });
  }
  return blocks;
}
