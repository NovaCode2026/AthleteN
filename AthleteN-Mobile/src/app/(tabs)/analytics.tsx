import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Screen, Header, Section, Card, c, Icon } from '@/components/mobile-ui';
import { PerformanceBars, PerformanceLine } from '@/components/performance-chart';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { validMinutes } from '@/lib/performance';

type TrainingRow = { session_date: string; minutes: number };
type MedalRow = { medal_type: string | null; awarded_at: string | null };
type GoalRow = { title: string; progress: number | null; status: string | null };
type CompetitionRow = { starts_at: string | null; result: string | null };

function localDateKey(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}
function monthKey(date: Date) {
  return localDateKey(date).slice(0, 7);
}

export default function AnalyticsScreen() {
  const { session, syncVersion } = useAuth();
  const [training, setTraining] = useState<TrainingRow[]>([]);
  const [medals, setMedals] = useState<MedalRow[]>([]);
  const [competitions, setCompetitions] = useState<CompetitionRow[]>([]);
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session?.user?.id) {
      setLoading(false);
      setMessage('Sign in to view your athlete analytics.');
      return;
    }
    setLoading(true);
    setMessage('');
    const uid = session.user.id;
    try {
      const [t, m, comp, g] = await Promise.all([
        supabase.from('training_sessions').select('session_date,minutes').eq('user_id', uid).order('session_date', { ascending: false }).limit(365),
        supabase.from('medals').select('medal_type,awarded_at').eq('user_id', uid).order('awarded_at', { ascending: false }).limit(250),
        supabase.from('tournaments').select('starts_at,result').eq('user_id', uid).order('starts_at', { ascending: false }).limit(250),
        supabase.from('goals').select('title,progress,status').eq('user_id', uid).limit(100),
      ]);
      const failed = [t.error, m.error, comp.error, g.error].find(Boolean);
      if (failed) throw failed;
      // The API returns newest-first; reverse bounded records for chronological charts.
      setTraining([...(t.data || [])].reverse() as TrainingRow[]);
      setMedals([...(m.data || [])].reverse() as MedalRow[]);
      setCompetitions([...(comp.data || [])].reverse() as CompetitionRow[]);
      setGoals((g.data || []) as GoalRow[]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Some analytics data could not be loaded. Pull to retry.');
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, syncVersion]);

  useEffect(() => { void load(); }, [load]);

  const weekly = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const key = localDateKey(date);
    return {
      label: key.slice(5).replace('-', '/'),
      value: training.filter((row) => String(row.session_date).slice(0, 10) === key).reduce((sum, row) => sum + validMinutes(row.minutes), 0),
    };
  }), [training]);

  const monthly = useMemo(() => Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setHours(0, 0, 0, 0);
    date.setMonth(date.getMonth() - (5 - index));
    const key = monthKey(date);
    return {
      label: date.toLocaleDateString('en-IN', { month: 'short' }),
      value: training.filter((row) => String(row.session_date).slice(0, 7) === key).reduce((sum, row) => sum + validMinutes(row.minutes), 0),
    };
  }), [training]);

  const medalBreakdown = useMemo(() => [
    { label: 'Gold', value: medals.filter((x) => String(x.medal_type || '').toLowerCase().includes('gold')).length },
    { label: 'Silver', value: medals.filter((x) => String(x.medal_type || '').toLowerCase().includes('silver')).length },
    { label: 'Bronze', value: medals.filter((x) => String(x.medal_type || '').toLowerCase().includes('bronze')).length },
  ], [medals]);

  const totalMinutes = training.reduce((sum, row) => sum + validMinutes(row.minutes), 0);
  const completedGoals = goals.filter((goal) => String(goal.status || '').toLowerCase() === 'completed' || Number(goal.progress || 0) >= 100).length;
  const competitionResults = competitions.filter((event) => Boolean(String(event.result || '').trim())).length;
  const goalProgress = goals.slice(0, 6).map((goal, index) => ({
    label: String(goal.title || 'Goal').slice(0, 12) || 'Goal ' + (index + 1),
    value: Math.max(0, Math.min(100, Number(goal.progress) || 0)),
  }));

  return (
    <Screen>
      <Header eyebrow="ATHLETEN INTELLIGENCE" title="Analytics" subtitle="Trends calculated from your saved training, competition, medal and goal records." />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <View style={{ flex: 1, minWidth: '45%' }}>
          <Card><Text style={{ color: c.muted, fontSize: 9, fontWeight: '900' }}>TRAINING SESSIONS</Text><Text style={{ color: c.text, fontSize: 23, fontWeight: '900', marginTop: 5 }}>{training.length}</Text></Card>
        </View>
        <View style={{ flex: 1, minWidth: '45%' }}>
          <Card><Text style={{ color: c.muted, fontSize: 9, fontWeight: '900' }}>TOTAL TRAINING TIME</Text><Text style={{ color: c.text, fontSize: 23, fontWeight: '900', marginTop: 5 }}>{Math.round(totalMinutes / 60 * 10) / 10} h</Text></Card>
        </View>
        <View style={{ flex: 1, minWidth: '45%' }}>
          <Card><Text style={{ color: c.muted, fontSize: 9, fontWeight: '900' }}>COMPETITIONS</Text><Text style={{ color: c.text, fontSize: 23, fontWeight: '900', marginTop: 5 }}>{competitions.length}</Text><Text style={{ color: c.muted, fontSize: 9 }}>Results recorded: {competitionResults}</Text></Card>
        </View>
        <View style={{ flex: 1, minWidth: '45%' }}>
          <Card><Text style={{ color: c.muted, fontSize: 9, fontWeight: '900' }}>MEDALS & GOALS</Text><Text style={{ color: c.text, fontSize: 23, fontWeight: '900', marginTop: 5 }}>{medals.length} · {completedGoals}/{goals.length}</Text><Text style={{ color: c.muted, fontSize: 9 }}>Medals · goals completed</Text></Card>
        </View>
      </View>
      <Section title="TRAINING LOAD">
        <PerformanceBars title="7-day training minutes" subtitle="Saved minutes for each local calendar day" data={weekly} unit=" min" />
        <PerformanceLine title="Six-month training trend" subtitle="Total saved training minutes per month" data={monthly} unit=" min" />
      </Section>
      <Section title="ACHIEVEMENTS">
        <PerformanceBars title="Medal breakdown" subtitle="Based on medal types saved to your account" data={medalBreakdown} />
      </Section>
      <Section title="GOAL PROGRESS">
        {goalProgress.length ? <PerformanceBars title="Saved goal progress" subtitle="Progress values recorded in your goals" data={goalProgress} unit="%" /> : <Card><Text style={{ color: c.muted, fontSize: 11 }}>No goals recorded yet. Add a goal to see progress here.</Text></Card>}
      </Section>
      {loading ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}><ActivityIndicator color={c.accentBright} /><Text style={{ color: c.muted, fontSize: 10 }}>Updating analytics…</Text></View> : null}
      {message ? <Card><Text accessibilityRole="alert" style={{ color: c.warning || c.accentBright, fontSize: 11 }}>{message}</Text><Pressable onPress={() => void load()} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 10 }}><Icon name="refresh" size={14} color={c.accentBright} /><Text style={{ color: c.accentBright, fontSize: 10, fontWeight: '900' }}>RETRY</Text></Pressable></Card> : null}
      <Text style={{ color: c.muted, fontSize: 9, lineHeight: 14 }}>Analytics describe saved activity records. They are not medical assessments or predictions of competition outcomes.</Text>
    </Screen>
  );
}
