import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

const colors = Colors.dark;

export default function HomeScreen() {
  const { session, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [trainingCount,setTrainingCount]=useState(0);
  const [upcoming,setUpcoming]=useState<{name:string;starts_at:string|null;location:string|null}|null>(null);
  const [medalCount,setMedalCount]=useState(0);
  const [weight,setWeight]=useState<number|null>(profile?.weight_kg ? Number(profile.weight_kg) : null);

  useEffect(() => {
    if (!session) return;
    const userId=session.user.id;
    Promise.all([
      supabase.from('training_sessions').select('id',{count:'exact',head:true}).eq('user_id',userId),
      supabase.from('tournaments').select('name,starts_at,location').eq('user_id',userId).gte('starts_at',new Date().toISOString().slice(0,10)).order('starts_at',{ascending:true}).limit(1).maybeSingle(),
      supabase.from('medals').select('id',{count:'exact',head:true}).eq('user_id',userId),
      supabase.from('weight_logs').select('weight_kg').eq('user_id',userId).order('logged_at',{ascending:false}).limit(1).maybeSingle(),
    ]).then(([training,tournament,medals,lastWeight])=>{
      setTrainingCount(training.count ?? 0);
      if (!tournament.error && tournament.data) setUpcoming(tournament.data);
      setMedalCount(medals.count ?? 0);
      if (!lastWeight.error && lastWeight.data) setWeight(Number(lastWeight.data.weight_kg));
    });
  }, [session]);

  const firstName=profile?.full_name?.split(' ')[0] || 'Athlete';
  const discipline=profile?.discipline || 'Taekwondo';

  return <View style={styles.container}><SafeAreaView style={styles.safe} edges={['top']}><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content,{paddingBottom:insets.bottom+32}]}>
    <View style={styles.header}><View style={styles.brand}><Image source={require('@/assets/logo.png')} style={styles.logo} contentFit="cover"/><Text style={styles.brandName}>ATHLETEN</Text></View><View style={styles.disciplinePill}><Text style={styles.disciplineText}>{discipline}</Text></View></View>
    <View style={styles.greeting}><Text style={styles.eyebrow}>ATHLETE DASHBOARD</Text><Text style={styles.title}>Good morning, {firstName}</Text><Text style={styles.copy}>Your real AthleteN progress, in one place.</Text></View>
    <View style={styles.statsRow}><Stat label="TRAINING" value={String(trainingCount)}/><Stat label="MEDALS" value={String(medalCount)}/><Stat label="WEIGHT" value={weight ? weight.toFixed(1) : '—'} suffix={weight?'kg':''}/></View>
    <Text style={styles.section}>NEXT COMPETITION</Text>
    <View style={styles.card}>{upcoming ? <><Text style={styles.cardTitle}>{upcoming.name}</Text><Text style={styles.meta}>{upcoming.starts_at || 'Date not set'}{upcoming.location ? '  •  ' + upcoming.location : ''}</Text></> : <><Text style={styles.cardTitle}>No upcoming competition</Text><Text style={styles.meta}>Add your next tournament from Compete.</Text></>}</View>
    <Text style={styles.section}>QUICK ACTIONS</Text>
    <View style={styles.actions}><Action title="Training" detail="Log a session"/><Action title="Weight" detail="Log measurement"/></View>
    <View style={styles.card}><Text style={styles.cardTitle}>AthleteN Intelligence</Text><Text style={styles.meta}>Insights will appear here as your training and competition data builds up.</Text></View>
  </ScrollView></SafeAreaView></View>;
}

function Stat({label,value,suffix}:{label:string;value:string;suffix?:string}){return <View style={styles.stat}><Text style={styles.statLabel}>{label}</Text><Text style={styles.statValue}>{value}<Text style={styles.suffix}>{suffix}</Text></Text></View>}
function Action({title,detail}:{title:string;detail:string}){return <View style={styles.action}><Text style={styles.actionTitle}>{title}</Text><Text style={styles.meta}>{detail}</Text></View>}

const styles=StyleSheet.create({
 container:{flex:1,backgroundColor:colors.background},safe:{flex:1},content:{padding:20,gap:16},
 header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},brand:{flexDirection:'row',alignItems:'center',gap:10},logo:{width:38,height:38,borderRadius:11},brandName:{color:colors.text,fontSize:15,fontWeight:'800',letterSpacing:3},disciplinePill:{borderWidth:1,borderColor:colors.accent,borderRadius:20,paddingHorizontal:11,paddingVertical:7},disciplineText:{color:colors.accent,fontSize:11,fontWeight:'800'},
 greeting:{paddingTop:10,gap:5},eyebrow:{color:colors.accent,fontSize:10,fontWeight:'800',letterSpacing:1.5},title:{color:colors.text,fontSize:28,fontWeight:'800'},copy:{color:colors.muted,fontSize:14},
 statsRow:{flexDirection:'row',gap:10},stat:{flex:1,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:16,padding:14,gap:5},statLabel:{color:colors.muted,fontSize:9,fontWeight:'800',letterSpacing:1},statValue:{color:colors.text,fontSize:23,fontWeight:'800'},suffix:{color:colors.muted,fontSize:10,fontWeight:'600'},
 section:{color:colors.muted,fontSize:10,fontWeight:'800',letterSpacing:1.5,marginTop:3},card:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:18,padding:17,gap:6},cardTitle:{color:colors.text,fontSize:16,fontWeight:'750'},meta:{color:colors.muted,fontSize:12,lineHeight:18},
 actions:{flexDirection:'row',gap:10},action:{flex:1,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:16,padding:16,gap:6},actionTitle:{color:colors.text,fontSize:15,fontWeight:'700'}
});
