import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { ExternalLink } from '@/components/external-link';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { GuideBlock } from '@/services/guide-text';
import { findTopic, loadGuide } from '@/services/library';

export default function GuideScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const topic = findTopic(id);
  const theme = useTheme();
  const [blocks, setBlocks] = useState<GuideBlock[]>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!topic) return;
    let cancelled = false;
    loadGuide(topic).then(
      (loaded) => { if (!cancelled) setBlocks(loaded); },
      () => { if (!cancelled) setFailed(true); },
    );
    return () => { cancelled = true; };
  }, [topic]);

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: topic?.title ?? 'Biblioteka' }} />
      {!topic || failed ? (
        <ThemedText themeColor="textSecondary" style={styles.centered}>
          {topic ? 'Nie udało się wczytać poradnika.' : 'Nie ma takiego poradnika.'}
        </ThemedText>
      ) : !blocks ? (
        <ActivityIndicator style={styles.centered} />
      ) : (
        <>
          {blocks.map((block, index) =>
            block.type === 'heading' ? (
              <ThemedText key={index} style={styles.heading} accessibilityRole="header">
                {block.text}
              </ThemedText>
            ) : block.type === 'item' ? (
              <View key={index} style={styles.item}>
                <ThemedText themeColor="textSecondary">•</ThemedText>
                <ThemedText style={styles.itemText}>{block.text}</ThemedText>
              </View>
            ) : (
              <ThemedText key={index}>{block.text}</ThemedText>
            ),
          )}
          <View style={styles.source}>
            <ThemedText type="small" themeColor="textSecondary">
              Źródło: Rządowe Centrum Bezpieczeństwa, gov.pl. Treść na licencji CC BY-SA 4.0.
            </ThemedText>
            <ExternalLink href={topic.url}>
              <ThemedText type="linkPrimary">Otwórz stronę źródłową</ThemedText>
            </ExternalLink>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.three,
    gap: Spacing.two,
  },
  centered: { textAlign: 'center', marginTop: Spacing.five },
  heading: { fontSize: 18, lineHeight: 26, fontWeight: 700, marginTop: Spacing.three },
  item: { flexDirection: 'row', gap: Spacing.two, paddingLeft: Spacing.two },
  itemText: { flex: 1 },
  source: { marginTop: Spacing.four },
});
