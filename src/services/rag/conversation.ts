import type { ConversationTurn } from './types';

const AIR_RAID_WORDS: Record<string, string> = {
  nalot: 'atak z powietrza', nalotu: 'ataku z powietrza', nalotem: 'atakiem z powietrza',
  nalocie: 'ataku z powietrza', naloty: 'ataki z powietrza', nalotow: 'ataków z powietrza',
  nalotami: 'atakami z powietrza', nalotach: 'atakach z powietrza',
};
const ALARM_WORDS: Record<string, string> = {
  syrena: 'syrena alarmowa', syreny: 'syreny alarmowe', syrene: 'syrenę alarmową',
  syreną: 'syreną alarmową', syren: 'syren alarmowych',
  syrenami: 'syrenami alarmowymi', syrenach: 'syrenach alarmowych',
};

function fold(text: string): string {
  return text.toLocaleLowerCase('pl').normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l');
}

// These openers point back at the previous question.
const ANAPHORIC = /^(?:a co (?:wtedy|teraz|dalej)|a jak (?:to|tam|wtedy)|(?:i )?co (?:wtedy|teraz|dalej)|czy to|jak to|ile tego)\b/;
// These can also start a question about a new topic, so they only count when
// the question is too short to name one.
const ELLIPTICAL = /^(?:a gdzie|i co|dlaczego)\b/;
const ELLIPTICAL_MAX_WORDS = 4;

function isFollowUp(question: string): boolean {
  const folded = fold(question).trim();
  return ANAPHORIC.test(folded) ||
    (ELLIPTICAL.test(folded) && folded.split(/\s+/).length <= ELLIPTICAL_MAX_WORDS);
}

function normalizeQuestion(question: string): string | null {
  const folded = fold(question);
  const coating = /\bnalot\w*\s+(?:(?:na|w|z)\s+(?:jezyk\w*|zeb\w*|czajnik\w*)|kamienn\w*|plesn\w*)/.test(folded);
  // "Nalot" also means a coating; this corpus covers emergencies, not cleaning.
  if (coating) return null;
  const otherSiren = /syren\w*\s+(?:samochodow\w*|policyjn\w*)/.test(folded) || /\bfilm\w*\b/.test(folded);
  return question.replace(/[\p{L}]+/gu, (word, offset: number) => {
    const key = fold(word);
    if (AIR_RAID_WORDS[key]) return AIR_RAID_WORDS[key];
    // Do not append "alarmowa" twice to a question that already names it.
    if (!otherSiren && !/^\s+alarmow/i.test(question.slice(offset + word.length))) {
      const alarm = ALARM_WORDS[word.toLocaleLowerCase('pl')] ?? ALARM_WORDS[key];
      if (alarm) return alarm;
    }
    return word;
  });
}

export class KnowledgeConversation {
  private previousQuestion?: string;
  private history: ConversationTurn[] = [];

  prepareQuestion(question: string) {
    const current = normalizeQuestion(question.trim());
    // An "A jak ..." prefix alone does not imply the same topic (e.g. cooking).
    const followUp = current !== null && isFollowUp(current);
    const searchText = followUp && this.previousQuestion
      ? `${this.previousQuestion}\n${current}` : current;
    // Remember the user's topic before retrieval, including turns with no sources.
    if (!followUp) this.previousQuestion = current ?? undefined;
    return { searchText, history: [...this.history] };
  }

  rememberReply(question: string, answer: string) {
    this.history.push({ role: 'user', text: question }, { role: 'assistant', text: answer.replace(/\[\d+\]/g, '') });
    this.history = this.history.slice(-6);
  }

  reset() {
    this.previousQuestion = undefined;
    this.history = [];
  }
}
