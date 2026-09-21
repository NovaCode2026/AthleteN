import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

const c = Colors.dark;

type Insight = { title: string; text: string; tag: string };

export default function AIScreen() {
  const { session, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [stats, setStats] = useState({ sessions: 0, minutes: 0, upcoming: 0, goals: 0, weight: null as number | null });

  const load = useCallback(async () => {
    if (!session) return;
    const uid = session.user.id;
    setRefreshing(true);
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceDate = since.toISOString().slice(0, 10);

    const [training, upcoming, goals, weight] = await Promise.all([
      supabase.from('training_sessions').select('minutes').eq('user_id', uid).gte('session_date', sinceDate),
      supabase.from('tournaments').select('id', { count: 'exact', head: true }).eq('user_id', uid).gte('starts_at', new Date().toISOString()),
      supabase.from('goals').select('id,progress,status').eq('user_id', uid),
      supabase.from('weight_logs').select('weight_kg').eq('user_id', uid).order('logged_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const sessions = training.data ?? [];
    const goalRows = goals.data ?? [];
    const minutes = sessions.reduce((sum, row) => sum + Number(row.minutes || 0), 0);
    const weightValue = weight.data ? Number(weight.data.weight_kg) : null;

    const next: Insight[] = [];
    if (!sessions.length) {
      next.push({ title: 'Training activity', text: 'No training sessions are logged in the last 7 days. Log your next session to build a useful performance picture.', tag: 'TRAINING' });
    } else if (minutes < 180) {
      next.push({ title: 'Training volume', text: `You have logged ${minutes} minutes across ${sessions.length} session${sessions.length === 1 ? '' : 's'} this week.`, tag: 'TRAINING' });
    } else {
      next.push({ title: 'Training volume', text: `You have logged ${minutes} minutes across ${sessions.length} sessions this week.`, tag: 'TRAINING' });
    }

    if (upcoming.count) {
      next.push({ title: 'Competition on the horizon', text: 'You have an upcoming competition saved. Use the Compete area to review the event and checklist.', tag: 'COMPETE' });
    } else {
      next.push({ title: 'Competition calendar', text: 'No upcoming competition is currently saved. Add one when your next event is confirmed.', tag: 'COMPETE' });
    }

    const completed = goalRows.filter(g => g.status === 'completed' || Number(g.progress || 0) >= 100).length;
    if (goalRows.length) {
      next.push({ title: 'Goal progress', text: `${completed} of ${goalRows.length} saved goals are complete.`, tag: 'GOALS' });
    } else {
      next.push({ title: 'Build your roadmap', text: 'Create your first goal so AthleteN can show meaningful progress here.', tag: 'GOALS' });
    }

    if (weightValue != null) {
      next.push({ title: 'Latest weight', text: `Your latest saved measurement is ${weightValue.toFixed(1)} kg. Keep your records consistent for useful trends.`, tag: 'WEIGHT' });
    }

    setStats({ sessions: sessions.length, minutes, upcoming: upcoming.count ?? 0, goals: goalRows.length, weight: weightValue });
    setInsights(next);
    setLoading(false);
    setRefreshing(false);
  }, [session]);

  useEffect(() => { void load(); }, [load]);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>ATHLETEN INTELLIGENCE</Text>
              <Text style={styles.title}>Your performance, understood.</Text>
              <Text style={styles.subtitle}>A single place for your training, competition and progress signals.</Text>
            </View>
            <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>AI</Text></View>
          </View>

          <View style={styles.hero}>
            <View style={styles.heroTop}><Text style={styles.heroLabel}>ATHLETEN AI PANEL</Text><View style={styles.live}><View style={styles.dot}/><Text style={styles.liveText}>LIVE DATA</Text></View></View>
            <Text style={styles.heroTitle}>{profile?.discipline || 'Taekwondo'} performance intelligence</Text>
            <Text style={styles.heroCopy}>Insights are generated from the real information in your AthleteN account. Nothing here is invented.</Text>
            <Pressable onPress={() => void load()} style={styles.refresh}>
              {refreshing ? <ActivityIndicator color={c.text}/> : <Text style={styles.refreshText}>REFRESH INTELLIGENCE</Text>}
            </Pressable>
          </View>

          <View style={styles.stats}>
            <MiniStat label="7D SESSIONS" value={loading ? '—' : String(stats.sessions)} />
            <MiniStat label="7D MINUTES" value={loading ? '—' : String(stats.minutes)} />
            <MiniStat label="GOALS" value={loading ? '—' : String(stats.goals)} />
            <MiniStat label="UPCOMING" value={loading ? '—' : String(stats.upcoming)} />
          </View>

          <Text style={styles.section}>CURRENT SIGNALS</Text>
          {loading ? <ActivityIndicator color={c.accentBright} style={{ marginTop: 20 }} /> : insights.map((item, index) => (
            <View key={item.title + index} style={styles.card}>
              <View style={styles.cardTop}><Text style={styles.tag}>{item.tag}</Text><Text style={styles.index}>0{index + 1}</Text></View>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardText}>{item.text}</Text>
            </View>
          ))}

          <View style={styles.note}>
            <Text style={styles.noteTitle}>AI FOUNDATION</Text>
            <Text style={styles.noteText}>This panel is already connected to your real AthleteN data. The next AI service layer can turn these signals into deeper coaching analysis without changing the mobile experience.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <View style={styles.mini}><Text style={styles.miniLabel}>{label}</Text><Text style={styles.miniValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:c.background}, safe:{flex:1}, content:{padding:18,gap:14,paddingBottom:40},
  header:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',gap:14,paddingTop:8},
  eyebrow:{color:c.accentBright,fontSize:10,fontWeight:'900',letterSpacing:1.8}, title:{color:c.text,fontSize:29,fontWeight:'900',lineHeight:34,marginTop:7,maxWidth:310},
  subtitle:{color:c.muted,fontSize:12,lineHeight:18,marginTop:8,maxWidth:330}, aiBadge:{width:52,height:52,borderRadius:18,backgroundColor:c.accentSoft,borderWidth:1,borderColor:c.accentDeep,alignItems:'center',justifyContent:'center'},
  aiBadgeText:{color:c.accentBright,fontSize:17,fontWeight:'900',letterSpacing:1}, hero:{backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong,borderRadius:24,padding:18,gap:10,overflow:'hidden'},
  heroTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}, heroLabel:{color:c.text,fontSize:10,fontWeight:'900',letterSpacing:1.4}, live:{flexDirection:'row',alignItems:'center',gap:5},
  dot:{width:7,height:7,borderRadius:4,backgroundColor:c.success}, liveText:{color:c.success,fontSize:8,fontWeight:'900',letterSpacing:1}, heroTitle:{color:c.text,fontSize:20,fontWeight:'900',lineHeight:25},
  heroCopy:{color:c.muted,fontSize:12,lineHeight:19}, refresh:{height:46,borderRadius:14,backgroundColor:c.accent,borderWidth:1,borderColor:c.accentBright,alignItems:'center',justifyContent:'center'},
  refreshText:{color:'#fff',fontSize:10,fontWeight:'900',letterSpacing:1.2}, stats:{flexDirection:'row',flexWrap:'wrap',gap:9}, mini:{width:'48.3%',backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:17,padding:14,minHeight:76,justifyContent:'space-between'},
  miniLabel:{color:c.muted,fontSize:8,fontWeight:'900',letterSpacing:1}, miniValue:{color:c.text,fontSize:22,fontWeight:'900'}, section:{color:c.text,fontSize:10,fontWeight:'900',letterSpacing:1.6,marginTop:5},
  card:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:19,padding:16,gap:7}, cardTop:{flexDirection:'row',justifyContent:'space-between'}, tag:{color:c.accentBright,fontSize:8,fontWeight:'900',letterSpacing:1.1}, index:{color:c.muted,fontSize:9,fontWeight:'900'},
  cardTitle:{color:c.text,fontSize:16,fontWeight:'800'}, cardText:{color:c.muted,fontSize:12,lineHeight:19}, note:{backgroundColor:c.accentSoft,borderWidth:1,borderColor:c.accentDeep,borderRadius:19,padding:16,gap:7},
  noteTitle:{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:1.3}, noteText:{color:'#BBD6FF',fontSize:11,lineHeight:18},
});
