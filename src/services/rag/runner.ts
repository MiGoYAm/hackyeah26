import { File } from 'expo-file-system';
import { llm, nlp, wrapAsync, type LLMModel } from 'react-native-executorch';
import { scheduleOnRN } from 'react-native-worklets';

import { finalizeAnswer, NO_ANSWER, reachedLimit, repetitionStart } from './answer';
import type { SourcePassage } from './types';

const MAX_NEW_TOKENS = 1024;

const SYSTEM_PROMPT = `Jesteś asystentem bezpieczeństwa. Odpowiadasz po polsku wyłącznie na podstawie fragmentów oficjalnych poradników podanych w <zrodla>.
Odpowiedz krótko i konkretnie, własnymi słowami, najwyżej trzema zdaniami.
Jeżeli źródła nie zawierają odpowiedzi, na przykład aktualnych alertów albo adresów schronów, napisz: ${NO_ANSWER}`;

// With the question as the last line, the model often answered by copying the <zrodla> block.
const REMINDER = 'Odpowiedz tylko na to pytanie, krótko i konkretnie, najwyżej trzema zdaniami.';

function ask(sources: string, question: string, earlier: string[]): string {
  const asked = earlier.length ? `Wcześniejsze pytania: ${earlier.join(' ')}\n` : '';
  return `<zrodla>\n${sources}\n</zrodla>\n\n${asked}Pytanie: ${question}\n${REMINDER}`;
}

function runGeneration(
  runner: llm.LLMRunner,
  prompt: string,
  stopTokens: readonly string[],
  onToken: (token: string) => void,
): string {
  'worklet';
  let response = '';
  let done = false;
  runner.reset();
  // Temperature 0 picks the likeliest token, so a question always gets the same answer.
  runner.generate(prompt, { temperature: 0, maxNewTokens: MAX_NEW_TOKENS }, (token) => {
    if (done || stopTokens.includes(token)) return;
    response += token;
    // Greedy decoding can repeat itself until the token limit.
    if (repetitionStart(response) !== -1) {
      done = true;
      runner.stop();
      return;
    }
    scheduleOnRN(onToken, token);
    if (reachedLimit(response)) {
      done = true;
      runner.stop();
    }
  });
  return response;
}

const generateAsync = wrapAsync(runGeneration);

export type KnowledgeRunner = Awaited<ReturnType<typeof createKnowledgeRunner>>;

export async function createKnowledgeRunner(config: LLMModel) {
  // The downloader returns a plain path; on Android File accepts only file:// URIs.
  const tokenizerConfigUri = config.tokenizerConfigPath.startsWith('file://')
    ? config.tokenizerConfigPath : `file://${config.tokenizerConfigPath}`;
  const tokenizerConfig = llm.parseTokenizerConfig(JSON.parse(await new File(tokenizerConfigUri).text()));
  const tokenizer = await wrapAsync(nlp.loadTokenizer)(config.tokenizerPath);
  const preprocessor = llm.createChatPreprocessor({ chatTemplate: tokenizerConfig.chatTemplate });
  let runner: llm.LLMRunner;
  try {
    runner = await wrapAsync(llm.createLLMRunner)(config.modelPath, config.tokenizerPath);
  } catch (error) {
    tokenizer.dispose();
    preprocessor.dispose();
    throw error;
  }
  const countTokens = wrapAsync((text: string) => {
    'worklet';
    return tokenizer.encode(text).length;
  });
  let pending: Promise<string> | undefined;
  let disposed = false;

  async function generate(
    question: string,
    earlier: string[],
    sources: SourcePassage[],
    signal: AbortSignal,
    onToken: (token: string) => void,
  ) {
    // The model works through every source it is given, which makes answers long and mixes
    // topics, so it gets the best one. The second joins only when it matches the question's
    // meaning at least as well: the first then leads on its keyword bonus alone.
    const context = sources.slice(0, sources[1]?.similarity >= sources[0].similarity ? 2 : 1);
    // This many of the best sources are given as whole passages, the rest as their matched fragment.
    let whole = context.length;
    const maxTokens = runner.getKVCacheState().maxSeqLen - MAX_NEW_TOKENS - 16;
    let prompt = '';
    while (true) {
      if (signal.aborted) throw new Error('Odpowiedź została zatrzymana.');
      if (disposed) throw new Error('Rozmowa została zamknięta.');
      const sourceText = context.map((source, index) =>
        `[${index + 1}] ${[source.title, source.year, source.page && `strona PDF ${source.page}`].filter(Boolean).join(', ')}\n${index < whole ? source.passage : source.text}`
      ).join('\n\n');
      const messages: llm.ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: ask(sourceText, question, earlier) },
      ];
      prompt = preprocessor.render(messages, { addGenPrompt: true }).text;
      if (await countTokens(prompt) <= maxTokens) break;
      // Narrow the least relevant passage to its fragment before giving up a whole source.
      if (whole > 0) whole -= 1;
      else if (context.length > 1) context.pop();
      else throw new Error('Wiadomość jest za długa. Skróć pytanie.');
    }
    if (signal.aborted) throw new Error('Odpowiedź została zatrzymana.');
    const stop = () => runner.stop();
    signal.addEventListener('abort', stop, { once: true });
    try {
      const text = finalizeAnswer(await generateAsync(runner, prompt, tokenizerConfig.stopTokens, onToken));
      if (signal.aborted) throw new Error('Odpowiedź została zatrzymana.');
      return text;
    } finally {
      signal.removeEventListener('abort', stop);
    }
  }

  return {
    generate(question: string, earlier: string[], sources: SourcePassage[], signal: AbortSignal, onToken: (token: string) => void) {
      if (disposed || pending) return Promise.reject(new Error('Asystent jest zajęty.'));
      const task = generate(question, earlier, sources, signal, onToken);
      pending = task;
      void task.then(() => { pending = undefined; }, () => { pending = undefined; });
      return task;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      runner.stop();
      const release = () => { runner.dispose(); tokenizer.dispose(); preprocessor.dispose(); };
      // Stop first and release native resources only once in-flight work finishes.
      if (pending) void pending.then(release, release);
      else release();
    },
  };
}
