import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

const c = Colors.dark;
type Badge = {
  badge_key: string;
  badge_label: string;
  description: string;
  category: string;
  rarity: string;
  icon: string;
  is_system_badge: boolean;
};
type Award = {
  id: string;
  user_id: string;
  badge_key: string;
  badge_label: string;
  awarded_at: string;
  permanent: boolean;
};
type AthleteProfile = {
  user_id: string;
  username: string | null;
  full_name: string | null;
};

export default function AdminBadgesScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const allowed = ['admin', 'super_admin', 'support_admin'].includes(String(profile?.role || ''));
  const [badges, setBadges] = useState<Badge[]>([]);
  const [awards, setAwards] = useState<Award[]>([]);
  const [athleteLabels, setAthleteLabels] = useState<Record<string, string>>({});
  const [athleteUsername, setAthleteUsername] = useState('');
  const [selectedAthlete, setSelectedAthlete] = useState<AthleteProfile | null>(null);
  const [badgeKey, setBadgeKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [badgeResult, awardResult] = await Promise.all([
      supabase.from('badge_definitions').select('*').order('category').order('badge_label'),
      supabase.from('athlete_badges')
        .select('id,user_id,badge_key,badge_label,awarded_at,permanent')
        .order('awarded_at', { ascending: false })
        .limit(100),
    ]);

    if (badgeResult.error || awardResult.error) {
      setMessage(badgeResult.error?.message || awardResult.error?.message || 'Could not load badge administration.');
    }
    setBadges((badgeResult.data || []) as Badge[]);
    setAwards((awardResult.data || []) as Award[]);

    const userIds = [...new Set((awardResult.data || []).map((row) => row.user_id).filter(Boolean))];
    if (userIds.length) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id,username,full_name')
        .in('user_id', userIds);
      const labels: Record<string, string> = {};
      for (const athlete of (profiles || []) as AthleteProfile[]) {
        labels[athlete.user_id] = athlete.username
          ? '@' + athlete.username
          : athlete.full_name || 'Athlete account';
      }
      setAthleteLabels(labels);
    } else {
      setAthleteLabels({});
    }
    setLoading(false);
  }, [allowed]);

  useEffect(() => { void load(); }, [load]);

  async function resolveAthlete() {
    if (!allowed || resolving || busy) return;
    const cleanUsername = athleteUsername.trim().replace(/^@/, '').toLowerCase();
    if (!/^[a-z0-9][a-z0-9_.-]{2,29}$/.test(cleanUsername)) {
      setSelectedAthlete(null);
      setMessage('Enter a valid username (3–30 letters, numbers, dots, underscores or hyphens).');
      return;
    }

    setResolving(true);
    setMessage('');
    setSelectedAthlete(null);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id,username,full_name')
        .ilike('username', cleanUsername)
        .eq('role', 'athlete')
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        setMessage('No Athlete account was found for @' + cleanUsername + '. Check the username and try again.');
        return;
      }
      const athlete = data as AthleteProfile;
      setSelectedAthlete(athlete);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not verify that Athlete username.');
    } finally {
      setResolving(false);
    }
  }

  async function award() {
    if (!allowed || !selectedAthlete || !badgeKey || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const { error } = await supabase.rpc('admin_award_badge', {
        p_user_id: selectedAthlete.user_id,
        p_badge_key: badgeKey,
        p_metadata: { source: 'admin_panel' },
      });
      if (error) throw error;
      const label = selectedAthlete.username ? '@' + selectedAthlete.username : selectedAthlete.full_name || 'Athlete';
      setMessage('Badge awarded to ' + label + '.');
      setAthleteUsername('');
      setSelectedAthlete(null);
      setBadgeKey('');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Badge could not be awarded.');
    } finally {
      setBusy(false);
    }
  }

  function revoke(id: string, permanent: boolean) {
    if (permanent) {
      setMessage('Permanent system badges cannot be revoked.');
      return;
    }
    Alert.alert('Revoke badge', 'This removes the earned badge.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          const { error } = await supabase.rpc('admin_revoke_badge', { p_badge_id: id });
          setBusy(false);
          if (error) setMessage(error.message);
          else await load();
        },
      },
    ]);
  }

  if (!allowed) {
    return <SafeAreaView style={s.screen}><View style={s.denied}><Text style={s.title}>Admin access required</Text><Pressable onPress={() => router.back()} style={s.secondary}><Text style={s.secondaryText}>GO BACK</Text></Pressable></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} style={s.back}><Text style={s.backText}>‹ BACK</Text></Pressable>
        <Text style={s.kicker}>BADGE ADMINISTRATION</Text>
        <Text style={s.title}>Badge Control</Text>
        <Text style={s.sub}>Find an Athlete by username, then award an eligible badge. System badges remain permanent.</Text>

        <View style={s.panel}>
          <Text style={s.head}>AWARD BADGE</Text>
          <Text style={s.label}>ATHLETE USERNAME</Text>
          <TextInput
            value={athleteUsername}
            onChangeText={(value) => {
              setAthleteUsername(value);
              setSelectedAthlete(null);
              setMessage('');
            }}
            placeholder="Enter username (e.g. @pratyaksh)"
            placeholderTextColor={c.muted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => void resolveAthlete()}
            style={s.input}
          />
          <Pressable disabled={resolving || busy || !athleteUsername.trim()} onPress={() => void resolveAthlete()} style={[s.secondary, (resolving || busy) && s.disabled]}>
            {resolving ? <ActivityIndicator color={c.accentBright}/> : <Text style={s.secondaryText}>FIND ATHLETE</Text>}
          </Pressable>
          {selectedAthlete ? (
            <View style={s.verifiedAthlete}>
              <View style={{ flex: 1 }}>
                <Text style={s.verifiedTitle}>ATHLETE FOUND</Text>
                <Text style={s.verifiedName}>{selectedAthlete.full_name || 'Athlete'}</Text>
                <Text style={s.meta}>@{selectedAthlete.username || 'username unavailable'}</Text>
              </View>
              <Text style={s.verifiedTag}>VERIFIED</Text>
            </View>
          ) : null}

          <Text style={s.label}>CHOOSE BADGE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.picker}>
            {badges.filter((badge) => !badge.is_system_badge).map((badge) => (
              <Pressable key={badge.badge_key} onPress={() => setBadgeKey(badge.badge_key)} style={[s.choice, badgeKey === badge.badge_key && s.active]}>
                <Text style={s.choiceIcon}>{badge.icon}</Text>
                <Text style={s.choiceText}>{badge.badge_label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable disabled={busy || !selectedAthlete || !badgeKey} onPress={() => void award()} style={[s.primary, (busy || !selectedAthlete || !badgeKey) && s.disabled]}>
            {busy ? <ActivityIndicator color="#fff"/> : <Text style={s.primaryText}>AWARD SECURELY</Text>}
          </Pressable>
          {message ? <Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text> : null}
        </View>

        <View style={s.sectionRow}>
          <Text style={s.section}>RECENT AWARDS</Text>
          <Pressable onPress={() => void load()} disabled={loading}><Text style={s.refresh}>REFRESH</Text></Pressable>
        </View>
        {loading ? <ActivityIndicator color={c.accentBright}/> : awards.length ? awards.map((awardRow) => (
          <View key={awardRow.id} style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{awardRow.badge_label}</Text>
              <Text style={s.meta}>{athleteLabels[awardRow.user_id] || 'Athlete account'} · {new Date(awardRow.awarded_at).toLocaleString()}</Text>
            </View>
            <Pressable onPress={() => revoke(awardRow.id, awardRow.permanent)} disabled={busy}>
              <Text style={[s.revoke, awardRow.permanent && s.disabled]}>{awardRow.permanent ? 'PERMANENT' : 'REVOKE'}</Text>
            </Pressable>
          </View>
        )) : <Text style={s.meta}>No badge awards have been recorded yet.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  content: { padding: 18, paddingTop: 10, paddingBottom: 50, gap: 12 },
  back: { alignSelf: 'flex-start', paddingVertical: 3 },
  backText: { color: c.accentBright, fontSize: 12, fontWeight: '900' },
  kicker: { color: c.accentBright, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: c.text, fontSize: 30, fontWeight: '900', marginTop: 5 },
  sub: { color: c.muted, fontSize: 11, lineHeight: 17 },
  panel: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.borderStrong, borderRadius: 20, padding: 15, gap: 10 },
  head: { color: c.text, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  label: { color: c.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  input: { backgroundColor: c.background, borderWidth: 1, borderColor: c.border, borderRadius: 12, color: c.text, padding: 12, fontSize: 13 },
  picker: { gap: 7, paddingRight: 4 },
  choice: { width: 125, minHeight: 100, borderWidth: 1, borderColor: c.border, borderRadius: 14, padding: 10, backgroundColor: c.background, justifyContent: 'center' },
  active: { borderColor: c.accent, backgroundColor: c.accentSoft },
  choiceIcon: { fontSize: 23 },
  choiceText: { color: c.text, fontSize: 10, fontWeight: '800', marginTop: 7 },
  primary: { backgroundColor: c.accent, borderRadius: 12, padding: 14, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  secondary: { borderWidth: 1, borderColor: c.borderStrong, borderRadius: 12, padding: 12, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: c.accentBright, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  verifiedAthlete: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.accentSoft, borderWidth: 1, borderColor: c.accent, borderRadius: 13, padding: 12 },
  verifiedTitle: { color: c.accentBright, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  verifiedName: { color: c.text, fontSize: 12, fontWeight: '900', marginTop: 3 },
  verifiedTag: { color: c.success, fontSize: 8, fontWeight: '900' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  section: { color: c.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  refresh: { color: c.accentBright, fontSize: 9, fontWeight: '900' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 15, padding: 12 },
  name: { color: c.text, fontSize: 12, fontWeight: '900' },
  meta: { color: c.muted, fontSize: 9, lineHeight: 14, marginTop: 3 },
  revoke: { color: c.danger, fontSize: 8, fontWeight: '900' },
  disabled: { opacity: 0.55, color: c.muted },
  message: { color: c.accentBright, fontSize: 10, lineHeight: 15 },
  denied: { flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 14 },
});