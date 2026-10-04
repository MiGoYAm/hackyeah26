/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1C1517',
    background: '#FBF9F8',
    backgroundElement: '#F1E7E8',
    backgroundSelected: '#E6D7D9',
    textSecondary: '#6B5F62',
    accent: '#D4213D',
    onAccent: '#FBF9F8',
  },
  dark: {
    text: '#FBF9F8',
    background: '#151112',
    backgroundElement: '#2A2123',
    backgroundSelected: '#3B2F32',
    textSecondary: '#B5A9AC',
    // Slightly lighter than in light mode so links stay readable on the dark background.
    accent: '#E23A54',
    onAccent: '#FBF9F8',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

// Android lays tab screens out above the tab bar; on iOS the bar floats over them.
export const BottomTabInset = Platform.select({ ios: 50 }) ?? 0;
export const MaxContentWidth = 800;
