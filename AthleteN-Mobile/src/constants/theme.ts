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
    background: '#070B12',
    backgroundElement: '#121B28',
    backgroundSelected: '#1B3150',
    textSecondary: '#A7B2C4',
    surface: '#101722',
    surfaceRaised: '#172233',
    border: '#263447',
    borderStrong: '#354A66',
    muted: '#91A1B6',
    accent: '#4C8DFF',
    accentBright: '#78B2FF',
    accentDeep: '#0D2B56',
    accentSoft: '#132849',
    success: '#53D6A2',
    warning: '#F3C76B',
    danger: '#F08B9B',
    glow: '#17427A',
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
