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

// A source as the model reads it: `text` is the matched fragment, `passage` the page or section around it.
export type SourcePassage = Source & { passage: string };

export type ConversationTurn = { role: 'user' | 'assistant'; text: string };

export type ChatPhase = 'preparing' | 'ready' | 'searching' | 'generating' | 'error';
