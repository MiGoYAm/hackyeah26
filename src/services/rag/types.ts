export type Source = {
  id: string;
  documentId: string;
  title: string;
  publisher: string;
  year: number;
  page: number;
  text: string;
  similarity: number;
};

export type ConversationTurn = { role: 'user' | 'assistant'; text: string };

export type ChatPhase = 'preparing' | 'ready' | 'searching' | 'generating' | 'error';
