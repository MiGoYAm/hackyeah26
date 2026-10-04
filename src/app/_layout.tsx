import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { useTheme } from '@/hooks/use-theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = useTheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <NativeTabs
        backgroundColor={theme.background}
        indicatorColor={theme.backgroundElement}
        labelStyle={{ selected: { color: theme.text } }}>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Label>Asystent</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="bubble.left.and.bubble.right" md="chat" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="map">
          <NativeTabs.Trigger.Label>Mapa</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="map" md="map" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="library">
          <NativeTabs.Trigger.Label>Biblioteka</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="books.vertical" md="menu_book" />
        </NativeTabs.Trigger>
      </NativeTabs>
    </ThemeProvider>
  );
}
