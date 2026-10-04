import { useEffect } from 'react';
import { Animated, Easing, StyleSheet, View, useAnimatedValue } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

const DOTS = [0, 1, 2];

export function TypingDots() {
  const theme = useTheme();
  const progress = useAnimatedValue(0);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);

  return (
    <View style={styles.row} accessibilityLabel="Asystent przygotowuje odpowiedź">
      {DOTS.map((dot) => {
        // Each dot rises a little later than the one before it.
        const start = 0.05 + dot * 0.15;
        const inputRange = [0, start, start + 0.2, start + 0.4, 1];
        return (
          <Animated.View
            key={dot}
            style={[
              styles.dot,
              {
                backgroundColor: theme.textSecondary,
                opacity: progress.interpolate({ inputRange, outputRange: [0.35, 0.35, 1, 0.35, 0.35] }),
                transform: [{ translateY: progress.interpolate({ inputRange, outputRange: [0, 0, -3, 0, 0] }) }],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 22, paddingHorizontal: 2 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
});
