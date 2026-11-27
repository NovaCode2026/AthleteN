import React from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { View, Text, ActivityIndicator } from 'react-native';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [booted, setBooted] = React.useState(false);
  React.useEffect(() => {
    setBooted(true);
    void SplashScreen.hideAsync().catch(() => undefined);
    const fallback = setTimeout(() => void SplashScreen.hideAsync().catch(() => undefined), 1500);
    return () => clearTimeout(fallback);
  }, []);

  // Temporary boot-isolation screen: confirms whether the native app can mount
  // the React root at all, independent of auth, routing, providers and screens.
  return (
    <View style={{ flex: 1, backgroundColor: '#050812', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
      <Text style={{ color: '#fff', fontSize: 30, fontWeight: '900', letterSpacing: 1 }}>ATHLETEN</Text>
      <Text style={{ color: '#37B8FF', fontSize: 13, fontWeight: '700', marginTop: 8 }}>BOOT DIAGNOSTIC</Text>
      {booted ? <Text style={{ color: '#7FE0A4', marginTop: 28, fontSize: 16, textAlign: 'center' }}>React root mounted successfully.</Text> : <ActivityIndicator color="#37B8FF" style={{ marginTop: 28 }} />}
      <Text style={{ color: '#AAB4C7', marginTop: 12, textAlign: 'center' }}>This temporary build isolates the blank-screen issue from app providers and navigation.</Text>
    </View>
  );
}
