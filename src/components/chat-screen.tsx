import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { useCallback, useRef, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';

import { AssistantMarkdown } from '@/components/assistant-markdown';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TypingDots } from '@/components/typing-dots';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useKnowledgeChat, type ChatMessage } from '@/hooks/use-knowledge-chat';
import { useVoiceInput } from '@/hooks/use-voice-input';

// On Android the tab bar already sits above the system navigation bar, so a bottom
// inset here would only leave a gap under the input.
const SAFE_EDGES = Platform.OS === 'android' ? (['top', 'left', 'right'] as const) : undefined;

export function ChatScreen() {
  const theme = useTheme();
  const chat = useKnowledgeChat();
  const [input, setInput] = useState('');
  const consumedVoiceRequest = useRef<string | undefined>(undefined);
  const { voice: voiceParam } = useLocalSearchParams<{ voice?: string | string[] }>();
  const voiceRequest = (Array.isArray(voiceParam) ? voiceParam[0] : voiceParam) ?? 'launch';
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const { isReady, isBusy, messages, error, phase, downloadProgress } = chat;
  const voice = useVoiceInput({
    onTranscript: setInput,
  });
  const { start: startVoice, cancel: cancelVoice } = voice;
  const canSend = isReady && !isBusy && voice.status !== 'stopping' && input.trim().length > 0;

  useFocusEffect(useCallback(() => {
    if (consumedVoiceRequest.current !== voiceRequest) {
      consumedVoiceRequest.current = voiceRequest;
      void startVoice();
    }
    return () => {
      cancelVoice();
    };
  }, [voiceRequest, startVoice, cancelVoice]));

  const handleSend = () => {
    if (!canSend) return;
    const text = input.trim();
    cancelVoice();
    setInput('');
    void chat.send(text);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={SAFE_EDGES}>
        <View style={styles.header}>
          <ThemedText style={styles.title} accessibilityRole="header">
            mKryzys
          </ThemedText>
          {messages.length > 0 ? (
            <Pressable onPress={() => {
              cancelVoice();
              setInput('');
              chat.reset();
            }} disabled={isBusy} accessibilityRole="button" hitSlop={8}>
              <ThemedText type="smallBold" themeColor="accent">
                Nowa rozmowa
              </ThemedText>
            </Pressable>
          ) : null}
        </View>

        {!isReady && !error && (
          <View style={styles.status}>
            <ActivityIndicator color={theme.accent} />
            <ThemedText type="small" themeColor="textSecondary">
              {downloadProgress < 100
                ? `Pobieranie modelu: ${downloadProgress.toFixed(0)}%`
                : 'Przygotowanie polskiej bazy wiedzy…'}
            </ThemedText>
          </View>
        )}

        {error && (
          <View style={styles.status}>
            <ThemedText type="small" themeColor="accent" style={styles.flex}>
              {error}
            </ThemedText>
          </View>
        )}

        {isBusy && (
          <View style={styles.status} accessibilityLiveRegion="polite">
            <ActivityIndicator color={theme.accent} />
            <ThemedText type="small" themeColor="textSecondary">
              {phase === 'searching' ? 'Szukam w polskich poradnikach…' : 'Przygotowuję odpowiedź…'}
            </ThemedText>
          </View>
        )}

        {/* Android draws edge to edge, so the window no longer shrinks for the keyboard
            and the view has to make room for it itself, as on iOS. */}
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          <FlatList
            ref={listRef}
            style={styles.flex}
            contentContainerStyle={styles.list}
            data={messages}
            keyExtractor={(m) => m.id}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) =>
              item.role === 'user' ? (
                <View style={[styles.bubble, styles.userBubble, { backgroundColor: theme.accent }]}>
                  <ThemedText themeColor="onAccent" style={styles.userText}>{item.text}</ThemedText>
                </View>
              ) : item.text || !isBusy ? (
                <ThemedView type="backgroundAnswer" style={[styles.bubble, styles.assistantBubble]}>
                  <AssistantMarkdown text={item.text} />
                </ThemedView>
              ) : (
                <ThemedView type="backgroundAnswer" style={[styles.bubble, styles.typingBubble]}>
                  <TypingDots />
                </ThemedView>
              )
            }
            ListEmptyComponent={
              isReady ? (
                <ThemedText themeColor="textSecondary" style={styles.empty}>
                  Zapytaj o powódź, ewakuację, alarmy lub przygotowanie zapasów.
                </ThemedText>
              ) : null
            }
          />

          <View style={styles.composer}>
            {voice.status !== 'idle' ? (
              <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">
                {voice.status === 'listening' ? 'Słucham. Powiedz, co się stało.'
                  : voice.status === 'requesting' ? 'Włączam mikrofon…' : 'Kończę dyktowanie…'}
              </ThemedText>
            ) : null}
            {voice.error ? <ThemedText type="small" themeColor="accent">{voice.error}</ThemedText> : null}
            {voice.needsSettings ? (
              <Pressable onPress={() => { void Linking.openSettings(); }} accessibilityRole="button" style={styles.secondaryButton}>
                <ThemedText type="smallBold">Otwórz ustawienia</ThemedText>
              </Pressable>
            ) : null}
            <View style={[styles.inputRow, { borderColor: theme.backgroundSelected }]}>
              <TextInput
                style={[styles.input, { color: theme.text }]}
                value={input}
                onChangeText={setInput}
                onFocus={cancelVoice}
                placeholder="Powiedz lub wpisz pytanie"
                placeholderTextColor={theme.textSecondary}
                editable={!isBusy}
                accessibilityLabel="Pytanie do asystenta"
                multiline
              />
              <Pressable
                style={[styles.sendButton, { backgroundColor: theme.backgroundElement }, !isBusy && !canSend && styles.buttonDisabled]}
                onPress={isBusy ? chat.stop : handleSend}
                disabled={!isBusy && !canSend}
                accessibilityRole="button"
                accessibilityLabel={isBusy ? 'Zatrzymaj odpowiedź' : 'Wyślij pytanie'}>
                <ThemedText themeColor="accent" style={isBusy ? styles.stopIcon : styles.sendIcon}>
                  {isBusy ? '■' : '↑'}
                </ThemedText>
              </Pressable>
            </View>
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
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  title: { flexShrink: 1, fontSize: 16, lineHeight: 22, fontWeight: 700 },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  list: { flexGrow: 1, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, gap: 10 },
  empty: { textAlign: 'center', marginTop: Spacing.five, fontSize: 15, lineHeight: 22 },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 16,
  },
  userBubble: { alignSelf: 'flex-end' },
  assistantBubble: { alignSelf: 'flex-start', width: '85%' },
  typingBubble: { alignSelf: 'flex-start' },
  userText: { fontSize: 15, lineHeight: 21, fontWeight: 600 },
  composer: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, gap: Spacing.one },
  secondaryButton: { minHeight: 40, justifyContent: 'center', alignItems: 'center' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  input: {
    flex: 1,
    minHeight: 36,
    maxHeight: 110,
    fontSize: 15,
    lineHeight: 21,
    paddingVertical: 7,
  },
  sendButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  sendIcon: { fontSize: 20, lineHeight: 24, fontWeight: 700 },
  stopIcon: { fontSize: 13, lineHeight: 18 },
  buttonDisabled: { opacity: 0.4 },
});
