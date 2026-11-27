import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Screen, Header, Section, Card, c, Icon } from '@/components/mobile-ui';
import { PerformanceBars } from '@/components/performance-chart';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { validMinutes } from '@/lib/performance';

type RangeKey = '7d' | '30d' | '6m';
type TrainingRow = { session_date: string; minutes: number };
type MedalRow = { medal_type: string | null; awarded_at: string | null };
type GoalRow = { title: string; progress: number | null; status: string | null };
type CompetitionRow = { starts_at: string | null; result: string | null };

function localDateKey(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function rangeStart(now: Date, range: RangeKey, previous = false) {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  if (range === '7d') {
    date.setDate(date.getDate() - (previous ? 13 : 6));
  } else if (range === '30d') {
    date.setDate(date.getDate() - (previous ? 59 : 29));
  } else {
    date.setDate(1);
    date.setMonth(date.getMonth() - (previous ? 11 : 5));
  }
  return date;
}

function inRange(value: string | null | undefined, start: Date, end: Date) {
  if (!value) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date >= start && date < end;
}

function buildTrainingChart(training: TrainingRow[], range: RangeKey, now: Date) {
  const start = rangeStart(now, range);
  if (range === '7d') {
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(date.getDate() + index);
      const key = localDateKey(date);
      return {
        label: date.toLocaleDateString('en-IN', { weekday: 'short' }),
        value: training.filter(row => String(row.session_date).slice(0, 10) === key)
          .reduce((sum, row) => sum + validMinutes(row.minutes), 0),
      };
    });
  }
  if (range === '30d') {
    return Array.from({ length: 10 }, (_, index) => {
      const bucketStart = new Date(start);
      bucketStart.setDate(bucketStart.getDate() + index * 3);
      const bucketEnd = new Date(bucketStart);
      bucketEnd.setDate(bucketEnd.getDate() + 3);
      return {
        label: bucketStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        value: training.filter(row => inRange(row.session_date, bucketStart, bucketEnd))
          .reduce((sum, row) => sum + validMinutes(row.minutes), 0),
      };
    });
  }
  return Array.from({ length: 6 }, (_, index) => {
    const monthStart = new Date(start);
    monthStart.setMonth(monthStart.getMonth() + index);
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);
    return {
      label: monthStart.toLocaleDateString('en-IN', { month: 'short' }),
      value: training.filter(row => inRange(row.session_date, monthStart, monthEnd))
        .reduce((sum, row) => sum + validMinutes(row.minutes), 0),
    };
  });
}

async function fetchAllPages<T>(page: (from: number, to: number) => any): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < 10000; from += 500) {
    const { data, error } = await page(from, from + 499);
    if (error) throw error;
    const batch = (data || []) as T[];
    rows.push(...batch);
    if (batch.length < 500) return rows;
  }
  throw new Error('Analytics history exceeded the safe paging limit. Narrow the reporting range.');
}

function changeLabel(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 'New activity' : 'No activity';
  const change = Math.round(((current - previous) / previous) * 100);
  return (change > 0 ? '+' : '') + change + '% vs previous period';
}

