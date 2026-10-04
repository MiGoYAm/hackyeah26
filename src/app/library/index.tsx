import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { LIBRARY_GROUPS } from '@/services/library';

export default function LibraryScreen() {
  const theme = useTheme();

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}>
      {LIBRARY_GROUPS.map((group) => (
        <View key={group.title} style={styles.group}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {group.title}
          </ThemedText>
          {group.topics.map((topic) => (
            <Link key={topic.id} href={{ pathname: '/library/[id]', params: { id: topic.id } }} asChild>
              <Pressable accessibilityRole="button" style={({ pressed }) => pressed && styles.pressed}>
                <ThemedView type="backgroundElement" style={styles.row}>
                  <ThemedText style={styles.rowTitle}>{topic.title}</ThemedText>
                  <ThemedText themeColor="textSecondary">›</ThemedText>
                </ThemedView>
              </Pressable>
            </Link>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.three,
    gap: Spacing.four,
  },
  group: { gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  rowTitle: { flex: 1 },
  pressed: { opacity: 0.7 },
});
