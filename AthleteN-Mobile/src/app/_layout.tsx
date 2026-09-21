import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useColorScheme, View, ActivityIndicator, Text, Pressable } from 'react-native';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import AuthScreen from '@/components/auth-screen';
import OnboardingScreen from '@/components/onboarding-screen';
import AppTabs from '@/components/app-tabs';
import { Colors } from '@/constants/theme';

function AppGate() {
  const { session, profile, loading, profileLoading, authError, retry, refreshProfile } = useAuth();
  if (loading || (session && profileLoading)) return <View style={{flex:1,backgroundColor:Colors.dark.background,alignItems:'center',justifyContent:'center',gap:12}}><ActivityIndicator size="large" color={Colors.dark.accent}/><Text style={{color:Colors.dark.muted}}>Connecting to AthleteN…</Text></View>;
  if (authError) return <View style={{flex:1,backgroundColor:Colors.dark.background,alignItems:'center',justifyContent:'center',padding:28,gap:14}}><Text style={{color:Colors.dark.text,fontSize:20,fontWeight:'800',textAlign:'center'}}>AthleteN connection issue</Text><Text style={{color:Colors.dark.muted,textAlign:'center',lineHeight:20}}>{authError}</Text><Pressable onPress={()=>void retry()} style={{backgroundColor:Colors.dark.accent,paddingHorizontal:28,paddingVertical:13,borderRadius:12}}><Text style={{color:'#fff',fontWeight:'900'}}>RETRY</Text></Pressable></View>;
  if (!session) return <AuthScreen />;
  if (!profile) return <OnboardingScreen userId={session.user.id} onComplete={refreshProfile} />;
  return <AppTabs />;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return <AuthProvider><ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}><AppGate /></ThemeProvider></AuthProvider>;
}
