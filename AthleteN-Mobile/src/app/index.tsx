import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import AuthScreen from '@/components/auth-screen';
import OnboardingScreen from '@/components/onboarding-screen';
import AgeVerificationScreen from '@/components/age-verification-screen';
import { Colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

const c = Colors.dark;

function Loading() {
  return (
    <View style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <ActivityIndicator size="large" color={c.accent} />
      <Text style={{ color: c.muted }}>Connecting to AthleteN…</Text>
    </View>
  );
}

export default function EntryGate() {
  const router = useRouter();
  const { session, profile, loading, profileLoading, authError, retry, refreshProfile } = useAuth();
  const [ageStatus, setAgeStatus] = useState<string | null>(null);
  const [ageChecking, setAgeChecking] = useState(false);

  useEffect(() => {
    if (!session || !profile) {
      setAgeStatus(null);
      return;
    }
    let cancelled = false;
    setAgeChecking(true);
    (async () => {
      const { data, error } = await supabase.rpc('get_age_verification_status');
      if (cancelled) return;
      setAgeStatus(error ? null : data?.[0]?.status || null);
      setAgeChecking(false);
    })();
    return () => { cancelled = true; };
  }, [session?.user.id, profile?.user_id]);

  useEffect(() => {
    if (!session || !profile || ageChecking) return;
    const approved = ageStatus === 'approved' || ageStatus === 'not_required' || ageStatus === 'qa_verified';
    if (!approved) return;

    const role = String(profile.role || 'athlete');
    const target =
      role === 'coach' ? '/coach' :
      role === 'academy_admin' || role === 'academy' ? '/academy' :
      role === 'admin' || role === 'super_admin' || role === 'support_admin' ? '/admin' :
      '/(tabs)';

    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) void router.replace(target);
    }, 50);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [session?.user.id, profile?.user_id, profile?.role, ageChecking, ageStatus, router]);

  if (loading || (session && profileLoading) || ageChecking) return <Loading />;

  if (authError) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 }}>
        <Text style={{ color: c.text, fontSize: 20, fontWeight: '800', textAlign: 'center' }}>AthleteN connection issue</Text>
        <Text style={{ color: c.muted, textAlign: 'center', lineHeight: 20 }}>{authError}</Text>
        <Pressable onPress={() => void retry()} style={{ backgroundColor: c.accent, paddingHorizontal: 28, paddingVertical: 13, borderRadius: 12 }}>
          <Text style={{ color: '#fff', fontWeight: '900' }}>RETRY</Text>
        </Pressable>
      </View>
    );
  }

  if (!session) return <AuthScreen />;
  if (!profile) return <OnboardingScreen userId={session.user.id} onComplete={refreshProfile} />;

  const approved = ageStatus === 'approved' || ageStatus === 'not_required' || ageStatus === 'qa_verified';
  if (!approved) return <AgeVerificationScreen />;

  return <Loading />;
}
