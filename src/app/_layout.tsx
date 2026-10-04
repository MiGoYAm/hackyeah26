import { DefaultTheme, ThemeProvider } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import * as SplashScreen from 'expo-splash-screen';
import { Appearance, Platform } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { useTheme } from '@/hooks/use-theme';

SplashScreen.preventAutoHideAsync();

// The app is light only. Without this the system's dark mode would still recolour native
// parts (status bar icons, tab bar, keyboard, map). app.json's userInterfaceStyle would
// need expo-system-ui on Android and a new native build. The web has no such setter.
if (Platform.OS !== 'web') Appearance.setColorScheme('light');

export default function RootLayout() {
  const theme = useTheme();
  return (
    <ThemeProvider
      value={{
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          primary: theme.accent,
          background: theme.background,
          card: theme.background,
          text: theme.text,
        },
      }}>
      <AnimatedSplashOverlay />
      <NativeTabs
        backgroundColor={theme.background}
        disableIndicator
        tintColor={theme.accent}
        labelStyle={{ selected: { color: theme.accent } }}>
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
