import assert from 'node:assert/strict';
import test from 'node:test';

import { cleanAnswer, dropUnknownCitations, finalizeAnswer } from '../../src/services/rag/answer.ts';

const markdown = [
  '# Ewakuacja',
  '',
  '**Zabierz dokumenty.** [1]',
  '',
  '1. Weź plecak.',
  '2. Zadzwoń pod `112`.',
  '   - *Nie wracaj do budynku.*',
  '',
  '```text',
  '  Woda',
  '',
  '',
  '  Dokumenty',
  '```',
].join('\n');

test('streamed and final answers preserve Markdown for the message renderer', () => {
  assert.equal(cleanAnswer(markdown), markdown);
  assert.equal(dropUnknownCitations(finalizeAnswer(markdown), 1), markdown);
});

test('removing repeated advice keeps the first formatted advice and its citation', () => {
  const advice = '**Przed ewakuacją zabierz dokumenty i zapas wody.** [1]';
  assert.equal(finalizeAnswer(`${advice}\n\n${advice}\n`), advice);
});
