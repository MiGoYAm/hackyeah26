import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AssistantMarkdown } from '@/components/assistant-markdown';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useKnowledgeChat, type ChatMessage } from '@/hooks/use-knowledge-chat';
import { useVoiceInput } from '@/hooks/use-voice-input';

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
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText style={styles.title} accessibilityRole="header">
            Asystent bezpieczeństwa
          </ThemedText>
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
              ) : (
                <ThemedView type="backgroundElement" style={[styles.bubble, styles.assistantBubble]}>
                  <AssistantMarkdown text={item.text} />
                  {item.sources?.map((source) => (
                    <ThemedText key={source.id} themeColor="textSecondary" style={styles.source}>
                      {source.title}, {source.page ? `strona PDF ${source.page}` : source.publisher}
                    </ThemedText>
                  ))}
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

          <View style={styles.voiceComposer}>
              <View style={styles.composerHeader}>
                <ThemedText type="smallBold" accessibilityLiveRegion="polite" style={styles.flex}>
                  {voice.status === 'listening' ? 'Słucham. Powiedz, co się stało.'
                    : voice.status === 'requesting' ? 'Włączam mikrofon…'
                      : voice.status === 'stopping' ? 'Kończę dyktowanie…'
                        : 'Powiedz, co się stało.'}
                </ThemedText>
                {messages.length > 0 ? (
                  <Pressable onPress={() => {
                    cancelVoice();
                    setInput('');
                    chat.reset();
                  }} disabled={isBusy} accessibilityRole="button" hitSlop={8}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Nowa rozmowa
                    </ThemedText>
                  </Pressable>
                ) : null}
              </View>
              <TextInput
                style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
                value={input}
                onChangeText={setInput}
                onFocus={cancelVoice}
                placeholder="Powiedz lub wpisz pytanie"
                placeholderTextColor={theme.textSecondary}
                editable={!isBusy}
                accessibilityLabel="Pytanie do asystenta"
                multiline
              />
              {voice.error ? <ThemedText type="small" themeColor="accent">{voice.error}</ThemedText> : null}
              {voice.needsSettings ? (
                <Pressable onPress={() => { void Linking.openSettings(); }} accessibilityRole="button" style={styles.secondaryButton}>
                  <ThemedText type="smallBold">Otwórz ustawienia</ThemedText>
                </Pressable>
              ) : null}
              <Pressable
                style={[styles.sendButton, { backgroundColor: theme.accent }, !canSend && styles.buttonDisabled]}
                onPress={handleSend}
                disabled={!canSend}
                accessibilityRole="button"
                accessibilityLabel="Wyślij pytanie">
                <ThemedText themeColor="onAccent" style={styles.buttonText}>Wyślij</ThemedText>
              </Pressable>
              {isBusy ? (
                <Pressable style={[styles.stopButton, { borderColor: theme.accent }]} onPress={chat.stop} accessibilityRole="button">
                  <ThemedText themeColor="accent" style={styles.buttonText}>Zatrzymaj odpowiedź</ThemedText>
                </Pressable>
              ) : null}
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
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  title: { fontSize: 18, lineHeight: 24, fontWeight: 700 },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  list: { flexGrow: 1, padding: Spacing.three, gap: 14 },
  empty: { textAlign: 'center', marginTop: Spacing.five },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    borderRadius: 18,
  },
  userBubble: { alignSelf: 'flex-end' },
  assistantBubble: { alignSelf: 'flex-start', width: '85%' },
  userText: { fontSize: 17, lineHeight: 26, fontWeight: 600 },
  source: { marginTop: Spacing.two, fontSize: 15, lineHeight: 22, fontWeight: 400 },
  voiceComposer: { padding: Spacing.three, gap: Spacing.two },
  composerHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  sendButton: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.three,
    borderRadius: 18,
  },
  secondaryButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  input: {
    minHeight: 72,
    maxHeight: 120,
    fontSize: 17,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    borderRadius: 18,
  },
  stopButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { fontSize: 16, lineHeight: 22, fontWeight: 700 },
});
