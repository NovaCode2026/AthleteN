import React from 'react';
import { Image } from 'expo-image';

// The complete official AthleteN lockup: white A, blue-gradient N, ATHLETEN wordmark.
const OFFICIAL_LOGO = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 760 420\"><defs><linearGradient id=\"n\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#39d7ff\"/><stop offset=\"1\" stop-color=\"#1764e8\"/></linearGradient></defs><rect width=\"760\" height=\"420\" rx=\"52\" fill=\"#050b14\"/><g transform=\"translate(90 35)\"><path d=\"M0 245 94 0h59l96 245h-64l-19-57H91l-20 57H0Zm111-112h38l-19-58-19 58Z\" fill=\"#fff\"/><path d=\"M235 0h66l95 120V0h68v245h-62l-99-125v125h-68V0Z\" fill=\"url(#n)\"/></g><text x=\"380\" y=\"345\" text-anchor=\"middle\" font-family=\"Inter,Arial,sans-serif\" font-size=\"58\" font-weight=\"700\" letter-spacing=\"13\" fill=\"#fff\">ATHLETE<tspan fill=\"#238eff\">N</tspan></text></svg>";
const SOURCE = { uri: `data:image/svg+xml;utf8,${encodeURIComponent(OFFICIAL_LOGO)}` };

export default function AthleteNLogo({ width = 180, height = 100, style }: { width?: number; height?: number; style?: any }) {
  return <Image source={SOURCE} style={[{ width, height }, style]} contentFit="contain" accessibilityLabel="AthleteN official logo" />;
}
