import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { validMinutes, validWeight } from '@/lib/performance';
import { PerformanceLine, ChartPoint } from '@/components/performance-chart';

const c=Colors.dark;

export default function HomeScreen(){
 const {session,profile}=useAuth(); const router=useRouter();
 const [minutes,setMinutes]=useState(0);const [sessions,setSessions]=useState(0);const [chart,setChart]=useState<ChartPoint[]>([]);const [weight,setWeight]=useState<number|null>(null);const [medals,setMedals]=useState(0);const [next,setNext]=useState<any>(null);
 const load=useCallback(async()=>{
  if(!session)return; const uid=session.user.id; const now=new Date(); const days:string[]=[];
  for(let i=6;i>=0;i--){const d=new Date(now);d.setDate(now.getDate()-i);days.push([d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'))}
  const [t,w,m,e]=await Promise.all([
   supabase.from('training_sessions').select('minutes,session_date').eq('user_id',uid).gte('session_date',days[0]).lte('session_date',days[6]),
   supabase.from('weight_logs').select('weight_kg').eq('user_id',uid).order('logged_at',{ascending:false}).limit(1).maybeSingle(),
   supabase.from('medals').select('id',{count:'exact',head:true}).eq('user_id',uid),
   supabase.from('tournaments').select('id,name,starts_at,location,status').eq('user_id',uid).gte('starts_at',now.toISOString()).order('starts_at',{ascending:true}).limit(1).maybeSingle()
  ]);
  const rows=(t.data||[]).map(r=>({...r,_minutes:validMinutes(r.minutes)})).filter(r=>r._minutes>0);setSessions(rows.length);setMinutes(rows.reduce((sum,r)=>sum+r._minutes,0));setChart(days.map(day=>({label:day.slice(5).replace('-','/'),value:rows.filter(r=>String(r.session_date).slice(0,10)===day).reduce((sum,r)=>sum+r._minutes,0)})));setWeight(w.data?validWeight(w.data.weight_kg):null);setMedals(m.count||0);setNext(e.data||null);
 },[session]);
 useEffect(()=>{void load()},[load]);
 const first=profile?.full_name?.split(' ')[0]||'Athlete';
 return <SafeAreaView style={s.screen} edges={['top']}><ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
  <View style={s.header}><View style={s.brandRow}><Image source={require('@/assets/logo.png')} style={s.logo}/><View><Text style={s.brand}>ATHLETEN</Text><Text style={s.brandSub}>ATHLETE PERFORMANCE</Text></View></View><Pressable onPress={()=>router.push('/profile')} style={s.settings}><Text style={s.settingsText}>⚙</Text></Pressable></View>
  <View style={s.hero}><View><Text style={s.kicker}>YOUR PERFORMANCE HUB</Text><Text style={s.greeting}>Good morning,</Text><Text style={s.name}>{first}</Text><View style={s.pill}><View style={s.dot}/><Text style={s.pillText}>{(profile?.discipline||'TAEKWONDO').toUpperCase()} • LIVE</Text></View></View><View style={s.heroOrb}><Text style={s.heroMark}>A</Text></View></View>
  <View style={s.grid}><Metric label="7D SESSIONS" value={sessions}/><Metric label="7D MINUTES" value={minutes} suffix=" min"/><Metric label="MEDALS" value={medals}/><Metric label="LATEST WEIGHT" value={weight==null?'—':weight} suffix={weight==null?'':' kg'}/></View>
  <PerformanceLine title="Training rhythm" subtitle="Minutes logged across the last 7 days" data={chart} unit="m"/>
  <View style={s.sectionHead}><Text style={s.section}>NEXT COMPETITION</Text><Pressable onPress={()=>router.push('/compete')}><Text style={s.link}>VIEW ALL</Text></Pressable></View>
  {next?<View style={s.competition}><View style={s.competitionBadge}><Text style={s.competitionDay}>{new Date(next.starts_at).getDate()}</Text><Text style={s.competitionMonth}>{new Date(next.starts_at).toLocaleString(undefined,{month:'short'}).toUpperCase()}</Text></View><View style={s.competitionCopy}><Text style={s.competitionTitle} numberOfLines={2}>{next.name}</Text><Text style={s.meta}>{next.location||'Location not set'} • {(next.status||'planned').toUpperCase()}</Text></View></View>:<View style={s.empty}><Text style={s.emptyTitle}>No upcoming competition</Text><Text style={s.meta}>Add your next tournament in Compete to build your preparation view.</Text></View>}
  <View style={s.sectionHead}><Text style={s.section}>QUICK ACTIONS</Text></View>
  <View style={s.actions}><Action title="Training" text="Log today's work" onPress={()=>router.push('/training')}/><Action title="AI" text="See performance signals" onPress={()=>router.push('/ai')}/><Action title="Compete" text="Events & medals" onPress={()=>router.push('/compete')}/><Action title="Scanner" text="Track tournament sources" onPress={()=>router.push('/scanner')}/></View>
 </ScrollView></SafeAreaView>
}
function Metric({label,value,suffix='' }:{label:string;value:number|string;suffix?:string}){return <View style={s.metric}><Text style={s.metricLabel}>{label}</Text><Text style={s.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{value}{suffix}</Text></View>}
function Action({title,text,onPress}:{title:string;text:string;onPress:()=>void}){return <Pressable onPress={onPress} style={s.action}><View style={s.actionIcon}><Text style={s.actionIconText}>{title.slice(0,1)}</Text></View><View style={s.actionCopy}><Text style={s.actionTitle}>{title}</Text><Text style={s.actionText}>{text}</Text></View><Text style={s.chevron}>›</Text></Pressable>}
const s=StyleSheet.create({
 screen:{flex:1,backgroundColor:c.background},content:{paddingHorizontal:18,paddingTop:8,paddingBottom:48,gap:13},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},brandRow:{flexDirection:'row',alignItems:'center',gap:10},logo:{width:42,height:42,borderRadius:13},brand:{color:c.text,fontSize:16,fontWeight:'900',letterSpacing:3.3},brandSub:{color:c.muted,fontSize:7,fontWeight:'800',letterSpacing:1.1,marginTop:2},settings:{width:46,height:46,borderRadius:15,backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong,alignItems:'center',justifyContent:'center'},settingsText:{color:c.text,fontSize:18},
 hero:{minHeight:178,backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong,borderRadius:26,padding:20,overflow:'hidden',flexDirection:'row',justifyContent:'space-between',alignItems:'center'},kicker:{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:1.5},greeting:{color:c.text,fontSize:25,fontWeight:'900',marginTop:8},name:{color:c.text,fontSize:34,fontWeight:'900',lineHeight:37},pill:{flexDirection:'row',alignItems:'center',gap:6,alignSelf:'flex-start',backgroundColor:c.accentSoft,borderRadius:999,paddingHorizontal:11,paddingVertical:7,marginTop:12},dot:{width:7,height:7,borderRadius:4,backgroundColor:c.success},pillText:{color:c.accentBright,fontSize:8,fontWeight:'900',letterSpacing:1},heroOrb:{width:100,height:100,borderRadius:50,backgroundColor:c.accentDeep,borderWidth:1,borderColor:c.accent,alignItems:'center',justifyContent:'center',opacity:.95},heroMark:{color:c.accentBright,fontSize:42,fontWeight:'900'},
 grid:{flexDirection:'row',flexWrap:'wrap',gap:10},metric:{width:'48%',minHeight:88,backgroundColor:c.surfaceRaised,borderWidth:1,borderColor:c.border,borderRadius:18,padding:14,justifyContent:'space-between'},metricLabel:{color:c.muted,fontSize:8,fontWeight:'900',letterSpacing:1},metricValue:{color:c.text,fontSize:23,fontWeight:'900'},
 sectionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:3},section:{color:c.muted,fontSize:9,fontWeight:'900',letterSpacing:1.5},link:{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:.8},competition:{flexDirection:'row',alignItems:'center',gap:13,backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong,borderRadius:20,padding:14},competitionBadge:{width:55,height:55,borderRadius:16,backgroundColor:c.accentSoft,alignItems:'center',justifyContent:'center'},competitionDay:{color:c.text,fontSize:21,fontWeight:'900'},competitionMonth:{color:c.accentBright,fontSize:7,fontWeight:'900',letterSpacing:1},competitionCopy:{flex:1},competitionTitle:{color:c.text,fontSize:15,fontWeight:'900',lineHeight:19},meta:{color:c.muted,fontSize:10,lineHeight:16},empty:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:18,padding:16,gap:4},emptyTitle:{color:c.text,fontSize:14,fontWeight:'800'},
 actions:{gap:9},action:{minHeight:66,flexDirection:'row',alignItems:'center',backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:17,padding:12,gap:11},actionIcon:{width:38,height:38,borderRadius:12,backgroundColor:c.accentSoft,alignItems:'center',justifyContent:'center'},actionIconText:{color:c.accentBright,fontSize:12,fontWeight:'900'},actionCopy:{flex:1},actionTitle:{color:c.text,fontSize:13,fontWeight:'900'},actionText:{color:c.muted,fontSize:10,marginTop:2},chevron:{color:c.muted,fontSize:25}
});