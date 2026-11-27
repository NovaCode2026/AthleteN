import React from 'react';
import { AppRegistry, StatusBar, Text, View } from 'react-native';

function NativeBootIsolation() {
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
    React.createElement(Text, { style: { color: '#7FE0A4', marginTop: 28, fontSize: 16, textAlign: 'center' } }, 'Direct React Native AppRegistry root mounted.'),
    React.createElement(Text, { style: { color: '#AAB4C7', marginTop: 12, textAlign: 'center' } }, 'No Expo Router, OTA, splash module, AuthProvider, ads, notifications or widgets are used in this diagnostic.'),
  );
}

// Expo's Android MainActivity registers the default component under "main".
AppRegistry.registerComponent('main', () => NativeBootIsolation);
