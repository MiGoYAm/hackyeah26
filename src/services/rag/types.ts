export type Source = {
  id: string;
  documentId: string;
  title: string;
  publisher: string;
  // PDF sources have a year and a page; pages of gov.pl have a section and their address.
  year?: number;
  page?: number;
  section?: string;
  url?: string;
  text: string;
  similarity: number;
};

// The number the answer uses for this source, e.g. [2].
export type CitedSource = Source & { reference: number };

export type ConversationTurn = { role: 'user' | 'assistant'; text: string };

export type ChatPhase = 'preparing' | 'ready' | 'searching' | 'generating' | 'error';
