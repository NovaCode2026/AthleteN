import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { registerForPushNotifications } from '@/lib/push-notifications';
import { Screen, Header, Card, c } from '@/components/mobile-ui';

const fields = [['training', 'Training'], ['competitions', 'Competitions'], ['messages', 'Messages'], ['coach_academy', 'Coach / Academy'], ['achievements', 'Achievements'], ['system', 'System']] as const;
type Preference = Record<(typeof fields)[number][0], boolean> & { message_preview: boolean };
const defaults: Preference = { training: true, competitions: true, messages: true, coach_academy: true, achievements: true, system: true, message_preview: false };

type PushStatus = 'checking' | 'registered' | 'permission-denied' | 'physical-device-required' | 'expo-project-id-missing' | 'registration-cancelled' | 'error' | 'idle';

export default function NotificationSettingsScreen() {
  const { session } = useAuth();
  const [preferences, setPreferences] = useState<Preference>(defaults);
  const [message, setMessage] = useState('');
  const [pushStatus, setPushStatus] = useState<PushStatus>('checking');
  const [pushError, setPushError] = useState('');
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    const { data, error } = await supabase.from('notification_preferences').select('*').eq('user_id', session.user.id).maybeSingle();
    if (error) setMessage(error.message);
    if (data) setPreferences({ ...defaults, ...data });
  }, [session]);

  const checkPushRegistration = useCallback(async () => {
    if (!session?.user.id) { setPushStatus('idle'); return; }
    setRetrying(true);
    setPushStatus('checking');
    setPushError('');
    try {
      const result = await registerForPushNotifications(session.user.id, { requestPermission: false });
      setPushStatus(result.reason);
      if (result.reason === 'registered') setPushError('');
    } catch (error) {
      setPushStatus('error');
      setPushError(error instanceof Error ? error.message : 'Unknown push registration error.');
    } finally {
      setRetrying(false);
    }
  }, [session?.user.id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void checkPushRegistration(); }, [checkPushRegistration]);

  async function toggle(key: keyof Preference) {
    if (!session) return;
    const previous = preferences;
    const next = { ...preferences, [key]: !preferences[key] };
    setPreferences(next);
    const { error } = await supabase.from('notification_preferences').upsert({ user_id: session.user.id, ...next, updated_at: new Date().toISOString() });
    if (error) { setMessage(error.message); setPreferences(previous); }
  }

  const statusCopy: Record<PushStatus, string> = {
    checking: 'Checking device registration…',
    registered: 'This device is registered for push notifications.',
    'permission-denied': 'Android notification permission is not granted to AthleteN.',
    'physical-device-required': 'Push notifications require a physical Android or iOS device.',
    'expo-project-id-missing': 'The Expo project ID is missing from this app build.',
    'registration-cancelled': 'Registration was interrupted. Retry to complete it.',
    error: 'AthleteN could not register this device.',
    idle: 'Sign in to register this device.'
  };

  return <Screen>
    <Header back eyebrow="ATHLETEN SETTINGS" title="Notifications" subtitle="Manage notification preferences and verify this phone is connected to push delivery." />
    <Card>
      <Text style={{ color: c.text, fontSize: 13, fontWeight: '900' }}>DEVICE PUSH STATUS</Text>
      <Text accessibilityLiveRegion="polite" style={{ color: pushStatus === 'registered' ? c.success : pushStatus === 'error' || pushStatus === 'permission-denied' || pushStatus === 'expo-project-id-missing' ? c.danger : c.muted, fontSize: 11, lineHeight: 17, marginTop: 7 }}>{statusCopy[pushStatus]}</Text>
      {pushError ? <Text selectable style={{ color: c.danger, fontSize: 10, lineHeight: 16, marginTop: 6 }}>{pushError}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Retry push notification registration" disabled={retrying || !session} onPress={() => void checkPushRegistration()} style={{ backgroundColor: c.accent, borderRadius: 11, padding: 12, alignItems: 'center', marginTop: 12, opacity: retrying || !session ? 0.65 : 1 }}>
        {retrying ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.7 }}>RETRY DEVICE REGISTRATION</Text>}
      </Pressable>
      <Text style={{ color: c.muted, fontSize: 9, lineHeight: 14, marginTop: 8 }}>Your private push token is never displayed. A successful status means AthleteN saved this device token to your account.</Text>
    </Card>
    <Card>
      {fields.map(([key, label]) => <Pressable key={key} onPress={() => void toggle(key)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <View><Text style={{ color: c.text, fontSize: 13, fontWeight: '800' }}>{label}</Text><Text style={{ color: c.muted, fontSize: 10, marginTop: 3 }}>{preferences[key] ? 'Enabled' : 'Muted'}</Text></View>
        <View style={{ width: 42, height: 24, borderRadius: 12, backgroundColor: preferences[key] ? c.accent : c.border, padding: 3, justifyContent: 'center', alignItems: preferences[key] ? 'flex-end' : 'flex-start' }}><View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff' }} /></View>
      </Pressable>)}
      <Pressable onPress={() => void toggle('message_preview')} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.border }}>
        <View style={{ flex: 1, paddingRight: 12 }}><Text style={{ color: c.text, fontSize: 13, fontWeight: '800' }}>Message previews on lock screen</Text><Text style={{ color: c.muted, fontSize: 10, marginTop: 3 }}>When enabled, push notifications may show the sender and message text. Disabled by default.</Text></View>
        <View style={{ width: 42, height: 24, borderRadius: 12, backgroundColor: preferences.message_preview ? c.accent : c.border, padding: 3, justifyContent: 'center', alignItems: preferences.message_preview ? 'flex-end' : 'flex-start' }}><View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff' }} /></View>
      </Pressable>
    </Card>
    {message ? <Text style={{ color: c.danger, fontSize: 11 }}>{message}</Text> : null}
  </Screen>;
}
