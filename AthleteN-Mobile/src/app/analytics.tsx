import { useCallback, useEffect, useState } from 'react';
import { Text } from 'react-native';
import { Screen, Header, Section, Card, c } from '@/components/mobile-ui';
import { PerformanceBars, PerformanceLine } from '@/components/performance-chart';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { validMinutes, validWeight } from '@/lib/performance';

export default function AnalyticsScreen() {
  const { session } = useAuth();
  const [training, setTraining] = useState<any[]>([]);
  const [weights, setWeights] = useState<any[]>([]);
  const [medals, setMedals] = useState(0);
  const [competitions, setCompetitions] = useState(0);
  const [goals, setGoals] = useState(0);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!session) return;
    const uid = session.user.id;
    const [t, w, m, comp, g] = await Promise.all([
      supabase.from('training_sessions').select('session_date,minutes').eq('user_id', uid).order('session_date', { ascending: true }).limit(365),
      supabase.from('weight_logs').select('logged_at,weight_kg,verification_status').eq('user_id', uid).order('logged_at', { ascending: true }).limit(100),
      supabase.from('medals').select('id', { count: 'exact', head: true }).eq('user_id', uid),
      supabase.from('tournaments').select('id', { count: 'exact', head: true }).eq('user_id', uid),
      supabase.from('goals').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('status', 'active'),
    ]);
    if ([t.error, w.error, m.error, comp.error, g.error].some(Boolean)) setMessage('Some analytics data could not be loaded.');
    setTraining(t.data || []);
    setWeights((w.data || []).filter((x: any) => validWeight(x.weight_kg) !== null));
    setMedals(m.count || 0);
    setCompetitions(comp.count || 0);
    setGoals(g.count || 0);
  }, [session]);

  useEffect(() => { void load(); }, [load]);

  const weekly = Array.from({ length: 7 }, (_, index) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - index));
    const key = d.toISOString().slice(0, 10);
    return {
      label: key.slice(5).replace('-', '/'),
      value: training.filter((x) => String(x.session_date).slice(0, 10) === key).reduce((sum, x) => sum + validMinutes(x.minutes), 0),
    };
  });

  const latestWeight = weights.length ? validWeight(weights[weights.length - 1].weight_kg) : null;
  const verified = weights.filter((x) => x.verification_status === 'verified').length;

  return (
    <Screen>
      <Header eyebrow="ATHLETEN INTELLIGENCE" title="Analytics" subtitle="A live view of your synced training, competition and performance records." />
      <Section title="OVERVIEW">
        <Card>
          <Text style={{ color: c.text, fontSize: 14, fontWeight: '900' }}>Training this week: {weekly.reduce((a, b) => a + b.value, 0)} min</Text>
          <Text style={{ color: c.muted, fontSize: 11, marginTop: 5 }}>Competitions {competitions} · Medals {medals} · Active goals {goals}</Text>
        </Card>
      </Section>
      <PerformanceBars title="7-day training load" subtitle="Minutes logged per day" data={weekly} unit="min" />
      <PerformanceLine title="Weight history" subtitle={verified ? verified + ' verified measurements' : 'Saved measurements'} data={weights.slice(-30).map((x) => ({ label: String(x.logged_at).slice(5, 10), value: validWeight(x.weight_kg) || 0 })).filter((x) => x.value > 0)} unit="kg" accent={c.success} />
      <Section title="LATEST">
        <Card>
          <Text style={{ color: c.text, fontSize: 13, fontWeight: '900' }}>{latestWeight ? latestWeight.toFixed(1) + ' kg latest recorded measurement' : 'No weight data yet'}</Text>
          <Text style={{ color: c.muted, fontSize: 11, marginTop: 5 }}>The same Supabase records are available across supported AthleteN devices.</Text>
          {message ? <Text style={{ color: c.accentBright, fontSize: 11, marginTop: 7 }}>{message}</Text> : null}
        </Card>
      </Section>
    </Screen>
  );
}
