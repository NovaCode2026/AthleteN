import { DarkTheme, DefaultTheme, ThemeProvider, Stack } from 'expo-router';
import { useColorScheme, View, ActivityIndicator, Text, Pressable } from 'react-native';
import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import AuthScreen from '@/components/auth-screen';
import OnboardingScreen from '@/components/onboarding-screen';
import { Colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import AgeVerificationScreen from '@/components/age-verification-screen';

function RoleGate({ profile }: { profile: any }) {
  const role = String(profile?.role || 'athlete');
  const isCoach = role === 'coach';
  const isAcademy = role === 'academy_admin' || role === 'academy';
  if (isCoach) return <Stack screenOptions={{headerShown:false}}>
    <Stack.Screen name="coach" options={{headerShown:false}} />
    <Stack.Screen name="coach-athletes" options={{headerShown:false}} />
    <Stack.Screen name="coach-more" options={{headerShown:false}} />
    <Stack.Screen name="coach-profile" options={{headerShown:false}} />
    <Stack.Screen name="coach-training" options={{headerShown:false}} />
    <Stack.Screen name="coach-tournaments" options={{headerShown:false}} />
    <Stack.Screen name="coach-competition" options={{headerShown:false}} />
    <Stack.Screen name="scanner" options={{headerShown:false}} />
    <Stack.Screen name="messages" options={{headerShown:false}} />
    <Stack.Screen name="conversation" options={{headerShown:false}} />
  </Stack>;
  if (isAcademy) return <Stack screenOptions={{headerShown:false}}><Stack.Screen name="academy" options={{headerShown:false}} /></Stack>;
  return <AthleteRoutes />;
}

function AthleteRoutes() {
  return <Stack screenOptions={{headerShown:false}} initialRouteName="(tabs)">
    <Stack.Screen name="(tabs)" options={{headerShown:false}} />
    <Stack.Screen name="explore" options={{headerShown:false}} />
    <Stack.Screen name="taekwondo" options={{headerShown:false}} />
    <Stack.Screen name="checklist" options={{headerShown:false}} />
    <Stack.Screen name="weight" options={{headerShown:false}} />
    <Stack.Screen name="calendar" options={{headerShown:false}} />
    <Stack.Screen name="medals" options={{headerShown:false}} />
    <Stack.Screen name="documents" options={{headerShown:false}} />
    <Stack.Screen name="verification" options={{headerShown:false}} />
    <Stack.Screen name="messages" options={{headerShown:false}} />
    <Stack.Screen name="conversation" options={{headerShown:false}} />
    <Stack.Screen name="team" options={{headerShown:false}} />
    <Stack.Screen name="roadmap" options={{headerShown:false}} />
    <Stack.Screen name="feedback" options={{headerShown:false}} />
    <Stack.Screen name="notifications" options={{headerShown:false}} />
    <Stack.Screen name="scanner" options={{headerShown:false}} />
    <Stack.Screen name="plans" options={{headerShown:false}} />
    <Stack.Screen name="navigation-settings" options={{headerShown:false}} />
    <Stack.Screen name="ai-coach" options={{headerShown:false}} />
  </Stack>;
}

function AgeVerificationGate({ profile }: { profile: any }) {
  const [status, setStatus] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const load = async () => { setChecking(true); const { data, error } = await supabase.rpc('get_age_verification_status'); setStatus(error ? null : data?.[0]?.status || null); setChecking(false); };
  useEffect(() => { void load(); }, [profile?.user_id]);
  if (checking) return <View style={{flex:1,backgroundColor:Colors.dark.background,alignItems:'center',justifyContent:'center'}}><ActivityIndicator color={Colors.dark.accent}/></View>;
  if (status !== 'approved' && status !== 'not_required' && status !== 'qa_verified') return <AgeVerificationScreen />;
  return <RoleGate profile={profile} />;
}

function AppGate() {
  const { session, profile, loading, profileLoading, authError, retry, refreshProfile } = useAuth();
  if (loading || (session && profileLoading)) return <View style={{flex:1,backgroundColor:Colors.dark.background,alignItems:'center',justifyContent:'center',gap:12}}><ActivityIndicator size="large" color={Colors.dark.accent}/><Text style={{color:Colors.dark.muted}}>Connecting to AthleteN…</Text></View>;
  if (authError) return <View style={{flex:1,backgroundColor:Colors.dark.background,alignItems:'center',justifyContent:'center',padding:28,gap:14}}><Text style={{color:Colors.dark.text,fontSize:20,fontWeight:'800',textAlign:'center'}}>AthleteN connection issue</Text><Text style={{color:Colors.dark.muted,textAlign:'center',lineHeight:20}}>{authError}</Text><Pressable onPress={()=>void retry()} style={{backgroundColor:Colors.dark.accent,paddingHorizontal:28,paddingVertical:13,borderRadius:12}}><Text style={{color:'#fff',fontWeight:'900'}}>RETRY</Text></Pressable></View>;
  if (!session) return <AuthScreen />;
  if (!profile) return <OnboardingScreen userId={session.user.id} onComplete={refreshProfile} />;
  return <AgeVerificationGate profile={profile} />;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return <AuthProvider><ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}><AppGate /></ThemeProvider></AuthProvider>;
}
