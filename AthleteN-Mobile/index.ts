import React from 'react';
import { registerRootComponent } from 'expo';
import { View, Text, StatusBar } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

function NativeBootIsolation() {
  React.useEffect(() => {
    void SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  return React.createElement(
    View,
    {
      style: {
        flex: 1,
        backgroundColor: '#050812',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 28,
      },
    },
    React.createElement(StatusBar, { barStyle: 'light-content', backgroundColor: '#050812' }),
    React.createElement(Text, { style: { color: '#fff', fontSize: 30, fontWeight: '900', letterSpacing: 1 } }, 'ATHLETEN'),
    React.createElement(Text, { style: { color: '#37B8FF', fontSize: 13, fontWeight: '700', marginTop: 8 } }, 'NATIVE BOOT ISOLATION'),
    React.createElement(Text, { style: { color: '#7FE0A4', marginTop: 28, fontSize: 16, textAlign: 'center' } }, 'Direct React Native root mounted.'),
    React.createElement(Text, { style: { color: '#AAB4C7', marginTop: 12, textAlign: 'center' } }, 'Expo Router, OTA updates, app providers, widgets and feature screens are bypassed for this diagnostic.'),
  );
}

registerRootComponent(NativeBootIsolation);
