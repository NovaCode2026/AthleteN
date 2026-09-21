import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme, View, ActivityIndicator } from 'react-native';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import AuthScreen from '@/components/auth-screen';
import AppTabs from '@/components/app-tabs';
import { Colors } from '@/constants/theme';

SplashScreen.preventAutoHideAsync();

function AppGate() {
  const { session, loading } = useAuth();
  if (loading) return <View style={{ flex: 1, backgroundColor: Colors.dark.background, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={Colors.dark.accent} /></View>;
  return session ? <AppTabs /> : <AuthScreen />;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AppGate />
      </ThemeProvider>
    </AuthProvider>
  );
}
