import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#08101D',
    background: '#F7F9FC',
    backgroundElement: '#E9EEF7',
    backgroundSelected: '#DDE7F7',
    textSecondary: '#5D6A7D',
  },
  dark: {
    text: '#F8FBFF',
    background: '#05070B',
    backgroundElement: '#141B26',
    backgroundSelected: '#1B2B45',
    textSecondary: '#A7B2C4',
    surface: '#0E141D',
    surfaceRaised: '#121A25',
    border: '#202B3A',
    borderStrong: '#2D4059',
    muted: '#7F8CA1',
    accent: '#4D96FF',
    accentBright: '#69A7FF',
    accentDeep: '#0B2A5D',
    accentSoft: '#10244A',
    success: '#53D6A2',
    warning: '#F3C76B',
    danger: '#F08B9B',
    glow: '#123B7A',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
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

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
