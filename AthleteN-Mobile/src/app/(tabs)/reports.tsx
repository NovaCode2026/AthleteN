// @ts-nocheck
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Screen, Header, Section, Card, c, Empty } from '@/components/mobile-ui';

const roleName = (role:string) => role === 'academy_admin' || role === 'academy' ? 'Academy' : role === 'coach' ? 'Coach' : 'Athlete';
const hasReportPlan = (role:string, plan:string) => {
  if (role === 'coach') return plan === 'coach';
  if (role === 'academy_admin' || role === 'academy') return plan === 'academy';
  return ['student','pro','elite'].includes(plan);
};
const completedMonth = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth()-1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 1);
  const key=(date:Date)=>date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
  return { start:key(start), end:key(end), label:start.toLocaleString(undefined,{month:'long',year:'numeric'}) };
};

export default function Reports(){
 const {session,profile,syncVersion}=useAuth();
 const uid=session?.user?.id;
 const router=useRouter();
 const role=String(profile?.role||'athlete');
 const plan=String(profile?.plan_id||'free');
 const eligible=hasReportPlan(role,plan);
 const period=useMemo(() => completedMonth(), []);
 const [stats,setStats]=useState<any>(null);
 const [history,setHistory]=useState<any[]>([]);
 const [current,setCurrent]=useState<any>(null);
 const [match,setMatch]=useState({event:'',opponent:'',result:'',score:'',notes:''});
 const [busy,setBusy]=useState('');
 const [loading,setLoading]=useState(true);
 const [message,setMessage]=useState('');

 const loadHistory=useCallback(async()=>{
  if(!uid)return;
  setLoading(true);
  const {data,error}=await supabase.from('ai_intelligence_reports')
   .select('id,report_type,title,period_start,period_end,content,created_at')
   .eq('user_id',uid).order('created_at',{ascending:false}).limit(12);
  if(error)setMessage(error.message);else setHistory(data||[]);
  setLoading(false);
 },[uid]);
 useEffect(()=>{void loadHistory()},[loadHistory,syncVersion]);

 async function monthlySnapshot(){
  if(!uid)throw new Error('Please sign in again.');
  let athleteIds=[uid];
  let coachCount=role==='coach'?1:0;
  let newAthleteMemberships=0;
  let newCoachMemberships=0;
  if(role==='coach'){
   const links=await supabase.from('coach_athlete_links').select('athlete_user_id').eq('coach_user_id',uid).eq('status','active');
   if(links.error)throw links.error;
   athleteIds=[...new Set((links.data||[]).map((x:any)=>String(x.athlete_user_id)))];
  }else if(role==='academy_admin'||role==='academy'){
   let academyId=String(profile?.academy_id||'');
   if(!academyId){
    const a=await supabase.from('academies').select('id').eq('owner_user_id',uid).eq('status','active').order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(a.error)throw a.error;
    academyId=String(a.data?.id||'');
   }
   if(academyId){
    const m=await supabase.from('academy_memberships').select('user_id,role,status,created_at').eq('academy_id',academyId).eq('status','active');
    if(m.error)throw m.error;
    const members=m.data||[];
    athleteIds=[...new Set(members.filter((x:any)=>x.role==='athlete').map((x:any)=>String(x.user_id)))];
    coachCount=new Set(members.filter((x:any)=>x.role==='coach').map((x:any)=>String(x.user_id))).size;
    newAthleteMemberships=members.filter((x:any)=>x.role==='athlete'&&String(x.created_at||'')>=period.start&&String(x.created_at||'')<period.end).length;
    newCoachMemberships=members.filter((x:any)=>x.role==='coach'&&String(x.created_at||'')>=period.start&&String(x.created_at||'')<period.end).length;
   }else athleteIds=[];
  }
  if(role==='athlete')athleteIds=[uid];
  const facts:any={role,periodStart:period.start,periodEnd:period.end,athleteCount:role==='athlete'?1:athleteIds.length,coachCount,newAthleteMemberships,newCoachMemberships,sessions:0,trainingMinutes:0,attendanceRecords:0,attendanceStatusBreakdown:{},medals:0,competitions:0,activeGoals:0,medalBreakdown:{} as Record<string,number>};
  if(!athleteIds.length)return facts;
  const [t,a,m,e,g]=await Promise.all([
   supabase.from('training_sessions').select('user_id,session_date,minutes').in('user_id',athleteIds).gte('session_date',period.start).lt('session_date',period.end),
   supabase.from('attendance_records').select('user_id,attended_at,status').in('user_id',athleteIds).gte('attended_at',period.start+'T00:00:00').lt('attended_at',period.end+'T00:00:00'),
   supabase.from('medals').select('user_id,awarded_at,medal_type').in('user_id',athleteIds).gte('awarded_at',period.start).lt('awarded_at',period.end),
   supabase.from('tournaments').select('user_id,starts_at,status').in('user_id',athleteIds).gte('starts_at',period.start).lt('starts_at',period.end),
   supabase.from('goals').select('user_id,status').in('user_id',athleteIds)
  ]);
  const failed=[t,a,m,e,g].find((x:any)=>x.error);if(failed?.error)throw failed.error;
  facts.sessions=(t.data||[]).length;
  facts.trainingMinutes=(t.data||[]).reduce((s:number,x:any)=>s+Number(x.minutes||0),0);
  facts.attendanceRecords=(a.data||[]).length;
  (a.data||[]).forEach((x:any)=>{const key=String(x.status||'Unspecified');facts.attendanceStatusBreakdown[key]=(facts.attendanceStatusBreakdown[key]||0)+1});
  facts.medals=(m.data||[]).length;
  facts.competitions=(e.data||[]).length;
  facts.activeGoals=(g.data||[]).filter((x:any)=>!['completed','cancelled'].includes(String(x.status||'').toLowerCase())).length;
  (m.data||[]).forEach((x:any)=>{const key=String(x.medal_type||'Unspecified');facts.medalBreakdown[key]=(facts.medalBreakdown[key]||0)+1});
  return facts;
 }
 async function askAi(topic:string,prompt:string){
  if(!session?.access_token)throw new Error('Your login session expired. Sign in again.');
  const base=(process.env.EXPO_PUBLIC_ATHLETEN_API_URL||'https://athleten.netlify.app').replace(/\/$/,'');
  const response=await fetch(base+'/.netlify/functions/ai-coach',{
   method:'POST',
   headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},
   body:JSON.stringify({topic,prompt})
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(payload.error||'AI report could not be generated.');
  return String(payload.answer||'');
 }

 async function generateMonthly(){
  if(!eligible){setMessage('An active paid plan for your account role is required.');return}
  setBusy('monthly');setMessage('');
  try{
   const facts=await monthlySnapshot();setStats(facts);
   const prompt=[
    'Create an AthleteN monthly performance report for the completed period '+facts.periodStart+' to '+facts.periodEnd+'.',
    'Account role: '+roleName(role)+'. Use only the verified account-record totals below.',
    'Athletes included: '+facts.athleteCount,
    'Active coaches in academy/team scope: '+facts.coachCount,
    'New athlete memberships during the period: '+facts.newAthleteMemberships,
    'New coach memberships during the period: '+facts.newCoachMemberships,
    'Training sessions: '+facts.sessions,
    'Training minutes: '+facts.trainingMinutes,
    'Attendance records: '+facts.attendanceRecords+' ('+JSON.stringify(facts.attendanceStatusBreakdown)+')',
    'Medals: '+facts.medals+' ('+JSON.stringify(facts.medalBreakdown)+')',
    'Competitions recorded: '+facts.competitions,
    'Goals not marked completed/cancelled: '+facts.activeGoals,
    'Write: Monthly overview, team/academy membership snapshot, training and attendance, recorded highlights, competition and medal highlights, consistency observations, data limitations and practical next-month priorities. For Academy reports, distinguish active coach and athlete membership counts from new memberships created during the month. Do not invent attendance, heart-rate, technical or match facts.'
   ].join('\\n');
   const answer=await askAi('Performance Reports',prompt);
   const title=roleName(role)+' Monthly Report · '+period.label;
   const {error}=await supabase.from('ai_intelligence_reports').insert({user_id:uid,report_type:'monthly',subject_role:role==='academy'?'academy_admin':role,title,period_start:facts.periodStart,period_end:facts.periodEnd,input_snapshot:facts,content:answer});
   if(error)throw error;
   setCurrent({id:'new',report_type:'monthly',title,content:answer,created_at:new Date().toISOString()});
   setMessage('Monthly report generated and saved.');
   await loadHistory();
  }catch(e){setMessage(e instanceof Error?e.message:'Monthly report failed.')}
  finally{setBusy('')}
 }

 async function generateMatch(){
  if(!eligible){setMessage('An active paid plan for your account role is required.');return}
  if(!match.event.trim()||!match.result.trim()||!match.notes.trim()){setMessage('Enter the event, result and match observations first.');return}
  setBusy('match');setMessage('');
  try{
   const prompt=[
    'Create an AthleteN AI match report using only details supplied below.',
    'Event: '+match.event,'Opponent/style: '+(match.opponent||'Not provided'),
    'Result/round: '+match.result,'Score: '+(match.score||'Not provided'),
    'Athlete/coach observations: '+match.notes,
    'Use: Match summary, observed strengths, areas to review, tactical lessons and next-practice priorities.',
    'Do not invent scoring events, techniques or statistics. Do not claim video analysis. Separate supplied observations from suggestions.'
   ].join('\\n');
   const answer=await askAi('Match Analysis',prompt);
   const title='Match Report · '+match.event.trim();
   const {error}=await supabase.from('ai_intelligence_reports').insert({user_id:uid,report_type:'match',subject_role:role==='academy'?'academy_admin':role,title,input_snapshot:match,content:answer});
   if(error)throw error;
   setCurrent({id:'new',report_type:'match',title,content:answer,created_at:new Date().toISOString()});
   setMatch({event:'',opponent:'',result:'',score:'',notes:''});
   setMessage('AI match report generated and saved.');
   await loadHistory();
  }catch(e){setMessage(e instanceof Error?e.message:'Match report failed.')}
  finally{setBusy('')}
 }

 async function share(report:any){
  if(!report)return;
  try{await Share.share({title:report.title,message:report.title+'\\n\\n'+report.content})}
  catch(e){setMessage(e instanceof Error?e.message:'Could not share report.')}
 }
 const active=current||history[0]||null;
 return <Screen>
  <Header back eyebrow="ATHLETEN INTELLIGENCE" title="AI Reports" subtitle="Match analysis and monthly reports for your account role."/>
  {!eligible?<Card accent><Text style={{color:c.text,fontSize:16,fontWeight:'900'}}>AI reports are a paid feature</Text><Text style={{color:c.muted,fontSize:11,lineHeight:17,marginTop:6}}>Choose the paid plan for your verified account role to unlock AI Match Reports and AI Monthly Reports.</Text><Pressable onPress={()=>router.push('/plans')} style={{marginTop:10,backgroundColor:c.accent,borderRadius:10,padding:12,alignItems:'center'}}><Text style={{color:'#fff',fontWeight:'900',fontSize:9}}>VIEW PLANS</Text></Pressable></Card>:<>
   <Section title="AI MATCH REPORT"><Card>
    <Text style={{color:c.muted,fontSize:10,lineHeight:16}}>Generate a structured review from match details and observations. AthleteN will not invent events or claim to analyse footage it has not received.</Text>
    {(['event','opponent','result','score','notes'] as const).map((key)=> <View key={key} style={{gap:5,marginTop:9}}>
     <Text style={{color:c.text,fontSize:9,fontWeight:'900'}}>{key==='event'?'EVENT / TOURNAMENT *':key==='opponent'?'OPPONENT / STYLE (OPTIONAL)':key==='result'?'RESULT / ROUND *':key==='score'?'SCORE (OPTIONAL)':'MATCH OBSERVATIONS *'}</Text>
     <TextInput multiline={key==='notes'} numberOfLines={key==='notes'?4:1} value={match[key]} onChangeText={v=>setMatch({...match,[key]:v})} maxLength={key==='notes'?2000:160} placeholder={key==='notes'?'What happened? What worked? What should be reviewed with your coach?':''} placeholderTextColor={c.muted} style={{minHeight:key==='notes'?92:44,backgroundColor:c.background,borderWidth:1,borderColor:c.border,borderRadius:11,padding:11,color:c.text,fontSize:11,textAlignVertical:'top'}}/>
    </View>)}
    <Pressable disabled={!!busy} onPress={()=>void generateMatch()} style={{marginTop:12,backgroundColor:c.accent,borderRadius:11,padding:13,alignItems:'center'}}><Text style={{color:'#fff',fontSize:9,fontWeight:'900'}}>{busy==='match'?'GENERATING…':'GENERATE AI MATCH REPORT'}</Text></Pressable>
   </Card></Section>
   <Section title="AI MONTHLY REPORT"><Card accent>
    <Text style={{color:c.accentBright,fontSize:9,fontWeight:'900'}}>{roleName(role).toUpperCase()} · {period.label.toUpperCase()}</Text>
    <Text style={{color:c.text,fontSize:14,fontWeight:'900',marginTop:5}}>Your monthly performance review</Text>
    <Text style={{color:c.muted,fontSize:10,lineHeight:16,marginTop:5}}>Uses training, competition, medal and goal records visible to your account for the previous completed month.</Text>
    {stats?<View style={{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:12}}>
     {[['Sessions',stats.sessions],['Training hours',(stats.trainingMinutes/60).toFixed(1)],['Attendance',stats.attendanceRecords],['Medals',stats.medals],['Athletes',stats.athleteCount],...(role!=='athlete'?[['Coaches',stats.coachCount]]:[])].map(([k,v])=><View key={k} style={{minWidth:'45%',flexGrow:1,backgroundColor:c.background,borderRadius:11,padding:10}}><Text style={{color:c.text,fontSize:18,fontWeight:'900'}}>{v}</Text><Text style={{color:c.muted,fontSize:8}}>{k}</Text></View>)}
    </View>:null}
    <Pressable disabled={!!busy} onPress={()=>void generateMonthly()} style={{marginTop:12,backgroundColor:c.accent,borderRadius:11,padding:13,alignItems:'center'}}><Text style={{color:'#fff',fontSize:9,fontWeight:'900'}}>{busy==='monthly'?'GENERATING…':'GENERATE AI MONTHLY REPORT'}</Text></Pressable>
   </Card></Section>
  </>}
  {message?<Text style={{color:c.accentBright,fontSize:10,lineHeight:16}}>{message}</Text>:null}
  <Section title="SAVED REPORT HISTORY">
   {loading?<ActivityIndicator color={c.accent}/>:history.length?history.map(x=><Pressable key={x.id} onPress={()=>setCurrent(x)} style={{marginBottom:8}}><Card><Text style={{color:c.text,fontSize:12,fontWeight:'900'}}>{x.title}</Text><Text style={{color:c.muted,fontSize:9,marginTop:4}}>{String(x.report_type).toUpperCase()} · {new Date(x.created_at).toLocaleString()}</Text></Card></Pressable>):<Empty text="No AI reports generated yet."/>}
  </Section>
  {active?<Section title="REPORT PREVIEW"><Card><Text style={{color:c.text,fontSize:15,fontWeight:'900'}}>{active.title}</Text><Text style={{color:c.muted,fontSize:9,marginTop:5}}>{new Date(active.created_at).toLocaleString()}</Text><Text selectable style={{color:c.text,fontSize:11,lineHeight:18,marginTop:12}}>{active.content}</Text><Pressable onPress={()=>void share(active)} style={{marginTop:12,borderWidth:1,borderColor:c.accent,borderRadius:11,padding:12,alignItems:'center'}}><Text style={{color:c.accentBright,fontSize:9,fontWeight:'900'}}>SHARE REPORT</Text></Pressable></Card></Section>:null}
 </Screen>;
}
