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
      supabase.from('medals').select('id',{count:'exact',head:true}).eq('user_id', uid),
      supabase.from('tournaments').select('id,name,starts_at,location,status').eq('user_id', uid).gte('starts_at', todayDate).order('starts_at',{ascending:true}).limit(1).maybeSingle(),
      supabase.from('weight_logs').select('weight_kg').eq('user_id', uid).order('logged_at',{ascending:false}).limit(1).maybeSingle(),
      supabase.from('goals').select('id,status,progress').eq('user_id', uid),
      supabase.from('notifications').select('id',{count:'exact',head:true}).eq('user_id', uid).is('read_at', null),
      supabase.from('training_sessions').select('session_date').eq('user_id', uid).gte('session_date', from).order('session_date',{ascending:false}),
    ]);

    const rows = training.data ?? [];
    const goalRows = goals.data ?? [];
    const dates = Array.from(new Set((recentTraining.data ?? []).map(x => x.session_date))).sort().reverse();
    let streak = 0;
    const cursor = new Date(today);
    while (true) {
      const key = cursor.toISOString().slice(0,10);
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
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content,{paddingBottom:insets.bottom+36}]}>
          <View style={styles.header}>
            <View style={styles.brand}><Image source={require('@/assets/logo.png')} style={styles.logo} contentFit="cover"/><Text style={styles.brandName}>ATHLETEN</Text></View>
            <View style={styles.headerRight}>
              <Pressable onPress={() => router.push('/profile')} style={styles.iconButton}><Text style={styles.icon}>⚙</Text></Pressable>
            </View>
          </View>

          <View style={styles.greeting}>
            <Text style={styles.eyebrow}>ATHLETE DASHBOARD</Text>
            <Text style={styles.title}>{greeting}, {firstName}</Text>
            <Text style={styles.copy}>{discipline} • Live from your AthleteN account</Text>
          </View>

          <View style={styles.statsRow}>
            <Stat label="SESSIONS" value={loading ? '—' : String(data.trainingCount)}/>
            <Stat label="MINUTES" value={loading ? '—' : String(data.trainingMinutes)}/>
            <Stat label="MEDALS" value={loading ? '—' : String(data.medalCount)}/>
          </View>

          <View style={styles.statsRow}>
            <Stat label="STREAK" value={loading ? '—' : String(data.streak)} suffix={data.streak === 1 ? ' day' : ' days'}/>
            <Stat label="WEIGHT" value={data.weight == null ? '—' : data.weight.toFixed(1)} suffix={data.weight == null ? '' : ' kg'}/>
            <Stat label="GOALS" value={loading ? '—' : data.goalCount ? `${data.completedGoals}/${data.goalCount}` : '0'}/>
          </View>

          <Text style={styles.section}>NEXT COMPETITION</Text>
          <Pressable style={styles.card} onPress={() => router.push('/compete')}>
            {data.upcoming ? <>
              <View style={styles.cardRow}><Text style={styles.cardTitle}>{data.upcoming.name}</Text><Text style={styles.link}>OPEN</Text></View>
              <Text style={styles.meta}>{data.upcoming.starts_at || 'Date not set'}{data.upcoming.location ? ' • ' + data.upcoming.location : ''}</Text>
              <Text style={styles.meta}>Status: {data.upcoming.status || 'planned'}</Text>
            </> : <>
              <Text style={styles.cardTitle}>No upcoming competition</Text>
              <Text style={styles.meta}>Nothing is stored yet. Tap here to add your next tournament.</Text>
            </>}
          </Pressable>

          <Text style={styles.section}>ACTIONS</Text>
          <View style={styles.actions}>
            <Action title="Log training" detail="Save a real session" onPress={() => router.push('/training')}/>
            <Action title="Track weight" detail="Save a measurement" onPress={() => router.push('/profile')}/>
          </View>
          <View style={styles.actions}>
            <Action title="Competitions" detail="Tournaments, matches, medals" onPress={() => router.push('/compete')}/>
            <Action title="Scanner" detail="Save and review scans" onPress={() => router.push('/scanner')}/>
          </View>

          <View style={styles.card}>
            <View style={styles.cardRow}><Text style={styles.cardTitle}>AthleteN status</Text>{data.unreadNotifications > 0 && <Text style={styles.link}>{data.unreadNotifications} NEW</Text>}</View>
            <Text style={styles.meta}>
              {data.unreadNotifications > 0 ? 'You have unread notifications.' : 'No unread notifications.'}
              {' '}All dashboard numbers are loaded from your account; no sample athlete data is used.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Stat({label,value,suffix}:{label:string;value:string;suffix?:string}) {
  return <View style={styles.stat}><Text style={styles.statLabel}>{label}</Text><Text style={styles.statValue}>{value}<Text style={styles.suffix}>{suffix}</Text></Text></View>;
}
function Action({title,detail,onPress}:{title:string;detail:string;onPress:()=>void}) {
  return <Pressable onPress={onPress} style={({pressed}) => [styles.action,pressed&&styles.pressed]}><Text style={styles.actionTitle}>{title}</Text><Text style={styles.meta}>{detail}</Text></Pressable>;
}

const styles=StyleSheet.create({
 container:{flex:1,backgroundColor:c.background},safe:{flex:1},content:{padding:20,gap:14},
 header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},brand:{flexDirection:'row',alignItems:'center',gap:10},logo:{width:38,height:38,borderRadius:11},brandName:{color:c.text,fontSize:15,fontWeight:'800',letterSpacing:3},headerRight:{flexDirection:'row'},iconButton:{width:42,height:42,borderRadius:21,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},icon:{fontSize:19,color:c.text},
 greeting:{paddingTop:8,gap:5},eyebrow:{color:c.accent,fontSize:10,fontWeight:'800',letterSpacing:1.5},title:{color:c.text,fontSize:27,fontWeight:'800'},copy:{color:c.muted,fontSize:13},
 statsRow:{flexDirection:'row',gap:10},stat:{flex:1,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:16,padding:13,gap:5},statLabel:{color:c.muted,fontSize:8,fontWeight:'900',letterSpacing:1},statValue:{color:c.text,fontSize:21,fontWeight:'800'},suffix:{color:c.muted,fontSize:9,fontWeight:'600'},
 section:{color:c.muted,fontSize:10,fontWeight:'900',letterSpacing:1.5,marginTop:5},card:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:18,padding:17,gap:7},cardRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10},cardTitle:{color:c.text,fontSize:16,fontWeight:'750',flex:1},meta:{color:c.muted,fontSize:12,lineHeight:18},link:{color:c.accent,fontSize:10,fontWeight:'900',letterSpacing:1},actions:{flexDirection:'row',gap:10},action:{flex:1,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:16,padding:16,gap:6},actionTitle:{color:c.text,fontSize:15,fontWeight:'700'},pressed:{opacity:0.72},
});