export default function AnalyticsScreen() {
  const { session, syncVersion } = useAuth();
  const [training, setTraining] = useState<TrainingRow[]>([]);
  const [medals, setMedals] = useState<MedalRow[]>([]);
  const [competitions, setCompetitions] = useState<CompetitionRow[]>([]);
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [range, setRange] = useState<RangeKey>('7d');
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
    const now = new Date();
    const historyStart = new Date(now);
    historyStart.setMonth(historyStart.getMonth() - 12);
    const startKey = localDateKey(historyStart);
    try {
      const [trainingRows, medalRows, competitionRows, goalRows] = await Promise.all([
        fetchAllPages<TrainingRow>((from, to) => supabase.from('training_sessions')
          .select('session_date,minutes').eq('user_id', uid).gte('session_date', startKey)
          .order('session_date', { ascending: false }).range(from, to)),
        fetchAllPages<MedalRow>((from, to) => supabase.from('medals')
          .select('medal_type,awarded_at').eq('user_id', uid).gte('awarded_at', startKey)
          .order('awarded_at', { ascending: false }).range(from, to)),
        fetchAllPages<CompetitionRow>((from, to) => supabase.from('tournaments')
          .select('starts_at,result').eq('user_id', uid).gte('starts_at', historyStart.toISOString())
          .lte('starts_at', now.toISOString()).order('starts_at', { ascending: false }).range(from, to)),
        supabase.from('goals').select('title,progress,status').eq('user_id', uid).limit(100).then((result: any) => {
          if (result.error) throw result.error;
          return (result.data || []) as GoalRow[];
        }),
      ]);
      setTraining(trainingRows);
      setMedals(medalRows);
      setCompetitions(competitionRows);
      setGoals(goalRows);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Analytics data could not be loaded. Retry to try again.');
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, syncVersion]);

  useEffect(() => { void load(); }, [load]);

  const now = new Date();
  const currentStart = rangeStart(now, range);
  const previousStart = rangeStart(now, range, true);
  const currentTraining = training.filter(row => inRange(row.session_date, currentStart, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)));
  const previousTraining = training.filter(row => inRange(row.session_date, previousStart, currentStart));
  const currentMinutes = currentTraining.reduce((sum, row) => sum + validMinutes(row.minutes), 0);
  const previousMinutes = previousTraining.reduce((sum, row) => sum + validMinutes(row.minutes), 0);
  const currentCompetitions = competitions.filter(row => inRange(row.starts_at, currentStart, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))).length;
  const completedGoals = goals.filter(goal => String(goal.status || '').toLowerCase() === 'completed' || Number(goal.progress || 0) >= 100).length;
  const chart = buildTrainingChart(training, range, now);
  const medalBreakdown = useMemo(() => [
    { label: 'Gold', value: medals.filter(x => String(x.medal_type || '').toLowerCase().includes('gold')).length },
    { label: 'Silver', value: medals.filter(x => String(x.medal_type || '').toLowerCase().includes('silver')).length },
    { label: 'Bronze', value: medals.filter(x => String(x.medal_type || '').toLowerCase().includes('bronze')).length },
  ], [medals]);

  const rangeLabel = range === '7d' ? 'Last 7 days' : range === '30d' ? 'Last 30 days' : 'Last 6 months';
  const chartSubtitle = range === '7d'
    ? 'Saved training minutes for each local calendar day'
    : range === '30d'
      ? 'Saved training minutes in 3-day blocks'
      : 'Saved training minutes per calendar month';

  return (
    <Screen>
      <Header eyebrow="ATHLETEN INTELLIGENCE" title="Analytics" subtitle="Understand your training consistency and progress using your saved AthleteN records." />
      <Section title="REPORTING PERIOD">
        <View style={{ flexDirection: 'row', gap: 7 }}>
          {([{ key: '7d', label: '7D' }, { key: '30d', label: '30D' }, { key: '6m', label: '6M' }] as const).map(option => (
            <Pressable key={option.key} onPress={() => setRange(option.key)} accessibilityRole="button" accessibilityState={{ selected: range === option.key }} style={{ flex: 1, minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: range === option.key ? c.accentBright : c.borderStrong, backgroundColor: range === option.key ? c.accentSoft : c.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: range === option.key ? c.accentBright : c.muted, fontSize: 11, fontWeight: '900' }}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={{ color: c.muted, fontSize: 10 }}>{rangeLabel} · Compared with the immediately preceding period.</Text>
      </Section>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <View style={{ flex: 1, minWidth: '45%' }}>
          <Card><Text style={{ color: c.muted, fontSize: 9, fontWeight: '900' }}>TRAINING SESSIONS</Text><Text style={{ color: c.text, fontSize: 23, fontWeight: '900', marginTop: 5 }}>{currentTraining.length}</Text><Text style={{ color: c.muted, fontSize: 9 }}>{changeLabel(currentTraining.length, previousTraining.length)}</Text></Card>
        </View>
        <View style={{ flex: 1, minWidth: '45%' }}>
          <Card><Text style={{ color: c.muted, fontSize: 9, fontWeight: '900' }}>TRAINING TIME</Text><Text style={{ color: c.text, fontSize: 23, fontWeight: '900', marginTop: 5 }}>{Math.round(currentMinutes / 60 * 10) / 10} h</Text><Text style={{ color: c.muted, fontSize: 9 }}>{changeLabel(currentMinutes, previousMinutes)}</Text></Card>
        </View>
        <View style={{ flex: 1, minWidth: '45%' }}>
          <Card><Text style={{ color: c.muted, fontSize: 9, fontWeight: '900' }}>COMPETITIONS</Text><Text style={{ color: c.text, fontSize: 23, fontWeight: '900', marginTop: 5 }}>{currentCompetitions}</Text><Text style={{ color: c.muted, fontSize: 9 }}>Past events in this period</Text></Card>
        </View>
        <View style={{ flex: 1, minWidth: '45%' }}>
          <Card><Text style={{ color: c.muted, fontSize: 9, fontWeight: '900' }}>GOALS COMPLETED</Text><Text style={{ color: c.text, fontSize: 23, fontWeight: '900', marginTop: 5 }}>{completedGoals}/{goals.length}</Text><Text style={{ color: c.muted, fontSize: 9 }}>Across your saved goals</Text></Card>
        </View>
      </View>
      <Section title="TRAINING LOAD">
        <PerformanceBars title="Training minutes" subtitle={chartSubtitle} data={chart} unit=" min" />
      </Section>
      <Section title="ACHIEVEMENTS">
        <PerformanceBars title="Medal breakdown" subtitle="Medals recorded in the last 12 months" data={medalBreakdown} />
      </Section>
      <Section title="GOAL PROGRESS">
        {goals.length ? <PerformanceBars title="Saved goal progress" subtitle="Progress values recorded in your goals" data={goals.slice(0, 6).map((goal, index) => ({
          label: String(goal.title || 'Goal').slice(0, 12) || 'Goal ' + (index + 1),
          value: Math.max(0, Math.min(100, Number(goal.progress) || 0)),
        }))} unit="%" /> : <Card><Text style={{ color: c.muted, fontSize: 11 }}>No goals recorded yet. Add a goal to see progress here.</Text></Card>}
      </Section>
      {loading ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}><ActivityIndicator color={c.accentBright} /><Text style={{ color: c.muted, fontSize: 10 }}>Updating analytics…</Text></View> : null}
      {message ? <Card><Text accessibilityRole="alert" style={{ color: c.warning || c.accentBright, fontSize: 11 }}>{message}</Text><Pressable onPress={() => void load()} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 10 }}><Icon name="refresh" size={14} color={c.accentBright} /><Text style={{ color: c.accentBright, fontSize: 10, fontWeight: '900' }}>RETRY</Text></Pressable></Card> : null}
      <Text style={{ color: c.muted, fontSize: 9, lineHeight: 14 }}>Analytics describe saved activity records. They are not medical assessments or predictions of competition outcomes.</Text>
    </Screen>
  );
}
