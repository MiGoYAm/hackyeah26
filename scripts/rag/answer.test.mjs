import assert from 'node:assert/strict';
import test from 'node:test';

import { cleanAnswer, finalizeAnswer, reachedLimit } from '../../src/services/rag/answer.ts';

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
  const shown = markdown.replace(' [1]', '');
  assert.equal(cleanAnswer(markdown), shown);
  assert.equal(finalizeAnswer(markdown), shown);
});

test('source numbers are removed, wherever the model puts them', () => {
  assert.equal(cleanAnswer('[1] 3 litry wody na osobę.\n[2]: 2 litry dziennie.'), '3 litry wody na osobę.\n2 litry dziennie.');
  assert.equal(cleanAnswer('1. [1]: Idź do schronu.\n- **Woda** [1, 2]'), '1. Idź do schronu.\n- **Woda**');
  assert.equal(cleanAnswer('Zostań w budynku [1]. Stopień [ALFA] zostaje [1-3].'), 'Zostań w budynku. Stopień [ALFA] zostaje.');
});

test('removing repeated advice keeps the first formatted advice', () => {
  const advice = '**Przed ewakuacją zabierz dokumenty i zapas wody.**';
  assert.equal(finalizeAnswer(`${advice} [1]\n\n${advice} [1]\n`), advice);
});

test('a long answer stops at the end of a sentence or a line', () => {
  const long = 'x'.repeat(360);
  assert.equal(reachedLimit('Krótka odpowiedź.'), false);
  assert.equal(reachedLimit(`${long} koniec zdania.`), true);
  assert.equal(reachedLimit(`${long} punkt listy\n`), true);
  assert.equal(reachedLimit(`${long} w trakcie zdania`), false);
  assert.equal(reachedLimit(`${long} przedmioty, np.`), false);
  assert.equal(reachedLimit(`${long}\n5.`), false);
  assert.equal(reachedLimit(`${long} należy:\n`), false);
});
