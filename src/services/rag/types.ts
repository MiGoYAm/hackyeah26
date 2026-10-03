export type Source = {
  id: string;
  documentId: string;
  title: string;
  publisher: string;
  year: number;
  // PDF sources have a page; pages of gov.pl have only their address.
  page?: number;
  url?: string;
  text: string;
  similarity: number;
};

// The number the answer uses for this source, e.g. [2].
export type CitedSource = Source & { reference: number };

export type ConversationTurn = { role: 'user' | 'assistant'; text: string };

export type ChatPhase = 'preparing' | 'ready' | 'searching' | 'generating' | 'error';
