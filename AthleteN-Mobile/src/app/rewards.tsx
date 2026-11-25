import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { Icon } from '@/components/mobile-ui';
import { useAuth } from '@/context/AuthContext';
import { openAdsPrivacyOptions, presentRewardedAd } from '@/lib/rewarded-ads';

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
  nextCursor: string | null;
};

function isAdultDateOfBirth(value: unknown): boolean {
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const birthDate = new Date(Date.UTC(year, month - 1, day));
  if (!Number.isFinite(birthDate.getTime()) || birthDate.toISOString().slice(0, 10) !== value) return false;
  const now = new Date();
  let age = now.getUTCFullYear() - year;
  if (now.getUTCMonth() < month - 1 || (now.getUTCMonth() === month - 1 && now.getUTCDate() < day)) age -= 1;
  return age >= 18;
}

export default function RewardsScreen() {
  const router = useRouter();
  const { session, profile } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [adBusy, setAdBusy] = useState(false);
  const [adNotice, setAdNotice] = useState('');
  const [privacyNotice, setPrivacyNotice] = useState('');
  const adsFeatureEnabled = __DEV__ || process.env.EXPO_PUBLIC_ATHLETEN_REWARDED_ADS_ENABLED === 'true';
  const adultAccount = isAdultDateOfBirth(profile?.date_of_birth);

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
        history: Array.isArray(payload.history) ? payload.history : [],
        nextCursor: typeof payload.nextCursor === 'string' ? payload.nextCursor : null
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rewards are temporarily unavailable.');
    } finally {
      setBusy(false);
    }
  }, [session?.access_token]);

  const loadMore = useCallback(async () => {
    const cursor = wallet?.nextCursor;
    if (!session?.access_token || !cursor || loadingMore) return;
    setLoadingMore(true);
    setHistoryError('');
    try {
      const base = (process.env.EXPO_PUBLIC_ATHLETEN_API_URL || 'https://athleten.netlify.app').replace(/\/$/, '');
      const response = await fetch(base + '/.netlify/functions/reward-wallet?cursor=' + encodeURIComponent(cursor), {
        headers: { Authorization: 'Bearer ' + session.access_token }
      });
      const payload = await response.json().catch(() => ({})) as Partial<Wallet> & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Older reward history is temporarily unavailable.');
      setWallet(current => current ? {
        ...current,
        history: [...current.history, ...(Array.isArray(payload.history) ? payload.history : [])],
        nextCursor: typeof payload.nextCursor === 'string' ? payload.nextCursor : null
      } : current);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : 'Older reward history is temporarily unavailable.');
    } finally {
      setLoadingMore(false);
    }
  }, [session?.access_token, wallet?.nextCursor, loadingMore]);

  const watchRewardedAd = useCallback(async () => {
    if (!session?.access_token || adBusy) return;
    setAdBusy(true);
    setAdNotice('');
    let adPresentationStarted = false;
    try {
      const baseValue = process.env.EXPO_PUBLIC_ATHLETEN_API_URL || 'https://athleten.netlify.app';
      const base = baseValue.endsWith('/') ? baseValue.slice(0, -1) : baseValue;
      const response = await fetch(base + '/.netlify/functions/create-reward-ad-session', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + session.access_token,
          'Content-Type': 'application/json'
        },
        body: '{}'
      });
      const payload = await response.json().catch(() => ({})) as { customData?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Rewarded ads are unavailable for this account or environment.');
      }
      if (typeof payload.customData !== 'string' || payload.customData.length < 20) {
        throw new Error('AthleteN could not create a secure ad session. Please try again later.');
      }

      adPresentationStarted = true;
      const outcome = await presentRewardedAd(payload.customData);
      if (outcome === 'earned') {
        setAdNotice('Ad completed. Bonus credits are pending Google’s server-side verification. Credits appear only after verification.');
        void load();
      } else {
        setAdNotice('The ad was closed before a reward was earned. No credits were added.');
      }
    } catch (e) {
      // Once a valid server session exists, any SDK load/no-fill/presentation
      // failure is an ad-delivery problem. Preserve the user's opportunity:
      // no credit is fabricated, no allowance is consumed, and they may retry.
      const message = e instanceof Error ? e.message : '';
      const deliveryFailure = adPresentationStarted;
      setAdNotice(deliveryFailure
        ? 'No ad is available right now. You have not lost your reward opportunity, and no credits or ad allowance were used. Please try again later.'
        : (message || 'AthleteN could not prepare the ad session. Your access is unchanged.'));
    } finally {
      setAdBusy(false);
    }
  }, [session?.access_token, adBusy, load]);


  const manageAdsPrivacy = useCallback(async () => {
    setPrivacyNotice('');
    try {
      const shown = await openAdsPrivacyOptions();
      setPrivacyNotice(shown
        ? 'Your ad privacy choices were updated.'
        : 'No additional ad privacy options are required for this account or region.');
    } catch (e) {
      setPrivacyNotice(e instanceof Error ? e.message : 'Ad privacy options are unavailable right now.');
    }
  }, []);

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
            <Text style={s.noticeText}>Ads are optional and require server-verified adult eligibility, consent and release approval. No ad will play until those checks pass. Your existing AthleteN access is not affected.</Text>
          </View>
        </View>

        {adsFeatureEnabled && adultAccount ? (
          <View style={s.adCard}>
            <Text style={s.section}>OPTIONAL REWARDED AD</Text>
            <Text style={s.adTitle}>Watch voluntarily · Earn 2 AI messages</Text>
            <Text style={s.meta}>You must finish the rewarded ad to qualify. Closing or skipping before Google marks it earned gives 0 credits. Credits are added only after Google verifies completion on AthleteN’s server. Daily and monthly limits apply.</Text>
            <Pressable
              onPress={() => void watchRewardedAd()}
              disabled={adBusy || !session?.access_token}
              accessibilityRole="button"
              accessibilityLabel="Watch an optional rewarded ad for two AI messages"
              style={[s.adButton, (adBusy || !session?.access_token) && s.adButtonDisabled]}
            >
              {adBusy ? <ActivityIndicator color="#fff" /> : <Text style={s.adButtonText}>WATCH REWARDED AD</Text>}
            </Pressable>
            <View style={s.adDisclosure}>
              <Text style={s.adDisclosureText}>Ad · Not endorsed</Text>
            </View>
            <Pressable
              onPress={() => void manageAdsPrivacy()}
              accessibilityRole="button"
              accessibilityLabel="Manage advertising privacy choices"
              style={s.privacyButton}
            >
              <Text style={s.privacyButtonText}>MANAGE AD PRIVACY</Text>
            </Pressable>
            {privacyNotice ? <Text style={s.adNotice}>{privacyNotice}</Text> : null}
            {adNotice ? <Text style={s.adNotice}>{adNotice}</Text> : null}
          </View>
        ) : null}

        <View style={s.ruleCard}>
          <Text style={s.section}>HOW REWARDS WILL WORK</Text>
          <View style={s.ruleRow}><Text style={s.ruleNumber}>+2</Text><View style={{ flex: 1 }}><Text style={s.ruleTitle}>AI messages per verified ad</Text><Text style={s.meta}>Only a completed and server-verified ad can issue credits.</Text></View></View>
          <View style={s.ruleRow}><Text style={s.ruleNumber}>3</Text><View style={{ flex: 1 }}><Text style={s.ruleTitle}>Maximum rewarded ads per day</Text><Text style={s.meta}>The daily limit is enforced by the server.</Text></View></View>
          <View style={s.ruleRow}><Text style={s.ruleNumber}>30</Text><View style={{ flex: 1 }}><Text style={s.ruleTitle}>Maximum bonus messages per month</Text><Text style={s.meta}>Unused ad-earned credits expire at month end and do not roll over.</Text></View></View>
        </View>

        <View style={s.historyHeader}>
          <Text style={s.section}>REWARD HISTORY</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {wallet?.nextCursor ? <Pressable onPress={() => void loadMore()} disabled={loadingMore} accessibilityRole="button" accessibilityLabel="Load older reward history">
              <Text style={s.loadMoreText}>{loadingMore ? 'LOADING…' : 'LOAD OLDER'}</Text>
            </Pressable> : null}
            {busy ? <ActivityIndicator color={c.accentBright} size="small" /> : null}
          </View>
        </View>
        {historyError ? <Text style={s.historyError}>{historyError}</Text> : null}
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
  content: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 44, gap: 15, width: '100%', maxWidth: 900, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  back: { width: 42, height: 42, borderRadius: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '180deg' }] },
  kicker: { color: c.accentBright, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: c.text, fontSize: 31, fontWeight: '900', letterSpacing: -.7, marginTop: 3 },
  refresh: { width: 42, height: 42, borderRadius: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
  hero: { backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.accent, borderRadius: 24, padding: 22, gap: 8, shadowColor: c.glow, shadowOpacity: .18, shadowRadius: 18, elevation: 3 },
  heroKicker: { color: c.accentBright, fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  balanceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  balance: { color: c.text, fontSize: 43, fontWeight: '900' },
  balanceUnit: { color: c.muted, fontSize: 12, fontWeight: '800' },
  heroText: { color: c.muted, fontSize: 11, lineHeight: 17 },
  stats: { flexDirection: 'row', gap: 9 },
  stat: { flex: 1, backgroundColor: c.surface, borderWidth: 1, borderColor: c.borderStrong, borderRadius: 18, padding: 15, gap: 6 },
  statValue: { color: c.text, fontSize: 20, fontWeight: '900' },
  statLabel: { color: c.muted, fontSize: 8, fontWeight: '900', letterSpacing: .8 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, padding: 14, borderRadius: 17, backgroundColor: c.accentSoft, borderWidth: 1, borderColor: c.borderStrong },
  noticeIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface },
  noticeTitle: { color: c.text, fontSize: 13, fontWeight: '900' },
  noticeText: { color: c.muted, fontSize: 10, lineHeight: 16, marginTop: 4 },
  adCard: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.borderStrong, borderRadius: 21, padding: 17, gap: 12, shadowColor: '#000', shadowOpacity: .13, shadowRadius: 13, elevation: 2 },
  adTitle: { color: c.text, fontSize: 14, fontWeight: '900' },
  adButton: { backgroundColor: c.accent, borderRadius: 12, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15, paddingVertical: 12 },
  adButtonDisabled: { opacity: 0.55 },
  adButtonText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  adDisclosure: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.035)', borderWidth: 1, borderColor: c.border, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4 },
  adDisclosureText: { color: c.muted, fontSize: 8, fontWeight: '800', letterSpacing: 0.25 },
  privacyButton: { alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 2 },
  privacyButtonText: { color: c.accentBright, fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  adNotice: { color: c.muted, fontSize: 10, lineHeight: 15 },
  ruleCard: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.borderStrong, borderRadius: 20, padding: 16, gap: 15 },
  section: { color: c.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ruleNumber: { width: 42, color: c.accentBright, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  ruleTitle: { color: c.text, fontSize: 12, fontWeight: '900' },
  meta: { color: c.muted, fontSize: 10, lineHeight: 15, marginTop: 3 },
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 },
  loadMoreText: { color: c.accentBright, fontSize: 9, fontWeight: '900', letterSpacing: .7 },
  historyError: { color: c.danger, fontSize: 10, lineHeight: 15 },
  empty: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 17, padding: 16, gap: 5 },
  emptyTitle: { color: c.text, fontSize: 13, fontWeight: '900' },
  retry: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 10, backgroundColor: c.accentSoft },
  retryText: { color: c.accentBright, fontSize: 9, fontWeight: '900' },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 15, padding: 12 },
  historyIcon: { width: 35, height: 35, borderRadius: 11, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' },
  historyTitle: { color: c.text, fontSize: 11, fontWeight: '900' },
  historyAmount: { color: c.success, fontSize: 15, fontWeight: '900' }
});
