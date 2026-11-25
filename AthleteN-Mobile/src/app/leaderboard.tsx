import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Icon } from '@/components/mobile-ui';

const c = Colors.dark;
type Category = { key: string; label: string; status: 'active' | 'coming_soon'; description: string };
type Entry = { rank: number; displayName: string; totalPoints: number; categories: Record<string, number>; isYou: boolean };
type Payload = {
  period: string;
  timeZone: string;
  resetsAt: string;
  categories: Category[];
  optedIn: boolean;
  displayName: string;
  yourRank: number | null;
  yourPoints: number | null;
  leaderboard: Entry[];
  error?: string;
};

const API_BASE = (process.env.EXPO_PUBLIC_ATHLETEN_API_URL || 'https://athleten.netlify.app').replace(/\/$/, '');
const ALIAS_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]{1,23}$/;

export default function LeaderboardScreen() {
  const router = useRouter();
  const { session, profile, refreshProfile } = useAuth();
  const [data, setData] = useState<Payload | null>(null);
  const [alias, setAlias] = useState('');
  const [optedIn, setOptedIn] = useState(false);
  const [filter, setFilter] = useState('overall');
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setOptedIn(profile?.leaderboard_opt_in === true);
    setAlias(String(profile?.leaderboard_display_name || ''));
  }, [profile?.leaderboard_opt_in, profile?.leaderboard_display_name]);

  const load = useCallback(async () => {
    if (!session?.access_token) {
      setBusy(false);
      setError('Sign in to view the daily leaderboard.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch(API_BASE + '/.netlify/functions/daily-leaderboard', {
        headers: { Authorization: 'Bearer ' + session.access_token }
      });
      const payload = await response.json().catch(() => ({})) as Payload;
      if (!response.ok) throw new Error(payload.error || 'Leaderboard is temporarily unavailable.');
      setData(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Leaderboard is temporarily unavailable.');
    } finally {
      setBusy(false);
    }
  }, [session?.access_token]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!data?.resetsAt) return;
    const resetAt = Date.parse(data.resetsAt);
    if (!Number.isFinite(resetAt)) return;
    const timeout = setTimeout(() => { void load(); }, Math.max(0, resetAt - Date.now()) + 1000);
    return () => clearTimeout(timeout);
  }, [data?.resetsAt, load]);

  const savePreferences = async () => {
    if (!session?.user.id || !supabase) {
      setError('Sign in again before updating leaderboard settings.');
      return;
    }
    if (optedIn && !ALIAS_PATTERN.test(alias.trim())) {
      setError('Choose a public alias with 2–24 letters, numbers, spaces, dots, underscores or hyphens.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    const { error: saveError } = await supabase.from('profiles').update({
      leaderboard_opt_in: optedIn,
      leaderboard_display_name: optedIn ? alias.trim() : null
    }).eq('user_id', session.user.id);
    if (saveError) {
      setError(saveError.message);
    } else {
      setMessage(optedIn ? 'You are now included using your public alias.' : 'You have opted out of public leaderboard rankings.');
      await refreshProfile();
      await load();
    }
    setSaving(false);
  };

  const selectedCategory = data?.categories.find((item) => item.key === filter);
  const rankedRows = useMemo(() => {
    if (!data) return [];
    const scored = data.leaderboard.map((entry) => ({
      ...entry,
      score: filter === 'overall' ? entry.totalPoints : Number(entry.categories[filter] || 0)
    })).filter((entry) => entry.score > 0);
    scored.sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName));
    let previous: number | null = null;
    let rank = 0;
    return scored.map((entry, index) => {
      if (entry.score !== previous) rank = index + 1;
      previous = entry.score;
      return { ...entry, visibleRank: rank };
    });
  }, [data, filter]);

  const resetLabel = data?.resetsAt
    ? new Date(data.resetsAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })
    : '12:00 AM';

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.back} accessibilityRole="button" accessibilityLabel="Go back">
            <Icon name="back" size={18} color={c.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.kicker}>ATHLETEN COMPETE</Text>
            <Text style={s.title}>Daily Leaderboard</Text>
          </View>
          <Pressable onPress={() => void load()} style={s.refresh} accessibilityRole="button" accessibilityLabel="Refresh leaderboard">
            <Icon name="refresh" size={18} color={c.accentBright} />
          </Pressable>
        </View>

        <View style={s.hero}>
          <View style={{ flex: 1 }}>
            <Text style={s.heroKicker}>TODAY'S ATHLETE RANKINGS</Text>
            <Text style={s.heroTitle}>{data?.period || '—'}</Text>
            <Text style={s.heroText}>Daily standings reset at 12:00 AM IST. Each day is calculated using the Asia/Kolkata calendar day.</Text>
          </View>
          <View style={s.reset}><Text style={s.resetValue}>{resetLabel}</Text><Text style={s.resetCaption}>IST RESET</Text></View>
        </View>

        <View style={s.privacy}>
          <Icon name="shield" size={19} color={c.accentBright} />
          <Text style={s.privacyText}>Joining is optional. Only your chosen public alias and points are shown. Your full name, username, photo and private athlete records are not displayed.</Text>
        </View>

        <View style={s.settingsCard}>
          <Text style={s.section}>YOUR LEADERBOARD SETTINGS</Text>
          <Pressable onPress={() => setOptedIn((value) => !value)} style={s.switchRow} accessibilityRole="switch" accessibilityState={{ checked: optedIn }}>
            <View style={{ flex: 1 }}>
              <Text style={s.settingTitle}>{optedIn ? 'Included in daily rankings' : 'Opt in to daily rankings'}</Text>
              <Text style={s.meta}>You can leave the public leaderboard whenever you choose.</Text>
            </View>
            <View style={[s.toggle, optedIn && s.toggleOn]}><View style={[s.toggleDot, optedIn && s.toggleDotOn]} /></View>
          </Pressable>
          {optedIn ? (
            <View style={{ gap: 6 }}>
              <Text style={s.label}>PUBLIC DISPLAY ALIAS</Text>
              <TextInput value={alias} onChangeText={setAlias} maxLength={24} autoCapitalize="words" autoCorrect={false} placeholder="Choose an alias" placeholderTextColor={c.muted} style={s.input}/>
              <Text style={s.meta}>2–24 characters. Do not use your full name or private contact details.</Text>
            </View>
          ) : null}
          <Pressable onPress={() => void savePreferences()} disabled={saving} style={s.primaryButton}>
            {saving ? <ActivityIndicator color="#fff"/> : <Text style={s.primaryButtonText}>SAVE LEADERBOARD SETTINGS</Text>}
          </Pressable>
          {message ? <Text style={s.successText}>{message}</Text> : null}
        </View>

        <View style={s.statsRow}>
          <View style={s.stat}><Text style={s.statValue}>{data?.yourRank ? '#' + data.yourRank : '—'}</Text><Text style={s.statLabel}>YOUR OVERALL RANK</Text></View>
          <View style={s.stat}><Text style={s.statValue}>{data?.yourPoints ?? '—'}</Text><Text style={s.statLabel}>YOUR DAILY POINTS</Text></View>
          <View style={s.stat}><Text style={s.statValue}>{data?.leaderboard.length ?? '—'}</Text><Text style={s.statLabel}>OPTED-IN ATHLETES</Text></View>
        </View>

        <View style={s.sectionBlock}>
          <Text style={s.section}>LEADERBOARD CATEGORIES</Text>
          <View style={s.categoryGrid}>
            <Pressable onPress={() => setFilter('overall')} style={[s.categoryChip, filter === 'overall' && s.categoryChipActive]}>
              <Text style={[s.categoryText, filter === 'overall' && s.categoryTextActive]}>Overall</Text>
            </Pressable>
            {data?.categories.map((category) => (
              <Pressable key={category.key} disabled={category.status !== 'active'} onPress={() => setFilter(category.key)} style={[s.categoryChip, filter === category.key && s.categoryChipActive, category.status !== 'active' && s.categoryChipDisabled]}>
                <Text style={[s.categoryText, filter === category.key && s.categoryTextActive]}>{category.label}{category.status !== 'active' ? ' · Soon' : ''}</Text>
              </Pressable>
            ))}
          </View>
          {selectedCategory ? <Text style={s.meta}>{selectedCategory.description}</Text> : null}
        </View>

        <View style={s.sectionBlock}>
          <View style={s.listHeader}>
            <Text style={s.section}>{filter === 'overall' ? 'OVERALL RANKINGS' : (selectedCategory?.label || 'CATEGORY RANKINGS').toUpperCase()}</Text>
            {busy ? <ActivityIndicator color={c.accentBright} size="small"/> : null}
          </View>
          {error ? <View style={s.empty}><Text style={s.settingTitle}>Leaderboard unavailable</Text><Text style={s.meta}>{error}</Text><Pressable onPress={() => void load()} style={s.retry}><Text style={s.retryText}>TRY AGAIN</Text></Pressable></View> : null}
          {!busy && !error && rankedRows.length === 0 ? <View style={s.empty}><Text style={s.settingTitle}>No ranked activity yet</Text><Text style={s.meta}>Verified activities will appear here. Unverified claims do not add points.</Text></View> : null}
          {rankedRows.map((entry, index) => (
            <View key={entry.displayName + '-' + index} style={[s.rankRow, entry.isYou && s.youRow]}>
              <View style={s.rankBadge}><Text style={s.rankText}>#{entry.visibleRank}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.athleteName}>{entry.displayName}{entry.isYou ? ' · YOU' : ''}</Text>
                <Text style={s.meta}>{filter === 'overall' ? 'Daily total' : 'Category points'}</Text>
              </View>
              <Text style={s.points}>{entry.score} <Text style={s.pointsUnit}>PTS</Text></Text>
            </View>
          ))}
        </View>

        <Text style={s.footer}>Training points are capped at one daily credit. Higher training volume, weight changes, injuries and app screen time do not improve your rank.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  content: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 46, gap: 15, width: '100%', maxWidth: 900, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  back: { width: 42, height: 42, borderRadius: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
  kicker: { color: c.accentBright, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: c.text, fontSize: 28, fontWeight: '900', letterSpacing: -.6, marginTop: 3 },
  refresh: { width: 42, height: 42, borderRadius: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.accent, borderRadius: 22, padding: 19, shadowColor: c.glow, shadowOpacity: .18, shadowRadius: 16, elevation: 3 },
  heroKicker: { color: c.accentBright, fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  heroTitle: { color: c.text, fontSize: 23, fontWeight: '900', marginTop: 4 },
  heroText: { color: c.muted, fontSize: 10, lineHeight: 15, marginTop: 5 },
  reset: { backgroundColor: c.background, borderRadius: 13, padding: 10, alignItems: 'center', minWidth: 82 },
  resetValue: { color: c.text, fontSize: 13, fontWeight: '900' },
  resetCaption: { color: c.accentBright, fontSize: 8, fontWeight: '900', marginTop: 3 },
  privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 13, backgroundColor: c.accentSoft, borderRadius: 14 },
  privacyText: { flex: 1, color: c.muted, fontSize: 10, lineHeight: 15 },
  settingsCard: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.borderStrong, borderRadius: 19, padding: 16, gap: 13, shadowColor: '#000', shadowOpacity: .12, shadowRadius: 12, elevation: 2 },
  section: { color: c.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingTitle: { color: c.text, fontSize: 12, fontWeight: '900' },
  meta: { color: c.muted, fontSize: 9, lineHeight: 14 },
  toggle: { width: 47, height: 27, borderRadius: 20, backgroundColor: c.borderStrong, justifyContent: 'center', padding: 3 },
  toggleOn: { backgroundColor: c.accent },
  toggleDot: { width: 21, height: 21, borderRadius: 11, backgroundColor: '#fff' },
  toggleDotOn: { alignSelf: 'flex-end' },
  label: { color: c.textSecondary, fontSize: 8, fontWeight: '900' },
  input: { backgroundColor: c.background, color: c.text, borderWidth: 1, borderColor: c.border, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 },
  primaryButton: { minHeight: 43, borderRadius: 12, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', padding: 10 },
  primaryButtonText: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: .8 },
  successText: { color: c.success, fontSize: 10 },
  statsRow: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, backgroundColor: c.surface, borderWidth: 1, borderColor: c.borderStrong, borderRadius: 16, padding: 13, gap: 6 },
  statValue: { color: c.text, fontSize: 19, fontWeight: '900' },
  statLabel: { color: c.muted, fontSize: 7, fontWeight: '900', letterSpacing: .5 },
  sectionBlock: { gap: 10 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  categoryChip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
  categoryChipActive: { borderColor: c.accent, backgroundColor: c.accentSoft },
  categoryChipDisabled: { opacity: .45 },
  categoryText: { color: c.muted, fontSize: 9, fontWeight: '800' },
  categoryTextActive: { color: c.accentBright },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  empty: { padding: 16, borderRadius: 16, backgroundColor: c.surface, gap: 7 },
  retry: { alignSelf: 'flex-start', paddingVertical: 8 },
  retryText: { color: c.accentBright, fontSize: 9, fontWeight: '900' },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, borderRadius: 16, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surface },
  youRow: { borderColor: c.accent },
  rankBadge: { width: 38, height: 38, borderRadius: 12, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' },
  rankText: { color: c.accentBright, fontSize: 11, fontWeight: '900' },
  athleteName: { color: c.text, fontSize: 11, fontWeight: '900' },
  points: { color: c.text, fontSize: 18, fontWeight: '900' },
  pointsUnit: { color: c.muted, fontSize: 8 },
  footer: { color: c.muted, fontSize: 9, lineHeight: 14, paddingHorizontal: 3 }
});
