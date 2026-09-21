import { useCallback, useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

const c = Colors.dark;

type DashboardData = {
  trainingCount: number;
  trainingMinutes: number;
  medalCount: number;
  upcoming: { id: string; name: string; starts_at: string | null; location: string | null; status: string | null } | null;
  weight: number | null;
  goalCount: number;
  completedGoals: number;
  unreadNotifications: number;
  streak: number;
};

export default function HomeScreen() {
  const { session, profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<DashboardData>({
    trainingCount: 0, trainingMinutes: 0, medalCount: 0, upcoming: null,
    weight: null, goalCount: 0, completedGoals: 0, unreadNotifications: 0, streak: 0,
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    const uid = session.user.id;
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    const from = thirtyDaysAgo.toISOString().slice(0, 10);
    const todayDate = today.toISOString().slice(0, 10);

    const [training, medals, tournament, weight, goals, notifications, recentTraining] = await Promise.all([
      supabase.from('training_sessions').select('id,minutes').eq('user_id', uid),
      supabase.from('medals').select('id', { count: 'exact', head: true }).eq('user_id', uid),
      supabase.from('tournaments').select('id,name,starts_at,location,status').eq('user_id', uid).gte('starts_at', todayDate).order('starts_at', { ascending: true }).limit(1).maybeSingle(),
      supabase.from('weight_logs').select('weight_kg').eq('user_id', uid).order('logged_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('goals').select('id,status,progress').eq('user_id', uid),
      supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', uid).is('read_at', null),
      supabase.from('training_sessions').select('session_date').eq('user_id', uid).gte('session_date', from).order('session_date', { ascending: false }),
    ]);

    const rows = training.data ?? [];
    const goalRows = goals.data ?? [];
    const dates = Array.from(new Set((recentTraining.data ?? []).map(x => x.session_date))).sort().reverse();
    let streak = 0;
    const cursor = new Date(today);
    while (true) {
      const key = cursor.toISOString().slice(0, 10);
      if (!dates.includes(key)) break;
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    setData({
      trainingCount: rows.length,
      trainingMinutes: rows.reduce((sum, x) => sum + Number(x.minutes || 0), 0),
      medalCount: medals.count ?? 0,
      upcoming: tournament.data ?? null,
      weight: weight.data ? Number(weight.data.weight_kg) : null,
      goalCount: goalRows.length,
      completedGoals: goalRows.filter(x => x.status === 'completed' || Number(x.progress) >= 100).length,
      unreadNotifications: notifications.count ?? 0,
      streak,
    });
    setLoading(false);
  }, [session]);

  useEffect(() => { void load(); }, [load]);

  const firstName = profile?.full_name?.split(' ')[0] || 'Athlete';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const discipline = profile?.discipline || 'Taekwondo';

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 34 }]}>
          <View style={styles.topBar}>
            <View style={styles.brand}>
              <Image source={require('@/assets/logo.png')} style={styles.logo} contentFit="cover" />
              <View>
                <Text style={styles.brandName}>ATHLETEN</Text>
                <Text style={styles.brandSub}>ATHLETE PERFORMANCE</Text>
              </View>
            </View>
            <Pressable onPress={() => router.push('/profile')} style={styles.settings}>
              <Text style={styles.settingsIcon}>⚙</Text>
            </Pressable>
          </View>

          <View style={styles.hero}>
            <View style={styles.heroGlow} />
            <Text style={styles.eyebrow}>YOUR PERFORMANCE HUB</Text>
            <Text style={styles.title}>{greeting}, {firstName}</Text>
            <View style={styles.disciplinePill}><View style={styles.dot} /><Text style={styles.pillText}>{discipline.toUpperCase()} • LIVE</Text></View>
          </View>

          <View style={styles.metricGrid}>
            <Metric label="SESSIONS" value={loading ? '—' : String(data.trainingCount)} />
            <Metric label="MINUTES" value={loading ? '—' : String(data.trainingMinutes)} />
            <Metric label="MEDALS" value={loading ? '—' : String(data.medalCount)} />
            <Metric label="STREAK" value={loading ? '—' : String(data.streak)} suffix={data.streak === 1 ? ' DAY' : ' DAYS'} />
            <Metric label="WEIGHT" value={data.weight == null ? '—' : data.weight.toFixed(1)} suffix={data.weight == null ? '' : ' KG'} />
            <Metric label="GOALS" value={loading ? '—' : data.goalCount ? `${data.completedGoals}/${data.goalCount}` : '0'} />
          </View>

          <SectionHeader title="NEXT COMPETITION" action="VIEW ALL" onPress={() => router.push('/compete')} />
          <Pressable style={styles.competition} onPress={() => router.push('/compete')}>
            <View style={styles.competitionAccent} />
            {data.upcoming ? (
              <>
                <Text style={styles.competitionTitle}>{data.upcoming.name}</Text>
                <Text style={styles.competitionMeta}>{data.upcoming.starts_at || 'Date not set'}</Text>
                {data.upcoming.location ? <Text style={styles.competitionMeta}>{data.upcoming.location}</Text> : null}
                <View style={styles.statusLine}><Text style={styles.status}>{(data.upcoming.status || 'planned').toUpperCase()}</Text><Text style={styles.arrow}>→</Text></View>
              </>
            ) : (
              <>
                <Text style={styles.competitionTitle}>No competition added yet</Text>
                <Text style={styles.competitionMeta}>Your next event will appear here once it is saved.</Text>
                <View style={styles.statusLine}><Text style={styles.status}>ADD EVENT</Text><Text style={styles.arrow}>→</Text></View>
              </>
            )}
          </Pressable>

          <SectionHeader title="QUICK ACTIONS" />
          <View style={styles.actionGrid}>
            <QuickAction title="Log Training" detail="Record a session" icon="↗" onPress={() => router.push('/training')} />
            <QuickAction title="Track Weight" detail="Save a measurement" icon="↕" onPress={() => router.push('/profile')} />
            <QuickAction title="Compete" detail="Events & medals" icon="🏆" onPress={() => router.push('/compete')} />
            <QuickAction title="Scanner" detail="Scan & intelligence" icon="⌁" onPress={() => router.push('/scanner')} />
          </View>

          <View style={styles.accountCard}>
            <View style={styles.accountIcon}><Text style={styles.accountIconText}>A</Text></View>
            <View style={styles.accountCopy}>
              <Text style={styles.accountTitle}>AthleteN account</Text>
              <Text style={styles.accountMeta}>{data.unreadNotifications ? `${data.unreadNotifications} unread notification${data.unreadNotifications === 1 ? '' : 's'}` : 'Everything is up to date'}</Text>
            </View>
            <Text style={styles.accountArrow}>›</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Metric({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}<Text style={styles.metricSuffix}>{suffix ? ` ${suffix}` : ''}</Text></Text>
    </View>
  );
}

function SectionHeader({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  return <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{title}</Text>{action && <Pressable onPress={onPress}><Text style={styles.sectionAction}>{action}</Text></Pressable>}</View>;
}

function QuickAction({ title, detail, icon, onPress }: { title: string; detail: string; icon: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}><View style={styles.quickIcon}><Text style={styles.quickIconText}>{icon}</Text></View><Text style={styles.quickTitle}>{title}</Text><Text style={styles.quickDetail}>{detail}</Text></Pressable>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  safe: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 10, gap: 18 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 46, height: 46, borderRadius: 13 },
  brandName: { color: c.text, fontSize: 15, fontWeight: '900', letterSpacing: 3.5 },
  brandSub: { color: c.muted, fontSize: 7, fontWeight: '800', letterSpacing: 1.2, marginTop: 2 },
  settings: { width: 44, height: 44, borderRadius: 14, backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
  settingsIcon: { color: c.text, fontSize: 19 },
  hero: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.borderStrong, borderRadius: 24, padding: 20, overflow: 'hidden', gap: 9 },
  heroGlow: { position: 'absolute', width: 130, height: 130, borderRadius: 65, right: -35, top: -50, backgroundColor: c.glow, opacity: 0.75 },
  eyebrow: { color: c.accentBright, fontSize: 9, fontWeight: '900', letterSpacing: 1.7 },
  title: { color: c.text, fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  disciplinePill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: c.accentSoft, borderWidth: 1, borderColor: c.accentDeep, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.success },
  pillText: { color: '#BBD6FF', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { width: '31.8%', minHeight: 86, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 18, padding: 13, justifyContent: 'space-between' },
  metricLabel: { color: c.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  metricValue: { color: c.text, fontSize: 22, fontWeight: '900' },
  metricSuffix: { color: c.muted, fontSize: 8, fontWeight: '800' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  sectionTitle: { color: c.text, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  sectionAction: { color: c.accentBright, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  competition: { backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.borderStrong, borderRadius: 22, padding: 18, paddingLeft: 22, gap: 7, overflow: 'hidden' },
  competitionAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: c.accent },
  competitionTitle: { color: c.text, fontSize: 17, fontWeight: '800', lineHeight: 23 },
  competitionMeta: { color: c.muted, fontSize: 12, lineHeight: 18 },
  statusLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5 },
  status: { color: c.accentBright, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  arrow: { color: c.accentBright, fontSize: 22 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickAction: { width: '48.2%', minHeight: 116, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 18, padding: 14, gap: 6 },
  quickIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 3 },
  quickIconText: { color: c.accentBright, fontSize: 16, fontWeight: '900' },
  quickTitle: { color: c.text, fontSize: 14, fontWeight: '800' },
  quickDetail: { color: c.muted, fontSize: 11 },
  accountCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 18, padding: 14 },
  accountIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: c.accentDeep, alignItems: 'center', justifyContent: 'center' },
  accountIconText: { color: c.accentBright, fontSize: 15, fontWeight: '900' },
  accountCopy: { flex: 1 },
  accountTitle: { color: c.text, fontSize: 13, fontWeight: '800' },
  accountMeta: { color: c.muted, fontSize: 11, marginTop: 2 },
  accountArrow: { color: c.muted, fontSize: 26 },
  pressed: { opacity: 0.72 },
});
