import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { PerformanceBars, ChartPoint } from '@/components/performance-chart';

const c = Colors.dark;

export default function HomeScreen() {
  const { session, profile } = useAuth();
  const router = useRouter();
  const [minutes, setMinutes] = useState(0);
  const [sessions, setSessions] = useState(0);
  const [chart, setChart] = useState<ChartPoint[]>([]);
  const [weight, setWeight] = useState<number | null>(null);
  const [medals, setMedals] = useState(0);

  const load = useCallback(async () => {
    if (!session) return;
    const days: string[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }
    const result = await supabase.from('training_sessions').select('minutes,session_date').eq('user_id', session.user.id).gte('session_date', days[0]).lte('session_date', days[6]);
    const rows = result.data ?? [];
    setSessions(rows.length);
    setMinutes(rows.reduce((sum, row) => sum + Number(row.minutes || 0), 0));
    setChart(days.map(day => ({ label: day.slice(5).replace('-', '/'), value: rows.filter(row => row.session_date === day).reduce((sum, row) => sum + Number(row.minutes || 0), 0) })));
    const w = await supabase.from('weight_logs').select('weight_kg').eq('user_id', session.user.id).order('logged_at', { ascending: false }).limit(1).maybeSingle();
    setWeight(w.data ? Number(w.data.weight_kg) : null);
    const m = await supabase.from('medals').select('id', { count: 'exact', head: true }).eq('user_id', session.user.id);
    setMedals(m.count ?? 0);
  }, [session]);

  useEffect(() => { void load(); }, [load]);

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <View><Text style={s.kicker}>ATHLETEN PERFORMANCE</Text><Text style={s.brand}>ATHLETEN</Text><Text style={s.sub}>Your live athlete dashboard</Text></View>
          <Pressable onPress={() => router.push('/profile')} style={s.settings}><Text style={s.settingsText}>⚙</Text></Pressable>
        </View>
        <View style={s.hero}><Text style={s.kicker}>YOUR PERFORMANCE HUB</Text><Text style={s.title}>{profile?.full_name?.split(' ')[0] || 'Athlete'}</Text><Text style={s.sub}>Real {profile?.discipline || 'Taekwondo'} data, organized for action.</Text><View style={s.pill}><Text style={s.pillText}>{(profile?.discipline || 'TAEKWONDO').toUpperCase()} • LIVE</Text></View></View>
        <View style={s.grid}><Metric label="7D SESSIONS" value={String(sessions)} /><Metric label="7D MINUTES" value={String(minutes)} /><Metric label="MEDALS" value={String(medals)} /><Metric label="WEIGHT" value={weight == null ? '—' : weight.toFixed(1) + ' KG'} /></View>
        <PerformanceBars title="Training activity" subtitle="Minutes logged over the last 7 days" data={chart} unit="m" />
        <View style={s.actions}>
          <Action title="Training" text="Log a session" onPress={() => router.push('/training')} />
          <Action title="AI" text="Open insights" onPress={() => router.push('/ai')} />
          <Action title="Compete" text="Events & medals" onPress={() => router.push('/compete')} />
          <Action title="Scanner" text="Scan sources" onPress={() => router.push('/scanner')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={s.metric}><Text style={s.metricLabel}>{label}</Text><Text style={s.metricValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text></View>;
}
function Action({ title, text, onPress }: { title: string; text: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={s.action}><Text style={s.actionTitle}>{title}</Text><Text style={s.actionText}>{text}</Text></Pressable>;
}

const s = StyleSheet.create({
  screen:{flex:1,backgroundColor:c.background},
  content:{padding:18,gap:14,paddingBottom:40},
  header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  kicker:{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:1.5},
  brand:{color:c.text,fontSize:24,fontWeight:'900',letterSpacing:3,marginTop:3},
  sub:{color:c.muted,fontSize:11,lineHeight:17,marginTop:3},
  settings:{width:44,height:44,borderRadius:14,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},
  settingsText:{color:c.text,fontSize:18},
  hero:{backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong,borderRadius:24,padding:20,gap:7},
  title:{color:c.text,fontSize:30,fontWeight:'900'},
  pill:{alignSelf:'flex-start',backgroundColor:c.accentSoft,borderRadius:999,paddingHorizontal:11,paddingVertical:7,marginTop:4},
  pillText:{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:1},
  grid:{flexDirection:'row',flexWrap:'wrap',gap:10},
  metric:{width:'48%',minHeight:88,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:18,padding:14,justifyContent:'space-between'},
  metricLabel:{color:c.muted,fontSize:8,fontWeight:'900',letterSpacing:1},
  metricValue:{color:c.text,fontSize:23,fontWeight:'900'},
  actions:{flexDirection:'row',flexWrap:'wrap',gap:10},
  action:{width:'48%',backgroundColor:c.surfaceRaised,borderWidth:1,borderColor:c.border,borderRadius:18,padding:15,minHeight:82,justifyContent:'center'},
  actionTitle:{color:c.text,fontSize:14,fontWeight:'900'},
  actionText:{color:c.muted,fontSize:10,marginTop:4},
});