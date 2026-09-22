import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/theme';

const c = Colors.dark;

export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; next?: string; error?: string; error_description?: string }>();
  const [message, setMessage] = useState('Completing secure sign-in…');

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        if (params.error) throw new Error(params.error_description || params.error);

        const code = typeof params.code === 'string' ? params.code : null;
        if (!code) throw new Error('The authentication link did not contain a valid authorization code.');

        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;

        if (!alive) return;
        setMessage('Success. Opening AthleteN…');

        const next = params.next === 'reset-password' ? '/reset-password' : '/';
        setTimeout(() => { if (alive) void router.replace(next); }, 250);
      } catch (error) {
        if (!alive) return;
        setMessage(error instanceof Error ? error.message : 'Authentication could not be completed.');
      }
    })();

    return () => { alive = false; };
  }, [params.code, params.next, params.error, params.error_description]);

  return (
    <View style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 }}>
      <ActivityIndicator color={c.accent} />
      <Text style={{ color: c.text, fontSize: 18, fontWeight: '900', textAlign: 'center' }}>{message}</Text>
    </View>
  );
}
