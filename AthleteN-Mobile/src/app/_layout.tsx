import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme, View, ActivityIndicator } from 'react-native';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import AuthScreen from '@/components/auth-screen';
import OnboardingScreen from '@/components/onboarding-screen';
import AppTabs from '@/components/app-tabs';
import { Colors } from '@/constants/theme';

SplashScreen.preventAutoHideAsync();

function AppGate() {
  const { session, profile, loading, profileLoading, refreshProfile } = useAuth();
  if (loading || (session && profileLoading)) return <View style={{ flex:1, backgroundColor:Colors.dark.background, alignItems:'center', justifyContent:'center' }}><ActivityIndicator color={Colors.dark.accent}/></View>;
  if (!session) return <AuthScreen />;
  if (!profile) return <OnboardingScreen userId={session.user.id} onComplete={refreshProfile} />;
  return <AppTabs />;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return <AuthProvider><ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}><AppGate /></ThemeProvider></AuthProvider>;
}
