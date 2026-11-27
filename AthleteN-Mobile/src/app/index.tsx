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

function Loading({ onRetry }: { onRetry?: () => void }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 12000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
      {!slow && <ActivityIndicator size="large" color={c.accent} />}
      <Text style={{ color: c.text, fontSize: 21, fontWeight: '900', letterSpacing: 1.2, textAlign: 'center' }}>{slow ? 'STARTUP IS TAKING TOO LONG' : 'WELCOME TO THE FUTURE'}</Text>
      <Text style={{ color: c.muted, fontSize: 12, textAlign: 'center' }}>{slow ? 'AthleteN is waiting on startup/authentication. Tap retry to reconnect.' : 'Connecting to AthleteN…'}</Text>
      {slow && onRetry ? <Pressable onPress={onRetry} style={{ backgroundColor: c.accent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}><Text style={{ color: '#fff', fontWeight: '900' }}>RETRY</Text></Pressable> : null}
    </View>
  );
}

function RetryScreen({ title, detail, onRetry }: { title: string; detail: string; onRetry: () => void }) {
  return (
    <View style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 28 }}>
      <Text style={{ color: c.text, fontSize: 20, fontWeight: '900', textAlign: 'center' }}>{title}</Text>
      <Text style={{ color: c.muted, textAlign: 'center', lineHeight: 20 }}>{detail}</Text>
      <Pressable onPress={onRetry} style={{ backgroundColor: c.accent, paddingHorizontal: 28, paddingVertical: 13, borderRadius: 12 }}>
        <Text style={{ color: '#fff', fontWeight: '900' }}>RETRY</Text>
      </Pressable>
    </View>
  );
}

export default function EntryGate() {
  const router = useRouter();
  const { session, profile, loading, profileLoading, authError, retry, refreshProfile } = useAuth();
  const [ageStatus, setAgeStatus] = useState<string | null>(null);
  const [ageChecking, setAgeChecking] = useState(false);
  const [ageRetry, setAgeRetry] = useState(0);
  const [academySetup, setAcademySetup] = useState<'checking' | 'required' | 'complete' | 'not_applicable' | 'error'>('not_applicable');
  const [academyRetry, setAcademyRetry] = useState(0);

  useEffect(() => {
    if (!session || !profile) {
      setAgeStatus(null);
      setAgeChecking(false);
      return;
    }
    let cancelled = false;
    setAgeChecking(true);
    setAgeStatus(null);
    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_age_verification_status');
        if (error) throw error;
        if (!cancelled) setAgeStatus(data?.[0]?.status || null);
      } catch (error) {
        console.warn('[AthleteN] age-verification status lookup failed', error instanceof Error ? error.message : error);
        if (!cancelled) setAgeStatus('error');
      } finally {
        if (!cancelled) setAgeChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [session?.user.id, profile?.user_id, ageRetry]);

  useEffect(() => {
    if (!session || !profile || ageChecking || ageStatus === 'error') return;
    const isAcademyPlan = String(profile.plan_id || '').toLowerCase() === 'academy';
    if (!isAcademyPlan) {
      setAcademySetup('not_applicable');
      return;
    }
    let cancelled = false;
    setAcademySetup('checking');
    (async () => {
      try {
        if (!profile.academy_id) {
          if (!cancelled) setAcademySetup('required');
          return;
        }
        const { data, error } = await supabase.from('academies').select('setup_completed,status').eq('id', String(profile.academy_id)).maybeSingle();
        if (error) throw error;
        if (cancelled) return;
        setAcademySetup(!data || data.status !== 'active' || data.setup_completed !== true ? 'required' : 'complete');
      } catch (error) {
        console.warn('[AthleteN] academy setup lookup failed', error instanceof Error ? error.message : error);
        if (!cancelled) setAcademySetup('error');
      }
    })();
    return () => { cancelled = true; };
  }, [session?.user.id, profile?.user_id, profile?.role, profile?.plan_id, profile?.academy_id, ageChecking, ageStatus, academyRetry]);

  useEffect(() => {
    if (!session || !profile || ageChecking || ageStatus === 'error' || academySetup === 'checking' || academySetup === 'error') return;
    const approved = ageStatus === 'approved' || ageStatus === 'not_required' || ageStatus === 'qa_verified';
    if (!approved) return;

    if (String(profile.plan_id || '').toLowerCase() === 'academy' && academySetup === 'required') {
      const timer = setTimeout(() => void router.replace('/academy-setup' as any), 50);
      return () => clearTimeout(timer);
    }
    const role = String(profile.role || 'athlete');
    const target = role === 'coach' ? '/coach' : role === 'academy_admin' || role === 'academy' ? '/academy' : '/(tabs)';
    const timer = setTimeout(() => void router.replace(target), 50);
    return () => clearTimeout(timer);
  }, [session?.user.id, profile?.user_id, profile?.role, ageChecking, ageStatus, academySetup, router]);

  if (loading || (session && profileLoading) || ageChecking || (session && profile && String(profile.plan_id || '').toLowerCase() === 'academy' && academySetup === 'checking')) {
    return <Loading onRetry={() => void retry()} />;
  }

  if (authError) {
    return <RetryScreen title="AthleteN connection issue" detail={authError} onRetry={() => void retry()} />;
  }

  if (!session) return <AuthScreen />;
  if (!profile) return <OnboardingScreen userId={session.user.id} onComplete={refreshProfile} />;

  if (ageStatus === 'error') {
    return <RetryScreen title="Could not verify account status" detail="The age-verification service did not respond. Your account has not been changed. Retry when your connection is available." onRetry={() => setAgeRetry((n) => n + 1)} />;
  }

  if (String(profile.plan_id || '').toLowerCase() === 'academy' && academySetup === 'error') {
    return <RetryScreen title="Academy setup check unavailable" detail="AthleteN could not confirm your academy setup. Retry instead of redirecting based on incomplete data." onRetry={() => setAcademyRetry((n) => n + 1)} />;
  }

  const approved = ageStatus === 'approved' || ageStatus === 'not_required' || ageStatus === 'qa_verified';
  if (!approved) return <AgeVerificationScreen />;

  return <Loading onRetry={() => void refreshProfile()} />;
}
