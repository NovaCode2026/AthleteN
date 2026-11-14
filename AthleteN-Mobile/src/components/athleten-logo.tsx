import React from 'react';
import { Image } from 'expo-image';

// One source of truth: the exact master logo supplied for AthleteN.
const OFFICIAL_LOGO = require('@/assets/logo.webp');

export default function AthleteNLogo({ width = 140, height = 140, style }: { width?: number; height?: number; style?: any }) {
  return <Image source={OFFICIAL_LOGO} style={[{ width, height }, style]} contentFit="contain" accessibilityLabel="AthleteN official master logo" />;
}
