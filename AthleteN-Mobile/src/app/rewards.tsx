import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { Icon } from '@/components/mobile-ui';
import { useAuth } from '@/context/AuthContext';

const c = Colors.dark;
type RewardEvent = {
  id: string;
  rewardKey: string;
  amount: number;
  eventType: string;
  expiresAt: string | null;
  createdAt: string;
  provider: string;
};
type Wallet = {
  balance: number;
  dailyAdsUsed: number;
  dailyAdsLimit: number;
  monthlyAdCreditsEarned: number;
  monthlyAdCreditsLimit: number;
  history: RewardEvent[];
};

export default function RewardsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!session?.access_token) {
      setBusy(false);
      setError('Sign in to view your Rewards Centre.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const base = (process.env.EXPO_PUBLIC_ATHLETEN_API_URL || 'https://athleten.netlify.app').replace(/\/$/, '');
      const response = await fetch(base + '/.netlify/functions/reward-wallet', {
        headers: { Authorization: 'Bearer ' + session.access_token }
      });
      const payload = await response.json().catch(() => ({})) as Partial<Wallet> & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Rewards are temporarily unavailable.');
      setWallet({
        balance: Number(payload.balance || 0),
        dailyAdsUsed: Number(payload.dailyAdsUsed || 0),
        dailyAdsLimit: Number(payload.dailyAdsLimit || 3),
        monthlyAdCreditsEarned: Number(payload.monthlyAdCreditsEarned || 0),
        monthlyAdCreditsLimit: Number(payload.monthlyAdCreditsLimit || 30),
        history: Array.isArray(payload.history) ? payload.history : []
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rewards are temporarily unavailable.');
    } finally {
      setBusy(false);
    }
  }, [session?.access_token]);

  useEffect(() => { void load(); }, [load]);

  const dateLabel = (value: string | null) => value
    ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : 'No expiry';

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.back} accessibilityRole="button" accessibilityLabel="Go back">
            <Icon name="arrow" size={17} color={c.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.kicker}>ATHLETEN BENEFITS</Text>
            <Text style={s.title}>Rewards Centre</Text>
          </View>
          <Pressable onPress={() => void load()} style={s.refresh} accessibilityRole="button" accessibilityLabel="Refresh rewards">
            <Icon name="refresh" size={18} color={c.accentBright} />
          </Pressable>
        </View>

        <View style={s.hero}>
          <Text style={s.heroKicker}>YOUR REWARD BALANCE</Text>
          <View style={s.balanceRow}>
            <Text style={s.balance}>{wallet?.balance ?? '—'}</Text>
            <Text style={s.balanceUnit}>AI messages</Text>
          </View>
          <Text style={s.heroText}>Verified reward credits are separate from your plan's monthly AI allowance.</Text>
        </View>

        <View style={s.stats}>
          <View style={s.stat}>
            <Text style={s.statValue}>{wallet ? wallet.dailyAdsUsed + '/' + wallet.dailyAdsLimit : '—'}</Text>
            <Text style={s.statLabel}>ADS TODAY</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statValue}>{wallet ? wallet.monthlyAdCreditsEarned + '/' + wallet.monthlyAdCreditsLimit : '—'}</Text>
            <Text style={s.statLabel}>BONUS CREDITS THIS MONTH</Text>
          </View>
        </View>

        <View style={s.notice}>
          <View style={s.noticeIcon}><Icon name="shield" size={18} color={c.accentBright} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.noticeTitle}>Rewarded ads are not live yet</Text>
            <Text style={s.noticeText}>The feature is being integrated and reviewed. No ad will play until the provider, privacy, age-safety and release checks are approved. Your existing AthleteN access is not affected.</Text>
          </View>
        </View>

        <View style={s.ruleCard}>
          <Text style={s.section}>HOW REWARDS WILL WORK</Text>
          <View style={s.ruleRow}><Text style={s.ruleNumber}>+2</Text><View style={{ flex: 1 }}><Text style={s.ruleTitle}>AI messages per verified ad</Text><Text style={s.meta}>Only a completed and server-verified ad can issue credits.</Text></View></View>
          <View style={s.ruleRow}><Text style={s.ruleNumber}>3</Text><View style={{ flex: 1 }}><Text style={s.ruleTitle}>Maximum rewarded ads per day</Text><Text style={s.meta}>The daily limit is enforced by the server.</Text></View></View>
          <View style={s.ruleRow}><Text style={s.ruleNumber}>30</Text><View style={{ flex: 1 }}><Text style={s.ruleTitle}>Maximum bonus messages per month</Text><Text style={s.meta}>Unused ad-earned credits expire at month end and do not roll over.</Text></View></View>
        </View>

        <View style={s.historyHeader}>
          <Text style={s.section}>REWARD HISTORY</Text>
          {busy ? <ActivityIndicator color={c.accentBright} size="small" /> : null}
        </View>
        {error ? <View style={s.empty}><Text style={s.emptyTitle}>Wallet unavailable</Text><Text style={s.meta}>{error}</Text><Pressable onPress={() => void load()} style={s.retry}><Text style={s.retryText}>TRY AGAIN</Text></Pressable></View> : null}
        {!error && !busy && wallet?.history.length === 0 ? <View style={s.empty}><Text style={s.emptyTitle}>No rewards yet</Text><Text style={s.meta}>When rewards become available, verified credits and their expiry dates will appear here.</Text></View> : null}
        {!error ? wallet?.history.map((event) => (
          <View key={event.id} style={s.historyRow}>
            <View style={s.historyIcon}><Icon name={event.amount > 0 ? 'gift' : 'check'} size={17} color={event.amount > 0 ? c.success : c.muted} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.historyTitle}>{event.eventType === 'earned' ? 'Reward earned' : event.eventType === 'redeemed' ? 'AI message used' : event.eventType === 'reversed' ? 'Credit returned' : 'Reward updated'}</Text>
              <Text style={s.meta}>{new Date(event.createdAt).toLocaleString()} · Expires {dateLabel(event.expiresAt)}</Text>
            </View>
            <Text style={[s.historyAmount, event.amount < 0 && { color: c.muted }]}>{event.amount > 0 ? '+' : ''}{event.amount}</Text>
          </View>
        )) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  content: { padding: 18, paddingBottom: 28, gap: 13 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  back: { width: 42, height: 42, borderRadius: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '180deg' }] },
  kicker: { color: c.accentBright, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: c.text, fontSize: 29, fontWeight: '900', marginTop: 3 },
  refresh: { width: 42, height: 42, borderRadius: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
  hero: { backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.accent, borderRadius: 22, padding: 20, gap: 7 },
  heroKicker: { color: c.accentBright, fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  balanceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  balance: { color: c.text, fontSize: 43, fontWeight: '900' },
  balanceUnit: { color: c.muted, fontSize: 12, fontWeight: '800' },
  heroText: { color: c.muted, fontSize: 11, lineHeight: 17 },
  stats: { flexDirection: 'row', gap: 9 },
  stat: { flex: 1, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 17, padding: 14, gap: 5 },
  statValue: { color: c.text, fontSize: 20, fontWeight: '900' },
  statLabel: { color: c.muted, fontSize: 8, fontWeight: '900', letterSpacing: .8 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, padding: 14, borderRadius: 17, backgroundColor: c.accentSoft, borderWidth: 1, borderColor: c.borderStrong },
  noticeIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface },
  noticeTitle: { color: c.text, fontSize: 13, fontWeight: '900' },
  noticeText: { color: c.muted, fontSize: 10, lineHeight: 16, marginTop: 4 },
  ruleCard: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 19, padding: 15, gap: 14 },
  section: { color: c.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ruleNumber: { width: 42, color: c.accentBright, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  ruleTitle: { color: c.text, fontSize: 12, fontWeight: '900' },
  meta: { color: c.muted, fontSize: 10, lineHeight: 15, marginTop: 3 },
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 },
  empty: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 17, padding: 16, gap: 5 },
  emptyTitle: { color: c.text, fontSize: 13, fontWeight: '900' },
  retry: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 10, backgroundColor: c.accentSoft },
  retryText: { color: c.accentBright, fontSize: 9, fontWeight: '900' },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 15, padding: 12 },
  historyIcon: { width: 35, height: 35, borderRadius: 11, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' },
  historyTitle: { color: c.text, fontSize: 11, fontWeight: '900' },
  historyAmount: { color: c.success, fontSize: 15, fontWeight: '900' }
});
