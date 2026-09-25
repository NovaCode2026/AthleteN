import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Screen, Header, Card, c } from '@/components/mobile-ui';

const fields = [['training', 'Training'], ['competitions', 'Competitions'], ['messages', 'Messages'], ['coach_academy', 'Coach / Academy'], ['achievements', 'Achievements'], ['system', 'System']] as const;
type Preference = Record<(typeof fields)[number][0], boolean>;
const defaults: Preference = { training: true, competitions: true, messages: true, coach_academy: true, achievements: true, system: true };

export default function NotificationSettingsScreen() {
  const { session } = useAuth(); const [preferences, setPreferences] = useState<Preference>(defaults); const [message, setMessage] = useState('');
  const load = useCallback(async () => { if (!session) return; const { data, error } = await supabase.from('notification_preferences').select('*').eq('user_id', session.user.id).maybeSingle(); if (error) setMessage(error.message); if (data) setPreferences({ ...defaults, ...data }); }, [session]);
  useEffect(() => { void load(); }, [load]);
  async function toggle(key: keyof Preference) { if (!session) return; const next = { ...preferences, [key]: !preferences[key] }; setPreferences(next); const { error } = await supabase.from('notification_preferences').upsert({ user_id: session.user.id, ...next, updated_at: new Date().toISOString() }); if (error) { setMessage(error.message); setPreferences(preferences); } }
  return <Screen><Header back eyebrow="ATHLETEN SETTINGS" title="Notifications" subtitle="Choose which real AthleteN updates reach your device and inbox." /><Card>{fields.map(([key, label]) => <Pressable key={key} onPress={() => void toggle(key)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}><View><Text style={{ color: c.text, fontSize: 13, fontWeight: '800' }}>{label}</Text><Text style={{ color: c.muted, fontSize: 10, marginTop: 3 }}>{preferences[key] ? 'Enabled' : 'Muted'}</Text></View><View style={{ width: 42, height: 24, borderRadius: 12, backgroundColor: preferences[key] ? c.accent : c.border, padding: 3, justifyContent: 'center', alignItems: preferences[key] ? 'flex-end' : 'flex-start' }}><View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff' }} /></View></Pressable>)}</Card>{message ? <Text style={{ color: c.danger, fontSize: 11 }}>{message}</Text> : null}</Screen>;
}
