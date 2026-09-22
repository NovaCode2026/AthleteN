import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { PerformanceBars, ProgressRing, ChartPoint } from '@/components/performance-chart';

const c = Colors.dark;

type Insight = { tag: string; title: string; text: string };

export default function AIScreen() {
  const { session, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [training, setTraining] = useState<ChartPoint[]>([]);
  const [weightTrend, setWeightTrend] = useState<ChartPoint[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [goals, setGoals] = useState({ total: 0, completed: 0 });
  const [upcoming, setUpcoming] = useState(0);

  const load = useCallback(async () => {
    if (!session) return;
    setRefreshing(true);
    const uid = session.user.id;
    const days: string[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }
    const [t, w, g, e] = await Promise.all([
      supabase.from('training_sessions').select('minutes,session_date').eq('user_id', uid).gte('session_date', days[0]).lte('session_date', days[6]),
      supabase.from('weight_logs').select('weight_kg,logged_at').eq('user_id', uid).order('logged_at', { ascending: true }).limit(7),
      supabase.from('goals').select('progress,status').eq('user_id', uid),
      supabase.from('tournaments').select('id', { count: 'exact', head: true }).eq('user_id', uid).gte('starts_at', now.toISOString()),
    ]);
    const rows = t.data ?? [];
    const chart = days.map(day => ({ label: day.slice(5).replace('-', '/'), value: rows.filter(x => x.session_date === day).reduce((sum,x)=>sum+Number(x.minutes||0),0) }));
    setTraining(chart);
    setWeightTrend((w.data ?? []).map(x => ({ label: String(x.logged_at).slice(5,10).replace('-', '/'), value: Number(x.weight_kg) })));
    const goalRows = g.data ?? [];
    const completed = goalRows.filter(x => x.status === 'completed' || Number(x.progress || 0) >= 100).length;
    setGoals({ total: goalRows.length, completed });
    setUpcoming(e.count ?? 0);

    const totalMinutes = rows.reduce((sum,x)=>sum+Number(x.minutes||0),0);
    const next: Insight[] = [];
    if (!rows.length) next.push({tag:'TRAINING',title:'Training signal is empty',text:'No sessions are logged in the last 7 days. Log training to unlock a useful trend.'});
    else next.push({tag:'TRAINING',title:'Training volume is live',text:totalMinutes+' minutes across '+rows.length+' session'+(rows.length===1?'':'s')+' in the last 7 days.'});
    if (w.data && w.data.length >= 2) {
      const first = Number(w.data[0].weight_kg);
      const last = Number(w.data[w.data.length-1].weight_kg);
      const change = last - first;
      next.push({tag:'WEIGHT',title:'Weight trend detected',text:'Your logged weight changed '+(change >= 0 ? '+' : '')+change.toFixed(1)+' kg across the latest records.'});
    } else next.push({tag:'WEIGHT',title:'Build your weight trend',text:'Add more weight logs and AthleteN will visualize the direction over time.'});
    if (e.count) next.push({tag:'COMPETE',title:'Competition is on the calendar',text:e.count+' upcoming event'+(e.count===1?'':'s')+' saved. Use Compete to manage preparation and checklist items.'});
    else next.push({tag:'COMPETE',title:'No upcoming event',text:'Add your next tournament to connect training with a competition timeline.'});
    next.push({tag:'GOALS',title:'Goal progress is measurable',text:goalRows.length ? completed+' of '+goalRows.length+' goals are complete.' : 'No goals are saved yet. Add one from Profile to start progress tracking.'});
    setInsights(next);
    setLoading(false);
    setRefreshing(false);
  },[session]);

  useEffect(()=>{void load()},[load]);

  return <SafeAreaView style={s.screen} edges={['top']}><ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
    <View><Text style={s.kicker}>ATHLETEN INTELLIGENCE</Text><Text style={s.title}>Performance, visualized.</Text><Text style={s.sub}>Real AthleteN records turned into trends and actionable signals.</Text></View>
    <View style={s.hero}><View style={s.live}><View style={s.dot}/><Text style={s.liveText}>LIVE DATA</Text></View><Text style={s.heroTitle}>{profile?.discipline || 'Taekwondo'} intelligence</Text><Text style={s.heroText}>No invented performance numbers. Every chart below is built from your saved records.</Text><Pressable onPress={()=>void load()} style={s.refresh}>{refreshing?<ActivityIndicator color="#fff"/>:<Text style={s.refreshText}>REFRESH ANALYSIS</Text>}</Pressable></View>
    {loading ? <ActivityIndicator color={c.accentBright} style={{marginTop:20}}/> : <>
      <PerformanceBars title="Training volume" subtitle="Daily minutes · last 7 days" data={training} unit="m"/>
      <PerformanceBars title="Weight trend" subtitle="Latest saved measurements" data={weightTrend} unit="kg" accent={c.success}/>
      <ProgressRing value={goals.total ? goals.completed/goals.total*100 : 0} label="Goal progress" detail={goals.total ? goals.completed+' of '+goals.total+' goals complete' : 'No goals saved yet'}/>
      <View style={s.section}><Text style={s.sectionTitle}>CURRENT SIGNALS</Text></View>
      {insights.map((x,i)=><View style={s.signal} key={x.tag+i}><View style={s.signalTop}><Text style={s.tag}>{x.tag}</Text><Text style={s.number}>0{i+1}</Text></View><Text style={s.signalTitle}>{x.title}</Text><Text style={s.signalText}>{x.text}</Text></View>)}
      <View style={s.footer}><Text style={s.footerTitle}>ATHLETEN AI FOUNDATION</Text><Text style={s.footerText}>The mobile layer now presents measurable signals first. A deeper coaching model can be connected later without replacing this data pipeline.</Text></View>
    </>}
  </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({
 screen:{flex:1,backgroundColor:c.background},content:{padding:18,gap:14,paddingBottom:45},kicker:{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:1.6},title:{color:c.text,fontSize:30,fontWeight:'900',lineHeight:35,marginTop:6},sub:{color:c.muted,fontSize:12,lineHeight:18,marginTop:4},hero:{backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong,borderRadius:22,padding:17,gap:8},live:{flexDirection:'row',alignItems:'center',gap:6},dot:{width:7,height:7,borderRadius:4,backgroundColor:c.success},liveText:{color:c.success,fontSize:8,fontWeight:'900',letterSpacing:1},heroTitle:{color:c.text,fontSize:21,fontWeight:'900'},heroText:{color:c.muted,fontSize:11,lineHeight:17},refresh:{height:46,borderRadius:13,backgroundColor:c.accent,alignItems:'center',justifyContent:'center',marginTop:3},refreshText:{color:'#fff',fontSize:10,fontWeight:'900',letterSpacing:1},section:{marginTop:3},sectionTitle:{color:c.text,fontSize:10,fontWeight:'900',letterSpacing:1.5},signal:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:18,padding:15,gap:6},signalTop:{flexDirection:'row',justifyContent:'space-between'},tag:{color:c.accentBright,fontSize:8,fontWeight:'900',letterSpacing:1},number:{color:c.muted,fontSize:8,fontWeight:'900'},signalTitle:{color:c.text,fontSize:15,fontWeight:'900'},signalText:{color:c.muted,fontSize:11,lineHeight:18},footer:{backgroundColor:c.accentSoft,borderWidth:1,borderColor:c.accentDeep,borderRadius:18,padding:15,gap:5},footerTitle:{color:c.accentBright,fontSize:8,fontWeight:'900',letterSpacing:1.2},footerText:{color:'#BBD6FF',fontSize:10,lineHeight:17}
});