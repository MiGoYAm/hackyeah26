import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

// Expo Go ships without the ExecuTorch and op-sqlite native libraries the chat depends on.
export function ExpoGoNotice() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText themeColor="textSecondary" style={styles.text}>
        Asystent nie działa w Expo Go. Zainstaluj natywny build aplikacji.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  text: { textAlign: 'center' },
});
