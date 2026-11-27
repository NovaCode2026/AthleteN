import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#101827',
    background: '#F4F7FC',
    backgroundElement: '#E9EFF8',
    backgroundSelected: '#DCE8F8',
    textSecondary: '#53647A',
  },
  dark: {
    text: '#F5F8FE',
    background: '#080D16',
    backgroundElement: '#101A29',
    backgroundSelected: '#192E4B',
    textSecondary: '#B8C7DA',
    surface: '#111B2A',
    surfaceRaised: '#19283B',
    border: '#27394F',
    borderStrong: '#3B5270',
    muted: '#99AABF',
    accent: '#4D91FF',
    accentBright: '#86C8FF',
    accentDeep: '#123B70',
    accentSoft: '#142D4C',
    success: '#5BD9AD',
    warning: '#F4CC78',
    danger: '#F28B9B',
    glow: '#1A4A83',
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
