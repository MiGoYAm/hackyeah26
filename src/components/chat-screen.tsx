import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { models, useLLMChatSession, type LLMChatSessionOptions } from 'react-native-executorch';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Bielik v3 1.5B (~0.9 GB), downloaded on first launch and cached on the device.
const MODEL = models.llm.BIELIK_V3_1_5B.XNNPACK_8DA4W;

const SYSTEM_PROMPT = 'Jesteś pomocnym asystentem. Odpowiadasz po polsku, krótko i konkretnie.';

const SESSION_OPTIONS: LLMChatSessionOptions = {
  initialMessages: [{ role: 'system', content: SYSTEM_PROMPT }],
  generationConfig: { temperature: 0.3, maxNewTokens: 512 },
};

const ACCENT = '#3c87f7';
const DANGER = '#d03b3b';

type Message = { id: string; role: 'user' | 'assistant'; text: string };

export function ChatScreen() {
  // Remounting the chat disposes the session and starts a fresh conversation.
  const [conversation, setConversation] = useState(0);

  return <Chat key={conversation} onReset={() => setConversation((c) => c + 1)} />;
}

function Chat({ onReset }: { onReset: () => void }) {
  const theme = useTheme();
  const session = useLLMChatSession(MODEL, SESSION_OPTIONS);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [sendError, setSendError] = useState<string>();
  const listRef = useRef<FlatList<Message>>(null);

  const { isReady, sendMessage, stop, downloadProgress } = session;
  const error = session.error?.message ?? sendError;
  const canSend = isReady && input.trim().length > 0;

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !sendMessage || isGenerating) return;

    const replyId = `${Date.now()}-assistant`;
    setInput('');
    setSendError(undefined);
    setIsGenerating(true);
    setMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-user`, role: 'user', text },
      { id: replyId, role: 'assistant', text: '' },
    ]);

    try {
      await sendMessage(text, (token) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === replyId ? { ...m, text: m.text + token } : m))
        );
      });
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <ThemedText type="smallBold">Asystent (Bielik, offline)</ThemedText>
          <Pressable onPress={onReset} disabled={isGenerating} hitSlop={8}>
            <ThemedText type="small" themeColor="textSecondary">
              Nowa rozmowa
            </ThemedText>
          </Pressable>
        </View>

        {!isReady && !error && (
          <View style={styles.status}>
            <ActivityIndicator />
            <ThemedText type="small" themeColor="textSecondary">
              {downloadProgress < 100
                ? `Pobieranie modelu: ${downloadProgress.toFixed(0)}%`
                : 'Wczytywanie modelu…'}
            </ThemedText>
          </View>
        )}

        {error && (
          <View style={styles.status}>
            <ThemedText type="small" style={styles.error}>
              {error}
            </ThemedText>
          </View>
        )}

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <FlatList
            ref={listRef}
            style={styles.flex}
            contentContainerStyle={styles.list}
            data={messages}
            keyExtractor={(m) => m.id}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            renderItem={({ item }) =>
              item.role === 'user' ? (
                <View style={[styles.bubble, styles.userBubble]}>
                  <ThemedText style={styles.userText}>{item.text}</ThemedText>
                </View>
              ) : (
                <ThemedView type="backgroundElement" style={[styles.bubble, styles.assistantBubble]}>
                  <ThemedText>{item.text || '…'}</ThemedText>
                </ThemedView>
              )
            }
            ListEmptyComponent={
              isReady ? (
                <ThemedText themeColor="textSecondary" style={styles.empty}>
                  Napisz wiadomość, aby zacząć.
                </ThemedText>
              ) : null
            }
          />

          <View style={styles.inputRow}>
            <TextInput
              style={[
                styles.input,
                { color: theme.text, backgroundColor: theme.backgroundElement },
              ]}
              value={input}
              onChangeText={setInput}
              placeholder="Napisz wiadomość"
              placeholderTextColor={theme.textSecondary}
              editable={isReady}
              multiline
            />
            {isGenerating ? (
              <Pressable style={[styles.button, styles.stopButton]} onPress={() => stop?.()}>
                <ThemedText type="smallBold" style={styles.buttonText}>
                  Stop
                </ThemedText>
              </Pressable>
            ) : (
              <Pressable
                style={[styles.button, !canSend && styles.buttonDisabled]}
                onPress={handleSend}
                disabled={!canSend}>
                <ThemedText type="smallBold" style={styles.buttonText}>
                  Wyślij
                </ThemedText>
              </Pressable>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, flexDirection: 'row', justifyContent: 'center' },
  safeArea: { flex: 1, maxWidth: MaxContentWidth, paddingBottom: BottomTabInset },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  error: { flex: 1, color: DANGER },
  list: { flexGrow: 1, padding: Spacing.three, gap: Spacing.two },
  empty: { textAlign: 'center', marginTop: Spacing.five },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  userBubble: { alignSelf: 'flex-end', backgroundColor: ACCENT },
  assistantBubble: { alignSelf: 'flex-start' },
  userText: { color: '#ffffff' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    fontSize: 16,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.four,
  },
  button: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.four,
    backgroundColor: ACCENT,
  },
  stopButton: { backgroundColor: DANGER },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#ffffff' },
});
