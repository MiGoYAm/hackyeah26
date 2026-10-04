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
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useKnowledgeChat, type ChatMessage } from '@/hooks/use-knowledge-chat';
import { useVoiceInput } from '@/hooks/use-voice-input';

const ACCENT = '#3c87f7';
const DANGER = '#d03b3b';

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
          <ThemedText type="smallBold">Asystent bezpieczeństwa</ThemedText>
          <Pressable onPress={() => {
            cancelVoice();
            setInput('');
            chat.reset();
          }} disabled={isBusy} accessibilityRole="button" hitSlop={8}>
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
                : 'Przygotowanie polskiej bazy wiedzy…'}
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

        {isBusy && (
          <View style={styles.status} accessibilityLiveRegion="polite">
            <ActivityIndicator />
            <ThemedText type="small" themeColor="textSecondary">
              {phase === 'searching' ? 'Szukam w polskich poradnikach…' : 'Przygotowuję odpowiedź…'}
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
                  <AssistantMarkdown text={item.text} />
                  {item.sources?.map((source) => (
                    <ThemedText key={source.id} type="small" themeColor="textSecondary" style={styles.source}>
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
              <ThemedText type="smallBold" accessibilityLiveRegion="polite">
                {voice.status === 'listening' ? 'Słucham. Powiedz, co się stało.'
                  : voice.status === 'requesting' ? 'Włączam mikrofon…'
                    : voice.status === 'stopping' ? 'Kończę dyktowanie…'
                      : 'Powiedz, co się stało.'}
              </ThemedText>
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
              {voice.error ? <ThemedText type="small" style={styles.voiceError}>{voice.error}</ThemedText> : null}
              {voice.needsSettings ? (
                <Pressable onPress={() => { void Linking.openSettings(); }} accessibilityRole="button" style={styles.secondaryButton}>
                  <ThemedText type="smallBold">Otwórz ustawienia</ThemedText>
                </Pressable>
              ) : null}
              <Pressable
                style={[styles.voiceButton, !canSend && styles.buttonDisabled]}
                onPress={handleSend}
                disabled={!canSend}
                accessibilityRole="button"
                accessibilityLabel="Wyślij pytanie">
                <ThemedText type="smallBold" style={styles.buttonText}>Wyślij</ThemedText>
              </Pressable>
              {isBusy ? (
                <Pressable style={[styles.button, styles.stopButton]} onPress={chat.stop} accessibilityRole="button">
                  <ThemedText type="smallBold" style={styles.buttonText}>Zatrzymaj odpowiedź</ThemedText>
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
  safeArea: { flex: 1, maxWidth: MaxContentWidth },
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
  assistantBubble: { alignSelf: 'flex-start', width: '85%' },
  userText: { color: '#ffffff' },
  source: { marginTop: Spacing.two },
  voiceError: { color: DANGER },
  voiceComposer: { padding: Spacing.three, gap: Spacing.two },
  voiceButton: {
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.three,
    borderRadius: Spacing.three,
    backgroundColor: ACCENT,
  },
  secondaryButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  input: {
    minHeight: 72,
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
