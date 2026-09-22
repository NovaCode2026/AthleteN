import { useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
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

        const initialUrl = await Linking.getInitialURL();
        const callbackUrl = initialUrl || '';
        const parsed = callbackUrl ? Linking.parse(callbackUrl) : { queryParams: {} as Record<string, string> };
        const query = parsed.queryParams || {};
        const code = typeof params.code === 'string' ? params.code : typeof query.code === 'string' ? query.code : null;
        const accessToken = typeof query.access_token === 'string' ? query.access_token : null;
        const refreshToken = typeof query.refresh_token === 'string' ? query.refresh_token : null;

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (error) throw error;
        } else {
          throw new Error('The authentication link did not contain a valid sign-in code.');
        }

        if (!alive) return;
        setMessage('Success. Opening AthleteN…');

        const next = params.next === 'reset-password' || query.next === 'reset-password' ? '/reset-password' : '/';
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
