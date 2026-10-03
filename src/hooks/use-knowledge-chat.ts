import { useEffect, useRef, useState } from 'react';
import { models, useModel, useResourceDownload } from 'react-native-executorch';

import { cleanAnswer } from '@/services/rag/answer';
import { KnowledgeConversation } from '@/services/rag/conversation';
import { acquireRetrieval } from '@/services/rag/retrieval';
import { createKnowledgeRunner } from '@/services/rag/runner';
import type { ChatPhase, CitedSource, ConversationTurn, Source } from '@/services/rag/types';

export type ChatMessage = ConversationTurn & { id: string; sources?: CitedSource[]; interrupted?: boolean };

export function useKnowledgeChat() {
  const { resource, downloadProgress, downloadError } = useResourceDownload(models.llm.BIELIK_V3_1_5B.XNNPACK_8DA4W);
  const { model, error: modelError } = useModel(createKnowledgeRunner, resource);
  const [retrieval, setRetrieval] = useState<Awaited<ReturnType<typeof acquireRetrieval>>['service']>();
  const [retrievalError, setRetrievalError] = useState<Error>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [phase, setPhase] = useState<ChatPhase>('preparing');
  const [sendError, setSendError] = useState<string>();
  const activeRequest = useRef<AbortController | undefined>(undefined);
  const pendingSearch = useRef<Promise<Source[]> | undefined>(undefined);
  const conversation = useRef(new KnowledgeConversation());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let current: Awaited<ReturnType<typeof acquireRetrieval>> | undefined;
    let cancelled = false;
    acquireRetrieval().then((value) => {
      if (cancelled) { value.release(); return; }
      current = value;
      setRetrieval(value.service);
    }).catch((error: unknown) => {
      if (!cancelled) setRetrievalError(error instanceof Error ? error : new Error(String(error)));
    });
    return () => {
      mounted.current = false;
      cancelled = true;
      activeRequest.current?.abort();
      // Native embedding inference cannot be interrupted. Let it finish before disposal.
      const release = () => { current?.release(); };
      if (pendingSearch.current) void pendingSearch.current.then(release, release);
      else release();
    };
  }, []);

  const error = retrievalError?.message ?? modelError?.message ?? downloadError?.message ?? sendError;
  const isReady = !!retrieval && !!model && !retrievalError && !modelError && !downloadError;
  const isBusy = phase === 'searching' || phase === 'generating';

  async function send(text: string) {
    const question = text.trim();
    if (!question || !model || !retrieval || activeRequest.current) return false;
    const controller = new AbortController();
    activeRequest.current = controller;
    const replyId = `${Date.now()}-assistant`;
    let streamed = '';
    let generationFinished = false;
    setSendError(undefined);
    setPhase('searching');
    setMessages((previous) => [...previous,
      { id: `${Date.now()}-user`, role: 'user', text: question },
      { id: replyId, role: 'assistant', text: '' },
    ]);
    const update = (changes: Partial<ChatMessage>) => {
      if (!mounted.current) return;
      setMessages((previous) => previous.map((message) => message.id === replyId ? { ...message, ...changes } : message));
    };
    try {
      const { searchText, history } = conversation.current.prepareQuestion(question);
      const search = searchText === null ? Promise.resolve([]) : retrieval.search(searchText);
      pendingSearch.current = search;
      const sources = await search;
      pendingSearch.current = undefined;
      if (controller.signal.aborted) throw new Error('Odpowiedź została zatrzymana.');
      if (!sources.length) {
        update({ text: 'Nie znalazłem informacji na ten temat w polskich poradnikach.' });
        return true;
      }
      setPhase('generating');
      const result = await model.generate(question, history, sources, controller.signal, (token) => {
        if (!mounted.current || controller.signal.aborted || generationFinished) return;
        streamed += token;
        update({ text: cleanAnswer(streamed) });
      });
      generationFinished = true;
      // Final text comes from native generation, even if a token callback is delayed.
      update({ text: result.text, sources: result.sources });
      conversation.current.rememberReply(question, result.text);
      return true;
    } catch (error) {
      if (controller.signal.aborted) update({ text: cleanAnswer(streamed) || 'Odpowiedź została zatrzymana.', interrupted: true, sources: undefined });
      else {
        const message = error instanceof Error ? error.message : String(error);
        if (mounted.current) setSendError(message);
        update({ text: 'Nie udało się przygotować odpowiedzi. Spróbuj ponownie.', sources: undefined });
      }
      return false;
    } finally {
      pendingSearch.current = undefined;
      activeRequest.current = undefined;
      if (mounted.current) setPhase('ready');
    }
  }

  function reset() {
    if (activeRequest.current) return;
    conversation.current.reset();
    setMessages([]);
    setSendError(undefined);
  }

  return { messages, send, reset, stop: () => activeRequest.current?.abort(), isReady, isBusy, phase, error, downloadProgress };
}
