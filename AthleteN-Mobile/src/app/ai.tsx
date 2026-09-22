import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { PerformanceLine, PerformanceBars, ProgressRing, ChartPoint } from '@/components/performance-chart';

const c=Colors.dark;
type Insight={tag:string;title:string;text:string};

export default function AIScreen(){
 const {session,profile}=useAuth(); const router=useRouter();const [refreshing,setRefreshing]=useState(false);const [training,setTraining]=useState<ChartPoint[]>([]);const [weight,setWeight]=useState<ChartPoint[]>([]);const [insights,setInsights]=useState<Insight[]>([]);const [goals,setGoals]=useState({total:0,completed:0});const [upcoming,setUpcoming]=useState(0);const [totalMinutes,setTotalMinutes]=useState(0);
 const load=useCallback(async()=>{
  if(!session)return;setRefreshing(true);const uid=session.user.id;const now=new Date();const days:string[]=[];for(let i=13;i>=0;i--){const d=new Date(now);d.setDate(now.getDate()-i);days.push([d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'))}
  const [t,w,g,e]=await Promise.all([
   supabase.from('training_sessions').select('minutes,session_date').eq('user_id',uid).gte('session_date',days[0]).lte('session_date',days[13]),
   supabase.from('weight_logs').select('weight_kg,logged_at').eq('user_id',uid).order('logged_at',{ascending:false}).limit(14),
   supabase.from('goals').select('progress,status').eq('user_id',uid),
   supabase.from('tournaments').select('id',{count:'exact',head:true}).eq('user_id',uid).gte('starts_at',now.toISOString())
  ]);
  const rows=t.data||[];const daily=days.map(day=>({label:day.slice(5).replace('-','/'),value:rows.filter(x=>x.session_date===day).reduce((sum,x)=>sum+Number(x.minutes||0),0)}));setTraining(daily);const mins=rows.reduce((sum,x)=>sum+Number(x.minutes||0),0);setTotalMinutes(mins);
  setWeight((w.data||[]).slice().reverse().map(x=>({label:String(x.logged_at).slice(5,10).replace('-','/'),value:Number(x.weight_kg)})));
  const gs=g.data||[];const completed=gs.filter(x=>x.status==='completed'||Number(x.progress||0)>=100).length;setGoals({total:gs.length,completed});setUpcoming(e.count||0);
  const next:Insight[]=[];
  const activeDays=daily.filter(x=>x.value>0).length;
  next.push(rows.length?{tag:'TRAINING',title:activeDays+' active days in 14 days',text:mins+' minutes logged across '+rows.length+' sessions. The graph shows where your workload is concentrated.'}:{tag:'TRAINING',title:'No recent training signal',text:'Log sessions to unlock workload and consistency analysis.'});
  if((w.data||[]).length>=2){const ordered=(w.data||[]).slice().sort((a,b)=>String(a.logged_at).localeCompare(String(b.logged_at))); const first=Number(ordered[0].weight_kg),last=Number(ordered[ordered.length-1].weight_kg),change=last-first;next.push({tag:'WEIGHT',title:'Weight trend is visible',text:'Latest measurements moved '+(change>=0?'+':'')+change.toFixed(1)+' kg across the saved history.'})}else next.push({tag:'WEIGHT',title:'More weight data needed',text:'Add at least two measurements to turn the weight section into a useful trend.'});
  next.push(e.count?{tag:'COMPETE',title:'Competition calendar is active',text:e.count+' upcoming event'+(e.count===1?'':'s')+' saved. Keep your preparation linked to the next event.'}:{tag:'COMPETE',title:'Build your competition calendar',text:'Add an upcoming tournament to connect training and competition preparation.'});
  next.push(gs.length?{tag:'GOALS',title:completed+' of '+gs.length+' goals complete',text:'Goal progress is tracked from the real values saved in your AthleteN profile.'}:{tag:'GOALS',title:'No goals yet',text:'Create a goal in Profile and AthleteN will visualize the progress.'});
  setInsights(next);setRefreshing(false);
 },[session]);
 useEffect(()=>{void load()},[load]);
 return <SafeAreaView style={s.screen} edges={['top']}><ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
  <View><Text style={s.kicker}>ATHLETEN INTELLIGENCE</Text><Text style={s.title}>Performance, understood.</Text><Text style={s.sub}>Your real training, competition, weight and goals turned into visual signals.</Text></View>
  <Pressable onPress={()=>router.push('/ai-coach')} style={s.coachCard}><View style={{flex:1}}><Text style={s.coachKicker}>AI COACH</Text><Text style={s.coachTitle}>Talk to your AthleteN coach</Text><Text style={s.coachText}>Ask about training, competitions and goals using the real data in your account.</Text></View><Text style={s.coachArrow}>›</Text></Pressable>
  <View style={s.hero}><View style={s.heroTop}><Text style={s.heroKicker}>{(profile?.discipline||'Taekwondo').toUpperCase()} PERFORMANCE</Text><View style={s.live}><View style={s.dot}/><Text style={s.liveText}>LIVE DATA</Text></View></View><Text style={s.heroTitle}>Your athlete picture</Text><Text style={s.heroText}>No invented numbers. AthleteN only analyzes records saved to your account.</Text><Pressable onPress={()=>void load()} disabled={refreshing} style={s.refresh}>{refreshing?<ActivityIndicator color="#fff"/>:<Text style={s.refreshText}>REFRESH ANALYSIS</Text>}</Pressable></View>
  <View style={s.statRow}><Stat value={String(totalMinutes)} label="14D MINUTES"/><Stat value={String(upcoming)} label="UPCOMING"/><Stat value={goals.total?Math.round(goals.completed/goals.total*100)+'%':'—'} label="GOAL COMPLETION"/></View>
  <PerformanceLine title="Training load" subtitle="Daily minutes · last 14 days" data={training} unit="m"/>
  <PerformanceLine title="Weight movement" subtitle="Saved measurements · latest 14 records" data={weight} unit="kg" accent={c.success}/>
  <ProgressRing value={goals.total?goals.completed/goals.total*100:0} label="Goal progress" detail={goals.total?goals.completed+' of '+goals.total+' goals complete':'No goals saved yet'}/>
  <View style={s.sectionHead}><Text style={s.section}>CURRENT SIGNALS</Text><Text style={s.sectionMeta}>{insights.length} LIVE</Text></View>
  {insights.map((x,i)=><View style={s.signal} key={x.tag+i}><View style={s.signalTop}><Text style={s.tag}>{x.tag}</Text><Text style={s.number}>0{i+1}</Text></View><Text style={s.signalTitle}>{x.title}</Text><Text style={s.signalText}>{x.text}</Text></View>)}
  <View style={s.footer}><Text style={s.footerTitle}>ATHLETEN INTELLIGENCE</Text><Text style={s.footerText}>Visual signals are calculated from your saved records. More logged data makes the trends more meaningful.</Text></View>
 </ScrollView></SafeAreaView>
}
function Stat({value,label}:{value:string;label:string}){return <View style={s.stat}><Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text><Text style={s.statLabel}>{label}</Text></View>}
const s=StyleSheet.create({
 screen:{flex:1,backgroundColor:c.background},content:{padding:18,paddingTop:8,paddingBottom:50,gap:13},kicker:{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:1.6},title:{color:c.text,fontSize:31,fontWeight:'900',lineHeight:36,marginTop:6},sub:{color:c.muted,fontSize:12,lineHeight:18,marginTop:4},
 hero:{backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong,borderRadius:24,padding:17,gap:9},heroTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},heroKicker:{color:c.accentBright,fontSize:8,fontWeight:'900',letterSpacing:1.2},live:{flexDirection:'row',alignItems:'center',gap:6},dot:{width:7,height:7,borderRadius:4,backgroundColor:c.success},liveText:{color:c.success,fontSize:8,fontWeight:'900',letterSpacing:1},heroTitle:{color:c.text,fontSize:21,fontWeight:'900'},heroText:{color:c.muted,fontSize:11,lineHeight:17},refresh:{height:46,borderRadius:13,backgroundColor:c.accent,alignItems:'center',justifyContent:'center'},refreshText:{color:'#fff',fontSize:10,fontWeight:'900',letterSpacing:1},
 statRow:{flexDirection:'row',gap:9},stat:{flex:1,backgroundColor:c.surfaceRaised,borderWidth:1,borderColor:c.border,borderRadius:17,padding:13,minHeight:82,justifyContent:'space-between'},statValue:{color:c.text,fontSize:21,fontWeight:'900'},statLabel:{color:c.muted,fontSize:7,fontWeight:'900',letterSpacing:1},
 sectionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:3},section:{color:c.text,fontSize:10,fontWeight:'900',letterSpacing:1.5},sectionMeta:{color:c.success,fontSize:8,fontWeight:'900',letterSpacing:1},signal:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:19,padding:15,gap:6},signalTop:{flexDirection:'row',justifyContent:'space-between'},tag:{color:c.accentBright,fontSize:8,fontWeight:'900',letterSpacing:1},number:{color:c.muted,fontSize:8,fontWeight:'900'},signalTitle:{color:c.text,fontSize:15,fontWeight:'900'},signalText:{color:c.muted,fontSize:11,lineHeight:18},footer:{backgroundColor:c.accentSoft,borderWidth:1,borderColor:c.accentDeep,borderRadius:18,padding:15,gap:5},footerTitle:{color:c.accentBright,fontSize:8,fontWeight:'900',letterSpacing:1.2},footerText:{color:'#BBD6FF',fontSize:10,lineHeight:17}
});