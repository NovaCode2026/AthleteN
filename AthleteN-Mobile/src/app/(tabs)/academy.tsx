// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Icon as AppIcon } from '@/components/mobile-ui';
import { Screen, Card, Button, Field, c, RefreshButton } from '@/components/mobile-ui';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { getAiLimit } from '@/lib/entitlements';
import PlanSection from '@/components/plan-section';

type Tab='Dashboard'|'People'|'Coaches'|'Training'|'Attendance'|'Events'|'Calendar'|'Intelligence'|'Achievements'|'Approvals'|'Communication'|'Finance';
type Member={user_id:string;role:string;status:string;full_name?:string|null;belt?:string|null;discipline?:string|null;username?:string|null;weight_kg?:number|null;competition_weight_category?:string|null};
type Session={id:string;session_date:string;start_time:string;title:string};
type Event={id:string;user_id?:string;name:string;starts_at:string;location?:string|null;status?:string|null;result?:string|null;coach_user_id?:string|null;discipline?:string|null;verification_status?:string|null};

const academyIconMap:any={athletes:'people',coaches:'coach',training:'training',events:'event',people:'people',finance:'finance',calendar:'calendar',ai:'ai',settings:'settings',code:'searchCircle',refresh:'refresh',chevron:'arrow'};
function Icon({name,size=20,color=c.accentBright}:{name:string;size?:number;color?:string}){return <AppIcon name={academyIconMap[name]||name} size={size} color={color}/>} 

export const ACADEMY_NAV_KEY='athleten.academy-navigation.v1';
export const ACADEMY_NAV_DEFAULT=['Dashboard','People','Coaches','Training','Attendance','Events'] as const;
export const ACADEMY_NAV_AVAILABLE=[
 {id:'Dashboard',label:'Dashboard',icon:'dashboard'},
 {id:'People',label:'People',icon:'people'},
 {id:'Coaches',label:'Coaches',icon:'coach'},
 {id:'Training',label:'Training',icon:'training'},
 {id:'Attendance',label:'Attendance',icon:'calendar'},
 {id:'Events',label:'Events',icon:'event'},
 {id:'Calendar',label:'Calendar',icon:'calendar'},
 {id:'Intelligence',label:'Intelligence',icon:'ai'},
 {id:'Achievements',label:'Achievements',icon:'trophy'},
 {id:'Approvals',label:'Approvals',icon:'shield'},
 {id:'Communication',label:'Communication',icon:'message'},
 {id:'Finance',label:'Finance',icon:'finance'},
 {id:'AI',label:'AI',icon:'ai'},
] as const;

function LineGraph({values,labels,suffix='' }:{values:number[];labels:string[];suffix?:string}){
 const [width,setWidth]=useState(0);
 const max=Math.max(1,...values); const min=Math.min(...values); const range=Math.max(1,max-min);
 const points=values.map((v,i)=>({x:values.length>1?(i/(values.length-1))*Math.max(0,width-12):width/2,y:8+((max-v)/range)*84}));
 return <View onLayout={e=>setWidth(e.nativeEvent.layout.width)} style={{height:126,position:'relative',marginTop:8}}>
  {width>0?points.slice(0,-1).map((p,i)=>{const n=points[i+1];const dx=n.x-p.x,dy=n.y-p.y;const len=Math.sqrt(dx*dx+dy*dy);const angle=Math.atan2(dy,dx)+'rad';return <View key={i} style={{position:'absolute',left:p.x+6,top:p.y,width:len,height:2,borderRadius:2,backgroundColor:c.accent,transform:[{rotate:angle}],transformOrigin:'left center'}}/>}):null}
  {points.map((p,i)=><View key={'p'+i} style={{position:'absolute',left:p.x,top:p.y-3,width:8,height:8,borderRadius:4,backgroundColor:c.accent,borderWidth:2,borderColor:c.background}}><View style={{position:'absolute',left:-12,top:-20,width:34}}><Text style={{color:c.muted,fontSize:7,textAlign:'center'}}>{Math.round(values[i])}{suffix}</Text></View></View>)}
  <View style={{position:'absolute',left:0,right:0,bottom:0,flexDirection:'row',justifyContent:'space-between'}}>{labels.map((label,i)=><Text key={i} style={{color:c.muted,fontSize:7}}>{label}</Text>)}</View>
 </View>;
}

function Stat({icon,label,value,sub,accent=c.accent,onPress}:{icon:string;label:string;value:string|number;sub:string;accent?:string;onPress?:()=>void}){
 const content=<Card style={{flex:1,minWidth:0,padding:14}}>
  <View style={{flexDirection:'row',alignItems:'center',gap:10}}>
   <View style={{width:40,height:40,borderRadius:13,backgroundColor:accent+'20',alignItems:'center',justifyContent:'center'}}><Icon name={icon} color={accent} size={21}/></View>
   <View style={{flex:1,minWidth:0}}><Text numberOfLines={1} adjustsFontSizeToFit style={{color:c.muted,fontSize:8,fontWeight:'900',letterSpacing:.5}}>{label.toUpperCase()}</Text><Text style={{color:c.text,fontSize:23,fontWeight:'900',marginTop:2}}>{value}</Text></View>
  </View>
  <Text style={{color:c.accentBright,fontSize:8,fontWeight:'800',marginTop:9}}>{sub}</Text>
 </Card>;
 return onPress?<Pressable onPress={onPress} style={({pressed})=>({flex:1,opacity:pressed?.72:1})}>{content}</Pressable>:content;
}

export default function Academy(){
 const {session,profile}=useAuth();
 const isAcademyRole = profile?.role === 'academy_admin' || profile?.role === 'academy';
 const [tab,setTab]=useState<Tab>('Dashboard');
 const router=useRouter();
 const [navOrder,setNavOrder]=useState<string[]>([...ACADEMY_NAV_DEFAULT]);
 const [academy,setAcademy]=useState<any>(null);
 const [members,setMembers]=useState<Member[]>([]);
 const [sessions,setSessions]=useState<Session[]>([]); const [activeGroupCount,setActiveGroupCount]=useState(0);
 const [groupRows,setGroupRows]=useState<any[]>([]);
 const [attendanceRows,setAttendanceRows]=useState<any[]>([]);
 const [events,setEvents]=useState<Event[]>([]);
 const [academyApprovals,setAcademyApprovals]=useState<any[]>([]);
 const [coachLinks,setCoachLinks]=useState<any[]>([]);
 const [coachSeats,setCoachSeats]=useState<any[]>([]);
 const [trainingLogs,setTrainingLogs]=useState<any[]>([]);
 const [medalRows,setMedalRows]=useState<any[]>([]);
 const [certificateRows,setCertificateRows]=useState<any[]>([]);
 const [attendance,setAttendance]=useState<number[]>(Array(7).fill(0));
 const [savedCode,setSavedCode]=useState('');
 const [code,setCode]=useState('');
 const [eventName,setEventName]=useState(''); const [eventDate,setEventDate]=useState(''); const [eventLocation,setEventLocation]=useState(''); const [eventAthlete,setEventAthlete]=useState(''); const [eventCoach,setEventCoach]=useState('');
 const [financeAccount,setFinanceAccount]=useState<any>(null); const [financeTx,setFinanceTx]=useState<any[]>([]);
 const [groupName,setGroupName]=useState(''); const [groupFocus,setGroupFocus]=useState(''); const [groupCoach,setGroupCoach]=useState(''); const [groupDays,setGroupDays]=useState('Mon,Wed,Fri'); const [groupTime,setGroupTime]=useState('17:00'); const [groupDuration,setGroupDuration]=useState('90'); const [groupAthletes,setGroupAthletes]=useState(''); const [financeType,setFinanceType]=useState<'income'|'expense'>('income'); const [financeAmount,setFinanceAmount]=useState(''); const [financeCategory,setFinanceCategory]=useState('Training fees'); const [financeDescription,setFinanceDescription]=useState('');
 const [busy,setBusy]=useState(false);
 const [refreshing,setRefreshing]=useState(false);
 const [aiQuestion,setAiQuestion]=useState('');
 const [aiAnswer,setAiAnswer]=useState('');
 const [aiBusy,setAiBusy]=useState(false);
 const [aiOpen,setAiOpen]=useState(false);
 const [aiUsed,setAiUsed]=useState(0);
 const [aiLimit,setAiLimit]=useState(1000);
 const [dataError,setDataError]=useState('');

 const load=async()=>{
  if(!profile?.academy_id)return;
  const today=new Date().toISOString().slice(0,10);
  const start=new Date(Date.now()-6*86400000).toISOString().slice(0,10);
  const monthStart=new Date(); monthStart.setDate(1);
  setDataError('');
  const [a,m,cc,usage]=await Promise.all([
   supabase.from('academies').select('id,name,city,state,country,status').eq('id',profile.academy_id).maybeSingle(),
   supabase.from('academy_memberships').select('user_id,role,status').eq('academy_id',profile.academy_id).order('created_at',{ascending:false}),
   supabase.rpc('get_my_connection_code'),
   supabase.from('subscription_usage').select('ai_requests_used,ai_requests_limit').eq('user_id',session?.user?.id||'').eq('usage_month',monthStart.toISOString().slice(0,10)).maybeSingle()
  ]);
  if(a.error||m.error){setDataError(a.error?.message||m.error?.message||'Could not load academy data.');}
  setAcademy(a.data);
  setSavedCode(cc.data?.code||'');
  const fallbackLimit=getAiLimit((profile as any)?.plan_id || (profile as any)?.plan || 'academy');
  setAiUsed(Number(usage.data?.ai_requests_used||0));
  setAiLimit(Number(usage.data?.ai_requests_limit||fallbackLimit));
  const base=(m.data||[]) as any[];
  const ids=base.map(x=>x.user_id);
  if(ids.length){
   const p=await supabase.from('profiles').select('user_id,full_name,belt,discipline,username,weight_kg,competition_weight_category').in('user_id',ids);
   const map=new Map((p.data||[]).map((x:any)=>[x.user_id,x]));
   setMembers(base.map(x=>({...x,...(map.get(x.user_id)||{})})));
  }else setMembers([]);
  const fa=await supabase.from('finance_accounts').select('id,name,currency').eq('academy_id',profile.academy_id).eq('owner_type','academy').maybeSingle();
  if(fa.data){setFinanceAccount(fa.data); const tx=await supabase.from('finance_transactions').select('id,type,amount,category,description,transaction_date').eq('account_id',fa.data.id).order('transaction_date',{ascending:false}).limit(100); setFinanceTx(tx.data||[]);} else {setFinanceAccount(null);setFinanceTx([]);}

  const activeAthleteIds=base.filter(x=>x.role==='athlete'&&x.status==='active').map(x=>x.user_id);
  const coachIds=base.filter(x=>x.role==='coach'&&x.status==='active').map(x=>x.user_id);
  const cutoff=new Date(Date.now()-90*86400000).toISOString().slice(0,10);
  const [eventResult,groupResult,linkResult,approvalResult,seatResult,trainingResult,medalResult,certificateResult]=await Promise.all([
   activeAthleteIds.length?supabase.from('tournaments').select('id,user_id,name,starts_at,location,status,result,coach_user_id,discipline,verification_status').in('user_id',activeAthleteIds).gte('starts_at',cutoff).order('starts_at',{ascending:false}).limit(100):Promise.resolve({data:[],error:null}),
   coachIds.length?supabase.from('training_groups').select('id,name,focus_area,coach_user_id,conversation_id,active,recurrence_days,start_time,duration_minutes,default_venue').in('coach_user_id',coachIds).eq('active',true).order('name'):Promise.resolve({data:[],error:null}),
   coachIds.length&&activeAthleteIds.length?supabase.from('coach_athlete_links').select('id,coach_user_id,athlete_user_id,academy_id,status,created_at').in('coach_user_id',coachIds).in('athlete_user_id',activeAthleteIds).eq('status','active'):Promise.resolve({data:[],error:null}),
   supabase.from('coach_approval_requests').select('id,athlete_user_id,coach_user_id,academy_id,request_type,current_value,requested_value,athlete_weight_kg,notes,status,created_at,reviewed_at').eq('academy_id',profile.academy_id).order('created_at',{ascending:false}).limit(100),
   supabase.from('academy_coach_seats').select('coach_user_id,seat_type,status,activation_fee,monthly_fee').eq('academy_id',profile.academy_id).order('created_at'),
   activeAthleteIds.length?supabase.from('training_sessions').select('id,user_id,title,session_date,minutes,intensity').in('user_id',activeAthleteIds).gte('session_date',cutoff).order('session_date',{ascending:false}).limit(400):Promise.resolve({data:[],error:null}),
   activeAthleteIds.length?supabase.from('medals').select('id,user_id,event_name,medal_type,category,awarded_at,result_notes,sport,discipline,verification_status').in('user_id',activeAthleteIds).order('awarded_at',{ascending:false}).limit(200):Promise.resolve({data:[],error:null}),
   activeAthleteIds.length?supabase.from('certificates').select('id,user_id,title,issued_by,issued_at,verification_status').in('user_id',activeAthleteIds).order('issued_at',{ascending:false}).limit(200):Promise.resolve({data:[],error:null})
  ]);
  setEvents((eventResult.data||[]) as Event[]);
  setGroupRows(groupResult.data||[]);
  setActiveGroupCount((groupResult.data||[]).length);
  setCoachLinks(linkResult.data||[]);
  setAcademyApprovals(approvalResult.data||[]);
  setCoachSeats(seatResult.data||[]);
  setTrainingLogs(trainingResult.data||[]);
  setMedalRows(medalResult.data||[]);
  setCertificateRows(certificateResult.data||[]);

  const groupIds=(groupResult.data||[]).map((x:any)=>x.id);
  if(groupIds.length){
   const sessionResult=await supabase.from('training_group_sessions').select('id,group_id,session_date,start_time,title,status,venue,training_type,notes').in('group_id',groupIds).gte('session_date',cutoff).order('session_date',{ascending:false}).limit(400);
   const allSessions=sessionResult.data||[];
   const attendanceResult=allSessions.length?await supabase.from('training_group_attendance').select('session_id,athlete_user_id,status,marked_at,note').in('session_id',allSessions.map((x:any)=>x.id)):({data:[],error:null} as any);
   const sessionById=new Map(allSessions.map((x:any)=>[x.id,x]));
   setAttendanceRows((attendanceResult.data||[]).map((row:any)=>({...row,group_id:sessionById.get(row.session_id)?.group_id,session_date:sessionById.get(row.session_id)?.session_date,session_title:sessionById.get(row.session_id)?.title})));
   setSessions(allSessions.filter((x:any)=>x.session_date>=today&&x.status!=='cancelled').sort((x:any,y:any)=>String(x.session_date).localeCompare(String(y.session_date))).slice(0,40) as Session[]);
   const lastSeven=allSessions.filter((x:any)=>x.session_date>=start&&x.session_date<=today);
   const marks=attendanceResult.data||[];
   setAttendance(Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));const day=d.toISOString().slice(0,10);const sessionIds=new Set(lastSeven.filter((x:any)=>x.session_date===day).map((x:any)=>x.id));return marks.filter((x:any)=>sessionIds.has(x.session_id)&&['present','late'].includes(x.status)).length}));
  }else{
   setSessions([]);setActiveGroupCount(0);setGroupRows([]);setAttendanceRows([]);setAttendance(Array(7).fill(0));
  }
 };

 useEffect(()=>{void (async()=>{try{const raw=await AsyncStorage.getItem(ACADEMY_NAV_KEY);if(raw){const p=JSON.parse(raw);if(Array.isArray(p)){const valid=p.filter((x:string)=>ACADEMY_NAV_AVAILABLE.some(a=>a.id===x));setNavOrder([...valid,...ACADEMY_NAV_DEFAULT.filter(x=>!valid.includes(x))].slice(0,6));}}}catch{}})()},[]);
 useEffect(()=>{void load()},[profile?.academy_id]);
 const refresh=async()=>{setRefreshing(true);try{await load()}finally{setRefreshing(false)}};
 useEffect(()=>{
  if(profile && !isAcademyRole){
   router.replace(profile.role === 'coach' ? '/coach' : profile.role === 'admin' || profile.role === 'super_admin' || profile.role === 'support_admin' ? '/admin' : '/(tabs)');
  }
 },[profile,isAcademyRole,router]);

 const athletes=members.filter(x=>x.role==='athlete'&&x.status==='active').length;
 const coaches=members.filter(x=>x.role==='coach'&&x.status==='active').length;
 const activeGroups=activeGroupCount;
 const maxAttendance=Math.max(1,...attendance);
 const avgAttendance=athletes?Math.min(100,Math.round((attendance.reduce((a,b)=>a+b,0)/(7*athletes))*100)):0;

 async function saveCode(){
  const value=code.trim().toUpperCase(); if(!value)return;
  setBusy(true); const {data,error}=await supabase.rpc('set_connection_code',{p_code:value}); setBusy(false);
  if(error){alert(error.message);return} setSavedCode(String(data?.code||value));setCode('');
 }
 async function setMemberStatus(userId:string,status:'active'|'suspended'){
  const target=members.find(member=>member.user_id===userId);
  if(!target||target.role==='academy_admin'||userId===session?.user?.id)return;
  setBusy(true);
  const {error}=await supabase.from('academy_memberships').update({status,updated_at:new Date().toISOString()}).eq('academy_id',profile?.academy_id).eq('user_id',userId).eq('role',target.role);
  setBusy(false);
  if(error){alert(error.message);return}
  await load();
 }

 async function createTrainingGroup(){ const name=groupName.trim(); const coachText=groupCoach.trim(); if(!name||!coachText)return alert('Enter a group name and coach username.'); const coach=members.find(m=>m.role==='coach'&&m.status==='active'&&(m.user_id===coachText||m.username?.toLowerCase()===coachText.toLowerCase()||m.full_name?.toLowerCase()===coachText.toLowerCase())); if(!coach)return alert('Choose an active academy coach.'); const days=groupDays.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean); const valid=['sun','mon','tue','wed','thu','fri','sat']; if(!days.length||days.some(d=>!valid.includes(d)))return alert('Days must be comma-separated, for example Mon,Wed,Fri.'); if(!/^\d{2}:\d{2}$/.test(groupTime.trim()))return alert('Start time must use HH:MM.'); const duration=Number(groupDuration); if(!Number.isFinite(duration)||duration<15)return alert('Duration must be at least 15 minutes.'); const selected=groupAthletes.trim()?groupAthletes.split(',').map(x=>x.trim()).filter(Boolean):[]; const ids=selected.map(value=>members.find(m=>m.role==='athlete'&&m.status==='active'&&(m.user_id===value||m.username?.toLowerCase()===value.toLowerCase()||m.full_name?.toLowerCase()===value.toLowerCase()))?.user_id).filter(Boolean) as string[]; if(ids.length!==selected.length)return alert('One or more athletes could not be found in this academy.'); setBusy(true); const {error}=await supabase.rpc('academy_create_training_group',{p_name:name,p_focus:groupFocus.trim(),p_recurrence_days:days,p_start_time:groupTime.trim(),p_duration_minutes:duration,p_coach_user_id:coach.user_id,p_athlete_ids:ids}); setBusy(false); if(error){alert(error.message);return} setGroupName('');setGroupFocus('');setGroupCoach('');setGroupAthletes('');await load(); }
 async function reviewAcademyApproval(requestId:string,status:'approved'|'rejected'){
  const request=academyApprovals.find((x:any)=>x.id===requestId);
  if(!request||request.coach_user_id!==session?.user?.id){alert('Only the assigned Coach can review this request.');return;}
  setBusy(true);
  const {error}=await supabase.rpc('review_coach_approval',{p_request_id:requestId,p_status:status,p_notes:null});
  setBusy(false);
  if(error){alert(error.message);return;}
  await load();
 }

 async function createFinanceAccount(){
  if(financeAccount||!profile?.academy_id)return; setBusy(true); const {data,error}=await supabase.from('finance_accounts').insert({owner_user_id:session?.user?.id,academy_id:profile.academy_id,owner_type:'academy',name:(academy?.name||'AthleteN Academy')+' Finance',currency:'INR'}).select('id,name,currency').single(); setBusy(false); if(error){alert(error.message);return} setFinanceAccount(data); setFinanceTx([]);
 }
 async function addFinanceTransaction(){
  if(!financeAccount)return; const amount=Number(financeAmount); if(!Number.isFinite(amount)||amount<=0||!financeCategory.trim())return alert('Enter a valid amount and category.'); setBusy(true); const {error}=await supabase.from('finance_transactions').insert({account_id:financeAccount.id,user_id:session?.user?.id,type:financeType,amount,category:financeCategory.trim(),description:financeDescription.trim()||null}); setBusy(false); if(error){alert(error.message);return} setFinanceAmount('');setFinanceDescription(''); await load();
 }
 async function createEvent(){
  if(!eventName.trim()||!eventDate.trim()||!eventAthlete.trim())return alert('Enter competition name, date and athlete account code/username.');
  const athlete=members.find(m=>m.status==='active'&&(m.user_id===eventAthlete.trim()||m.username?.toLowerCase()===eventAthlete.trim().toLowerCase()||m.full_name?.toLowerCase()===eventAthlete.trim().toLowerCase())); if(!athlete||athlete.role!=='athlete')return alert('Choose an active academy athlete.');
  const coach=eventCoach.trim()?members.find(m=>m.role==='coach'&&(m.user_id===eventCoach.trim()||m.username?.toLowerCase()===eventCoach.trim().toLowerCase()||m.full_name?.toLowerCase()===eventCoach.trim().toLowerCase())):undefined; if(eventCoach.trim()&&!coach)return alert('Choose an active academy coach.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(eventDate.trim()))return alert('Date must use YYYY-MM-DD.');
  setBusy(true); const {error}=await supabase.rpc('academy_create_tournament',{p_name:eventName.trim(),p_starts_at:eventDate.trim(),p_location:eventLocation.trim(),p_athlete_user_id:athlete.user_id,p_discipline:athlete.discipline||null,p_coach_user_id:coach?.user_id||null}); setBusy(false); if(error){alert(error.message);return} setEventName('');setEventDate('');setEventLocation('');setEventAthlete('');setEventCoach('');await load();
 }
 async function askAI(prompt?:string){
  const q=(prompt||aiQuestion).trim();if(!q||!session)return;
  if(aiUsed>=aiLimit){setAiAnswer('You have reached this month’s Academy AI limit. Your allowance resets at the start of next month.');setAiOpen(true);return;}
  setAiBusy(true);setAiAnswer('');
  const {data:reservation,error:reserveError}=await supabase.rpc('reserve_ai_usage',{p_user_id:session.user.id,p_plan_id:(profile as any)?.plan_id || (profile as any)?.plan || 'academy',p_topic:'Academy AI',p_monthly_limit:aiLimit});
  if(reserveError||!reservation){setAiBusy(false);setAiAnswer('AI limit reached or your Academy AI entitlement is not active.');setAiOpen(true);return;}
  setAiUsed(v=>v+1);setAiOpen(true);
  const context='Academy: '+(academy?.name||'AthleteN Academy')+'; active athletes: '+athletes+'; active coaches: '+coaches+'; active training groups: '+activeGroups+'; upcoming competitions: '+events.length+'; average attendance last 7 days: '+avgAttendance+'%.';
  try{
   const response=await fetch('https://athleten.netlify.app/.netlify/functions/ai-coach',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({topic:'Performance Reports',prompt:context+'\nAcademy admin question: '+q})});
   const data=await response.json().catch(()=>({}));
   setAiAnswer(response.ok?String(data.answer||'No response returned.'):String(data.error||'AI Coach is unavailable right now.'));
  }catch(e){ await supabase.rpc('cancel_ai_usage',{p_usage_id:reservation,p_user_id:session.user.id}); setAiUsed(v=>Math.max(0,v-1)); setAiAnswer('AI Coach connection failed. Your AI message was returned. Please try again.'); }
  setAiBusy(false);setAiQuestion('');
 }

 const quick=(next:Tab)=>setTab(next);
 const activeAthletes=members.filter((m:any)=>m.role==='athlete'&&m.status==='active');
 const activeCoaches=members.filter((m:any)=>m.role==='coach'&&m.status==='active');
 const pendingAcademyApprovals=academyApprovals.filter((r:any)=>r.status==='pending');
 const markedAttendance=attendanceRows.filter((r:any)=>['present','late','absent','excused'].includes(r.status));
 const presentAttendance=markedAttendance.filter((r:any)=>r.status==='present'||r.status==='late');
 const academyAttendanceRate=markedAttendance.length?Math.round(presentAttendance.length/markedAttendance.length*100):0;
 const totalTrainingMinutes=trainingLogs.reduce((n:number,x:any)=>n+Number(x.minutes||0),0);
 const athleteName=(id:string)=>members.find((m:any)=>m.user_id===id)?.full_name||members.find((m:any)=>m.user_id===id)?.username||'Athlete';
 const coachName=(id:string)=>members.find((m:any)=>m.user_id===id)?.full_name||members.find((m:any)=>m.user_id===id)?.username||'Coach';
 const recentCalendar=[
  ...sessions.map((x:any)=>({...x,calendarKind:'Training'})),
  ...events.map((x:any)=>({...x,calendarKind:'Competition',session_date:String(x.starts_at||'').slice(0,10),start_time:''}))
 ].filter((x:any)=>x.session_date).sort((a:any,b:any)=>String(a.session_date).localeCompare(String(b.session_date)));
 const remaining=Math.max(0,aiLimit-aiUsed);
 const aiPanel=<View style={{gap:11}}>
  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><View><Text style={{color:c.accentBright,fontSize:8,fontWeight:'900',letterSpacing:1.2}}>ATHLETEN AI</Text><Text style={{color:c.text,fontSize:20,fontWeight:'900',marginTop:3}}>Academy AI</Text></View><Pressable onPress={()=>setAiOpen(false)} style={{width:36,height:36,borderRadius:12,backgroundColor:c.surface,alignItems:'center',justifyContent:'center'}}><Text style={{color:c.muted,fontSize:20}}>×</Text></Pressable></View>
  <View style={{backgroundColor:c.accentSoft,borderWidth:1,borderColor:c.accentDeep,borderRadius:14,padding:12}}><Text style={{color:c.accentBright,fontSize:10,fontWeight:'900'}}>{remaining.toLocaleString('en-IN')} / {aiLimit.toLocaleString('en-IN')} AI messages remaining</Text><View style={{height:6,borderRadius:4,backgroundColor:c.background,marginTop:8,overflow:'hidden'}}><View style={{height:6,width:((aiLimit?Math.min(100,(aiUsed/aiLimit)*100):100)+'%') as any,backgroundColor:c.accent}}/></View><Text style={{color:c.muted,fontSize:8,marginTop:6}}>Usage is enforced by the server for your Academy plan.</Text></View>
  <Text style={{color:c.muted,fontSize:10,lineHeight:16}}>Ask about athletes, coaches, training, attendance, competitions, or academy operations.</Text>
  <View style={{flexDirection:'row',gap:7}}>{['Academy status?','Attendance trend?','Competition prep?'].map(x=><Pressable key={x} onPress={()=>void askAI(x)} style={{flex:1,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:11,padding:9}}><Text style={{color:c.text,fontSize:8,fontWeight:'800'}}>{x}</Text></Pressable>)}</View>
  <View style={{backgroundColor:c.background,borderWidth:1,borderColor:c.border,borderRadius:13,flexDirection:'row',alignItems:'center'}}><TextInput value={aiQuestion} onChangeText={setAiQuestion} onSubmitEditing={()=>void askAI()} placeholder="Ask AthleteN AI…" placeholderTextColor={c.muted} style={{flex:1,color:c.text,paddingHorizontal:12,paddingVertical:12,fontSize:11}}/><Pressable onPress={()=>void askAI()} disabled={aiBusy||remaining<=0} style={{width:45,height:42,marginRight:4,borderRadius:10,backgroundColor:remaining>0?c.accent:c.border,alignItems:'center',justifyContent:'center'}}>{aiBusy?<ActivityIndicator color="#fff"/>:<Icon name="chevron" size={18} color="#fff"/>}</Pressable></View>
  {aiAnswer?<View style={{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:13,padding:12}}><Text style={{color:c.accentBright,fontSize:8,fontWeight:'900',letterSpacing:1}}>ATHLETEN AI</Text><Text style={{color:c.text,fontSize:10,lineHeight:17,marginTop:5}}>{aiAnswer}</Text></View>:null}
 </View>;
 const bottomBar=<View style={{position:'absolute',left:10,right:10,bottom:10,backgroundColor:'#0B1019',borderWidth:1,borderColor:c.borderStrong,borderRadius:22,padding:7,shadowOpacity:.35,shadowRadius:14,elevation:12}}><View style={{flexDirection:'row',alignItems:'center',gap:5}}>{navOrder.map(id=>{const meta=ACADEMY_NAV_AVAILABLE.find(x=>x.id===id)!;const active=id===tab;return <Pressable key={id} onPress={()=>id==='AI'?setAiOpen(true):setTab(id as Tab)} style={{flex:1,alignItems:'center',justifyContent:'center',paddingVertical:8,borderRadius:15,backgroundColor:active?c.accent:'transparent'}}><Icon name={meta.icon} size={17} color={active?'#fff':c.muted}/><Text style={{color:active?'#fff':c.muted,fontSize:7,fontWeight:'900',marginTop:3}}>{meta.label}</Text></Pressable>})}</View></View>;

 return <Screen bottomBar={bottomBar}>

  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
   <View><Text style={{color:c.accentBright,fontSize:8,fontWeight:'900',letterSpacing:1.5}}>ATHLETEN ACADEMY</Text><Text style={{color:c.text,fontSize:25,fontWeight:'900',marginTop:3}}>{academy?.name||'Academy'}</Text></View>
   <View style={{flexDirection:'row',alignItems:'center',gap:8}}><RefreshButton onPress={()=>void refresh()} busy={refreshing}/>
     <Pressable onPress={()=>router.push('/academy-settings')} style={{width:40,height:40,borderRadius:13,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'}}><Icon name="settings" size={18}/></Pressable>
    </View>
  </View>


  {dataError?<Card style={{borderColor:'#8b3a45'}}><Text style={{color:'#ff8f9f',fontSize:10,fontWeight:'900'}}>DATA ERROR</Text><Text style={{color:c.text,fontSize:9,marginTop:4}}>{dataError}</Text><Button title="RETRY" onPress={()=>void load()} secondary/></Card>:null}

  {tab==='Dashboard'?<>
   <View style={{marginTop:4,marginBottom:12}}><Text style={{color:c.muted,fontSize:10}}>ACADEMY CONTROL CENTER</Text><Text style={{color:c.text,fontSize:27,fontWeight:'900',marginTop:3}}>Run your academy.</Text><Text style={{color:c.muted,fontSize:11,marginTop:3}}>People, training, competitions, finance and AI in one place.</Text></View>

   <View style={{flexDirection:'row',flexWrap:'wrap',gap:9}}>
    <Stat icon="athletes" label="Athletes" value={athletes} sub="Active members" accent="#2186ff" onPress={()=>setTab("People")}/>
    <Stat icon="coaches" label="Coaches" value={coaches} sub="Active coaches" accent="#1bb6c9" onPress={()=>setTab("People")}/>
    <Stat icon="training" label="Training" value={activeGroups} sub="Active groups" accent="#8a5cff" onPress={()=>setTab("Training")}/>
    <Stat icon="events" label="Competitions" value={events.length} sub="Upcoming events" accent="#ff9b2f" onPress={()=>setTab("Events")}/>
   </View>

   <Card style={{marginTop:2,padding:17,backgroundColor:'#061A2B',borderColor:'#164B73'}}>
    <Text style={{color:c.accentBright,fontSize:8,fontWeight:'900',letterSpacing:1.3}}>ACADEMY OVERVIEW</Text>
    <Text style={{color:c.text,fontSize:22,fontWeight:'900',marginTop:6}}>{academy?.name||'AthleteN Academy'}</Text>
    <Text style={{color:c.muted,fontSize:10,marginTop:3}}>{[academy?.city,academy?.state,academy?.country].filter(Boolean).join(' · ')||'Location not set'}</Text>
    <View style={{flexDirection:'row',gap:8,marginTop:14}}>
     <View style={{flex:1,backgroundColor:c.background,borderRadius:12,padding:11}}><Text style={{color:c.muted,fontSize:7}}>DISCIPLINES</Text><Text style={{color:c.text,fontSize:10,fontWeight:'900',marginTop:4}}>Kyorugi · Poomsae</Text></View>
     <View style={{flex:1,backgroundColor:c.background,borderRadius:12,padding:11}}><Text style={{color:c.muted,fontSize:7}}>STATUS</Text><Text style={{color:c.accentBright,fontSize:10,fontWeight:'900',marginTop:4}}>ACTIVE</Text></View>
    </View>
   </Card>

   <Card style={{marginTop:2,padding:17,borderColor:'#345E8B'}}>
    <View style={{flexDirection:'row',alignItems:'center',gap:10}}><View style={{width:42,height:42,borderRadius:14,backgroundColor:c.accentSoft,alignItems:'center',justifyContent:'center'}}><Icon name="ai" size={22}/></View><View style={{flex:1}}><Text style={{color:c.accentBright,fontSize:8,fontWeight:'900',letterSpacing:1.2}}>ATHLETEN AI FOR ACADEMY</Text><Text style={{color:c.text,fontSize:18,fontWeight:'900',marginTop:3}}>Ask about your academy.</Text></View></View>
    <Text style={{color:c.muted,fontSize:10,lineHeight:16,marginTop:10}}>Ask about athletes, coaches, training load, attendance or upcoming competitions.</Text>
    <View style={{flexDirection:'row',gap:7,marginTop:11}}>
     {['Academy status?','Attendance trend?','Competition prep?'].map(x=><Pressable key={x} onPress={()=>void askAI(x)} style={{flex:1,backgroundColor:c.background,borderWidth:1,borderColor:c.border,borderRadius:11,padding:9}}><Text style={{color:c.text,fontSize:8,fontWeight:'800'}}>{x}</Text></Pressable>)}
    </View>
    <View style={{marginTop:10,backgroundColor:c.background,borderWidth:1,borderColor:c.border,borderRadius:13,flexDirection:'row',alignItems:'center'}}>
     <TextInput value={aiQuestion} onChangeText={setAiQuestion} onSubmitEditing={()=>void askAI()} placeholder="Ask AthleteN AI…" placeholderTextColor={c.muted} style={{flex:1,color:c.text,paddingHorizontal:12,paddingVertical:12,fontSize:11}}/>
     <Pressable onPress={()=>void askAI()} disabled={aiBusy} style={{width:45,height:42,marginRight:4,borderRadius:10,backgroundColor:c.accent,alignItems:'center',justifyContent:'center'}}>{aiBusy?<ActivityIndicator color="#fff"/>:<Icon name="chevron" size={18} color="#fff"/>}</Pressable>
    </View>
    {aiAnswer?<View style={{marginTop:10,backgroundColor:c.accentSoft,borderWidth:1,borderColor:c.accentDeep,borderRadius:13,padding:12}}><Text style={{color:c.accentBright,fontSize:8,fontWeight:'900',letterSpacing:1}}>AI COACH</Text><Text style={{color:c.text,fontSize:10,lineHeight:17,marginTop:5}}>{aiAnswer}</Text></View>:null}
   </Card>

   <View style={{marginTop:2}}><Text style={{color:c.text,fontSize:14,fontWeight:'900',marginBottom:8}}>Upcoming Schedule</Text>{sessions.length?sessions.slice(0,4).map(s=><Card key={s.id} style={{padding:12,marginBottom:7}}><View style={{flexDirection:'row',alignItems:'center',gap:11}}><View style={{width:45,alignItems:'center'}}><Text style={{color:c.accentBright,fontSize:10,fontWeight:'900'}}>{new Date(s.session_date).toLocaleDateString('en-IN',{day:'2-digit'})}</Text><Text style={{color:c.muted,fontSize:7}}>{new Date(s.session_date).toLocaleDateString('en-IN',{month:'short'}).toUpperCase()}</Text></View><View style={{flex:1}}><Text style={{color:c.text,fontWeight:'900',fontSize:11}}>{s.title}</Text><Text style={{color:c.muted,fontSize:9,marginTop:3}}>{s.start_time?.slice(0,5)} · Training session</Text></View><Icon name="chevron" size={15} color={c.muted}/></View></Card>):<Card><Text style={{color:c.text,fontWeight:'900'}}>No upcoming training</Text><Text style={{color:c.muted,fontSize:10,marginTop:4}}>Connect a coach to see academy training here.</Text></Card>}</View>

   <View><Text style={{color:c.text,fontSize:14,fontWeight:'900',marginBottom:8}}>Attendance · Last 7 Days</Text><Card><View style={{flexDirection:'row',alignItems:'center',gap:8}}><View style={{width:34,height:34,borderRadius:11,backgroundColor:c.accentSoft,alignItems:'center',justifyContent:'center'}}><Icon name="calendar" size={17}/></View><View><Text style={{color:c.text,fontSize:11,fontWeight:'900'}}>Attendance trend</Text><Text style={{color:c.muted,fontSize:8,marginTop:2}}>Present + late sessions</Text></View></View><LineGraph values={attendance} labels={['M','T','W','T','F','S','S']} /><View style={{flexDirection:'row',justifyContent:'space-between',marginTop:5}}><Text style={{color:c.muted,fontSize:9}}>Average attendance</Text><Text style={{color:c.accentBright,fontSize:16,fontWeight:'900'}}>{avgAttendance}%</Text></View></Card></View>

   <View><Text style={{color:c.text,fontSize:14,fontWeight:'900',marginBottom:8}}>Quick Actions</Text><View style={{gap:7}}>
    {[
     ['athletes','Manage Athletes','People'],['coaches','Manage Coaches','People'],['training','Manage Training Groups','Training'],['events','Manage Competitions','Events'],['finance','Open Finance','Finance']
    ].map(([icon,title,dest])=><Pressable key={title} onPress={()=>quick(dest as Tab)} style={{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:14,padding:13,flexDirection:'row',alignItems:'center',gap:11}}><Icon name={icon} size={18}/><Text style={{color:c.text,fontSize:11,fontWeight:'900',flex:1}}>{title}</Text><Icon name="chevron" size={15} color={c.muted}/></Pressable>)}
   </View></View>

   <Card accent style={{marginTop:2}}>
    <View style={{flexDirection:'row',alignItems:'center',gap:10}}><View style={{width:40,height:40,borderRadius:12,backgroundColor:'#ffffff14',alignItems:'center',justifyContent:'center'}}><Icon name="code" size={20}/></View><View style={{flex:1}}><Text style={{color:c.text,fontSize:14,fontWeight:'900'}}>Academy Connection Code</Text><Text style={{color:c.muted,fontSize:9,marginTop:3}}>Athletes can join by entering this code.</Text></View></View>
    <Text style={{color:c.accentBright,fontSize:24,fontWeight:'900',marginTop:8}}>{savedCode||'NOT SET'}</Text>
    <Field label="NEW CODE" value={code} onChangeText={v=>setCode(v.toUpperCase())} autoCapitalize="characters" autoCorrect={false} maxLength={30} placeholder="ATN-ACADEMY-01"/>
    <Button title="SAVE ACADEMY CODE" onPress={()=>void saveCode()} busy={busy}/>
   </Card>
  </>:null}

  {tab==='People'?<View style={{gap:10}}>
   <Text style={{color:c.text,fontSize:23,fontWeight:'900'}}>People</Text>
   <Text style={{color:c.muted,fontSize:10}}>Manage academy athletes and coaches. Tap an athlete to open their complete performance record.</Text>
   <Card><Text style={{color:c.text,fontSize:14,fontWeight:'900'}}>Invite coaches with your academy code</Text><Text style={{color:c.muted,fontSize:10,marginTop:5}}>Share this code with a coach. They join the academy from their own Coach Profile by entering the code. This prevents an academy from linking a coach without that coach's action.</Text><Text selectable style={{color:c.accentBright,fontSize:20,fontWeight:'900',marginTop:10}}>{savedCode||'ACADEMY CODE NOT SET'}</Text></Card>
   {members.length?members.map(m=><Card key={m.user_id} style={{padding:13}}><View style={{flexDirection:'row',alignItems:'center',gap:10}}>
    <Pressable disabled={m.role!=='athlete'} onPress={()=>router.push({pathname:'/academy-athlete-detail',params:{athleteId:m.user_id}})} style={{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:10}}>
     <View style={{width:40,height:40,borderRadius:12,backgroundColor:c.accentSoft,alignItems:'center',justifyContent:'center'}}><Icon name={m.role==='coach'?'coaches':'athletes'} size={18}/></View>
     <View style={{flex:1,minWidth:0}}><Text style={{color:c.text,fontSize:12,fontWeight:'900'}}>{m.full_name||m.username||'Member'}</Text><Text style={{color:c.muted,fontSize:9,marginTop:3}}>{m.role.toUpperCase()} · {m.status.toUpperCase()} · {m.discipline||'Taekwondo'}{m.belt?' · '+m.belt:''}</Text>{m.role==='athlete'?<Text style={{color:c.accentBright,fontSize:8,fontWeight:'900',marginTop:4}}>{m.weight_kg?Number(m.weight_kg).toFixed(1)+' kg':'Weight not set'} · {m.competition_weight_category||'Category not set'} · VIEW PROFILE ›</Text>:null}</View>
     {m.role==='athlete'?<Icon name="arrow" size={17} color={c.accentBright}/>:null}
    </Pressable>
    {m.role==='academy_admin'?<Text style={{color:c.muted,fontSize:7,fontWeight:'900'}}>ADMIN</Text>:m.status==='active'||m.status==='suspended'?<Pressable disabled={busy} onPress={()=>void setMemberStatus(m.user_id,m.status==='active'?'suspended':'active')} style={{borderWidth:1,borderColor:m.status==='active'?'#8b3a45':c.accent,borderRadius:9,paddingHorizontal:8,paddingVertical:6}}><Text style={{color:m.status==='active'?'#ff8f9f':c.accentBright,fontSize:7,fontWeight:'900'}}>{m.status==='active'?'SUSPEND':'REACTIVATE'}</Text></Pressable>:null}
   </View></Card>):<Card><Text style={{color:c.text,fontWeight:'900'}}>No connected people yet</Text><Text style={{color:c.muted,fontSize:10,marginTop:4}}>Share the academy code so coaches and athletes can join from their own accounts.</Text></Card>}
  </View>:null}

  {tab==='Training'?<View style={{gap:9}}><Text style={{color:c.text,fontSize:23,fontWeight:'900'}}>Training</Text><Text style={{color:c.muted,fontSize:10}}>Create academy groups, assign coaches and athletes, and manage the generated schedule.</Text><Card style={{paddingBottom:92}}><Text style={{color:c.text,fontSize:14,fontWeight:'900'}}>Create training group</Text><Field label="GROUP NAME" value={groupName} onChangeText={setGroupName} placeholder="Elite Kyorugi"/><Field label="FOCUS" value={groupFocus} onChangeText={setGroupFocus} placeholder="Kyorugi conditioning"/><Field label="COACH USERNAME / NAME" value={groupCoach} onChangeText={setGroupCoach} placeholder="coach_username"/><Field label="ATHLETES (COMMA-SEPARATED, OPTIONAL)" value={groupAthletes} onChangeText={setGroupAthletes} placeholder="athlete1, athlete2"/><Field label="DAYS" value={groupDays} onChangeText={setGroupDays} placeholder="Mon,Wed,Fri"/><Field label="START TIME (HH:MM)" value={groupTime} onChangeText={setGroupTime} placeholder="17:00"/><Field label="DURATION (MINUTES)" value={groupDuration} onChangeText={setGroupDuration} keyboardType="number-pad" placeholder="90"/><Button title="CREATE TRAINING GROUP" onPress={()=>void createTrainingGroup()} busy={busy}/></Card>{sessions.length?sessions.map(s=><Card key={s.id}><Text style={{color:c.text,fontWeight:'900'}}>{s.title}</Text><Text style={{color:c.muted,fontSize:9,marginTop:4}}>{new Date(s.session_date).toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'})} · {s.start_time?.slice(0,5)}</Text></Card>):<Card><Text style={{color:c.text,fontWeight:'900'}}>No sessions yet</Text><Text style={{color:c.muted,fontSize:10,marginTop:4}}>Create a group above to generate the academy schedule.</Text></Card>}</View>:null}

  {tab==='Events'?<View style={{gap:9}}><Text style={{color:c.text,fontSize:23,fontWeight:'900'}}>Competitions</Text><Text style={{color:c.muted,fontSize:10}}>Create and view academy competitions.</Text><Card><Text style={{color:c.text,fontSize:14,fontWeight:'900'}}>Create competition</Text><Field label="NAME" value={eventName} onChangeText={setEventName} placeholder="Delhi Open 2026"/><Field label="DATE (YYYY-MM-DD)" value={eventDate} onChangeText={setEventDate} placeholder="2026-10-25" autoCorrect={false}/><Field label="LOCATION" value={eventLocation} onChangeText={setEventLocation} placeholder="Noida"/><Field label="ATHLETE USERNAME / NAME" value={eventAthlete} onChangeText={setEventAthlete} placeholder="Select an academy athlete"/><Field label="COACH USERNAME (OPTIONAL)" value={eventCoach} onChangeText={setEventCoach} placeholder="Coach username"/><Button title="CREATE COMPETITION" onPress={()=>void createEvent()} busy={busy}/></Card>{events.length?events.map(e=><Card key={e.id}><View style={{flexDirection:'row',gap:10,alignItems:'center'}}><View style={{width:40,height:40,borderRadius:12,backgroundColor:'#ff9b2f20',alignItems:'center',justifyContent:'center'}}><Icon name="events" size={18} color="#ff9b2f"/></View><View style={{flex:1}}><Text style={{color:c.text,fontWeight:'900'}}>{e.name}</Text><Text style={{color:c.muted,fontSize:9,marginTop:4}}>{new Date(e.starts_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})} · {e.location||'Location TBD'}</Text></View></View></Card>):<Card><Text style={{color:c.text,fontWeight:'900'}}>No upcoming competitions</Text></Card>}</View>:null}


  {tab==='Coaches'?<View style={{gap:10}}>
   <Text style={{color:c.text,fontSize:23,fontWeight:'900'}}>Coach Management Centre</Text>
   <Text style={{color:c.muted,fontSize:10,lineHeight:16}}>Academy-wide coach roster, allocated athlete links, training groups and seat usage. Athletes connect through their own account; this panel does not silently transfer an athlete.</Text>
   <View style={{flexDirection:'row',gap:8}}><Stat icon="coaches" label="Active coaches" value={activeCoaches.length} sub="Academy staff"/><Stat icon="people" label="Coach links" value={coachLinks.length} sub="Active athlete relationships"/></View>
   {activeCoaches.length?activeCoaches.map((coach:any)=>{
    const links=coachLinks.filter((x:any)=>x.coach_user_id===coach.user_id);
    const groups=groupRows.filter((x:any)=>x.coach_user_id===coach.user_id);
    const seat=coachSeats.find((x:any)=>x.coach_user_id===coach.user_id&&x.status==='active');
    return <Card key={coach.user_id} style={{padding:14}}>
     <View style={{flexDirection:'row',alignItems:'center',gap:10}}>
      <View style={{width:40,height:40,borderRadius:12,backgroundColor:c.accentSoft,alignItems:'center',justifyContent:'center'}}><Icon name="coaches" size={18}/></View>
      <View style={{flex:1}}><Text style={{color:c.text,fontSize:12,fontWeight:'900'}}>{coach.full_name||coach.username||'Coach'}</Text><Text style={{color:c.muted,fontSize:9,marginTop:3}}>{coach.username?'@'+coach.username+' · ':''}{coach.discipline||'Taekwondo'} · {seat?.seat_type==='included'?'Included seat':seat?.seat_type==='paid'?'Paid seat':'Seat status unavailable'}</Text></View>
      <Text style={{color:c.accentBright,fontSize:9,fontWeight:'900'}}>{coach.status.toUpperCase()}</Text>
     </View>
     <View style={{flexDirection:'row',gap:8,marginTop:12}}>
      <View style={{flex:1,backgroundColor:c.background,borderRadius:10,padding:10}}><Text style={{color:c.muted,fontSize:8}}>LINKED ATHLETES</Text><Text style={{color:c.text,fontSize:18,fontWeight:'900',marginTop:3}}>{links.length}</Text></View>
      <View style={{flex:1,backgroundColor:c.background,borderRadius:10,padding:10}}><Text style={{color:c.muted,fontSize:8}}>TRAINING GROUPS</Text><Text style={{color:c.text,fontSize:18,fontWeight:'900',marginTop:3}}>{groups.length}</Text></View>
     </View>
     {groups.map((g:any)=><Text key={g.id} style={{color:c.muted,fontSize:9,marginTop:7}}>{g.name} · {g.focus_area||'General training'} · {g.recurrence_days?.join?.(', ')||'Schedule set'}</Text>)}
     <Pressable onPress={()=>setTab('People')} style={{alignSelf:'flex-start',marginTop:9}}><Text style={{color:c.accentBright,fontSize:9,fontWeight:'900'}}>OPEN ACADEMY ROSTER ›</Text></Pressable>
    </Card>;
   }):<Card><Text style={{color:c.text,fontWeight:'900'}}>No active coaches yet</Text><Text style={{color:c.muted,fontSize:10,marginTop:4}}>Invite coaches using the Academy connection code. Each Coach must join from their own account.</Text></Card>}
   <Card><Text style={{color:c.text,fontSize:12,fontWeight:'900'}}>Coach permissions</Text><Text style={{color:c.muted,fontSize:9,lineHeight:15,marginTop:5}}>Coaches manage their own linked athlete relationships, training sessions, attendance and approval decisions. Academy Admins manage the organization and can review cross-coach performance, but cannot approve another Coach’s pending athlete decisions.</Text></Card>
  </View>:null}

  {tab==='Attendance'?<View style={{gap:10}}>
   <Text style={{color:c.text,fontSize:23,fontWeight:'900'}}>Academy Attendance</Text>
   <Text style={{color:c.muted,fontSize:10}}>Read-only academy-wide attendance. Coaches record attendance in their assigned training groups.</Text>
   <View style={{flexDirection:'row',gap:8}}>
    <Stat icon="calendar" label="Attendance rate" value={academyAttendanceRate+'%'} sub="Present + late / marked"/>
    <Stat icon="people" label="Marked records" value={markedAttendance.length} sub="All visible sessions"/>
   </View>
   <View style={{flexDirection:'row',gap:8}}>
    <Stat icon="calendar" label="Present / late" value={presentAttendance.length} sub="Recorded attendance"/>
    <Stat icon="calendar" label="Absent" value={markedAttendance.filter((x:any)=>x.status==='absent').length} sub="Coach-recorded absence"/>
   </View>
   {groupRows.map((g:any)=>{
    return null;
   })}
   {attendanceRows.length?attendanceRows.slice().sort((a:any,b:any)=>String(b.marked_at||'').localeCompare(String(a.marked_at||''))).slice(0,50).map((row:any)=>{
    const linkedGroup=groupRows.find((g:any)=>g.id===row.group_id);
    return <View key={row.session_id+'-'+row.athlete_user_id} style={{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:12,padding:12}}>
     <View style={{flexDirection:'row',alignItems:'center',gap:8}}><View style={{flex:1}}><Text style={{color:c.text,fontSize:10,fontWeight:'900'}}>{athleteName(row.athlete_user_id)}</Text><Text style={{color:c.muted,fontSize:8,marginTop:3}}>{linkedGroup?.name||row.session_title||'Academy training'} · {row.session_date?new Date(row.session_date+'T12:00:00').toLocaleDateString('en-IN'):row.marked_at?new Date(row.marked_at).toLocaleDateString('en-IN'):'Attendance record'}</Text></View><Text style={{color:row.status==='present'?c.success:row.status==='late'?c.warning:row.status==='absent'?c.danger:c.muted,fontSize:9,fontWeight:'900'}}>{String(row.status).toUpperCase()}</Text></View>
    </View>;
   }):<Card><Text style={{color:c.text,fontWeight:'900'}}>No attendance records yet</Text><Text style={{color:c.muted,fontSize:10,marginTop:4}}>Once coaches mark sessions, Academy attendance history and summaries appear here.</Text></Card>}
  </View>:null}

  {tab==='Calendar'?<View style={{gap:10}}>
   <Text style={{color:c.text,fontSize:23,fontWeight:'900'}}>Academy Calendar</Text>
   <Text style={{color:c.muted,fontSize:10}}>Upcoming group sessions and registered competitions across active Academy athletes.</Text>
   {recentCalendar.length?recentCalendar.slice(0,80).map((row:any)=><Card key={row.calendarKind+'-'+row.id} style={{padding:12}}>
    <View style={{flexDirection:'row',alignItems:'center',gap:10}}>
     <View style={{width:42,height:42,borderRadius:12,backgroundColor:row.calendarKind==='Competition'?'#ff9b2f20':c.accentSoft,alignItems:'center',justifyContent:'center'}}><Icon name={row.calendarKind==='Competition'?'events':'calendar'} size={18}/></View>
     <View style={{flex:1}}><Text style={{color:c.text,fontWeight:'900',fontSize:11}}>{row.title||row.name}</Text><Text style={{color:c.muted,fontSize:9,marginTop:3}}>{new Date(row.session_date+'T12:00:00').toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short',year:'numeric'})}{row.start_time?' · '+String(row.start_time).slice(0,5):''} · {row.calendarKind}</Text><Text style={{color:c.muted,fontSize:8,marginTop:2}}>{row.calendarKind==='Competition'?row.location||'Location TBD':row.venue||row.focus_area||'Group training'}</Text></View>
    </View>
   </Card>):<Card><Text style={{color:c.text,fontWeight:'900'}}>No scheduled activities yet</Text></Card>}
  </View>:null}

  {tab==='Intelligence'?<View style={{gap:10}}>
   <Text style={{color:c.text,fontSize:23,fontWeight:'900'}}>Academy Intelligence</Text>
   <Text style={{color:c.muted,fontSize:10,lineHeight:16}}>Operational indicators from saved Academy records. These are summaries, not performance predictions or health assessments.</Text>
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
    <Stat icon="athletes" label="Athletes" value={activeAthletes.length} sub="Active members"/>
    <Stat icon="coaches" label="Coaches" value={activeCoaches.length} sub="Active coaches"/>
    <Stat icon="training" label="Training logs" value={trainingLogs.length} sub="Last 90 days"/>
    <Stat icon="calendar" label="Attendance" value={academyAttendanceRate+'%'} sub="Marked sessions"/>
    <Stat icon="events" label="Competitions" value={events.length} sub="Recent and upcoming"/>
    <Stat icon="trophy" label="Medals" value={medalRows.length} sub="Saved results"/>
   </View>
   <Card><Text style={{color:c.text,fontWeight:'900',fontSize:12}}>Training activity · Last 90 days</Text><Text style={{color:c.accentBright,fontSize:23,fontWeight:'900',marginTop:5}}>{Math.round(totalTrainingMinutes/60*10)/10} hours</Text><Text style={{color:c.muted,fontSize:9,marginTop:3}}>Total minutes recorded by active Academy athletes. No extra activity is required to improve this number.</Text></Card>
   <Card><Text style={{color:c.text,fontWeight:'900',fontSize:12}}>Coach workload</Text>{activeCoaches.map((coach:any)=><View key={coach.user_id} style={{flexDirection:'row',justifyContent:'space-between',paddingVertical:8,borderBottomWidth:1,borderBottomColor:c.border}}><Text style={{color:c.text,fontSize:10}}>{coach.full_name||coach.username||'Coach'}</Text><Text style={{color:c.accentBright,fontSize:9,fontWeight:'900'}}>{coachLinks.filter((x:any)=>x.coach_user_id===coach.user_id).length} athlete links · {groupRows.filter((x:any)=>x.coach_user_id===coach.user_id).length} groups</Text></View>)}</Card>
   <Card><Text style={{color:c.text,fontWeight:'900',fontSize:12}}>Competition trends</Text><Text style={{color:c.muted,fontSize:9,marginTop:5}}>{events.filter((x:any)=>x.status==='completed'||x.result).length} completed/result records · {events.filter((x:any)=>String(x.starts_at)>=new Date().toISOString().slice(0,10)).length} upcoming records.</Text><Text style={{color:c.muted,fontSize:8,marginTop:5}}>Only saved Academy athlete records are counted. Missing records are not treated as losses or poor performance.</Text></Card>
  </View>:null}

  {tab==='Achievements'?<View style={{gap:10}}>
   <Text style={{color:c.text,fontSize:23,fontWeight:'900'}}>Academy Achievements</Text>
   <Text style={{color:c.muted,fontSize:10}}>Medals and certificates recorded on Academy athlete profiles.</Text>
   <View style={{flexDirection:'row',gap:8}}><Stat icon="trophy" label="Medals" value={medalRows.length} sub="Saved results"/><Stat icon="shield" label="Certificates" value={certificateRows.length} sub="Saved documents"/></View>
   {medalRows.map((row:any)=><Card key={'medal-'+row.id} style={{padding:12}}><View style={{flexDirection:'row',alignItems:'center',gap:10}}><Text style={{fontSize:22}}>🏅</Text><View style={{flex:1}}><Text style={{color:c.text,fontSize:11,fontWeight:'900'}}>{row.event_name||'Competition medal'}</Text><Text style={{color:c.muted,fontSize:9,marginTop:3}}>{athleteName(row.user_id)} · {row.medal_type||'Medal'} · {row.category||row.discipline||'Category not set'}</Text></View><Text style={{color:row.verification_status==='verified'?c.success:c.muted,fontSize:8,fontWeight:'900'}}>{String(row.verification_status||'unverified').toUpperCase()}</Text></View></Card>)}
   {certificateRows.map((row:any)=><Card key={'certificate-'+row.id} style={{padding:12}}><View style={{flexDirection:'row',alignItems:'center',gap:10}}><Icon name="documents" size={20}/><View style={{flex:1}}><Text style={{color:c.text,fontSize:11,fontWeight:'900'}}>{row.title||'Certificate'}</Text><Text style={{color:c.muted,fontSize:9,marginTop:3}}>{athleteName(row.user_id)} · {row.issued_by||'Issuer not set'} · {row.issued_at||'Date not set'}</Text></View><Text style={{color:row.verification_status==='verified'?c.success:c.muted,fontSize:8,fontWeight:'900'}}>{String(row.verification_status||'unverified').toUpperCase()}</Text></View></Card>)}
   {!medalRows.length&&!certificateRows.length?<Card><Text style={{color:c.text,fontWeight:'900'}}>No achievements recorded yet</Text><Text style={{color:c.muted,fontSize:10,marginTop:4}}>Verified competition results and certificates will appear as athletes add them.</Text></Card>:null}
  </View>:null}

  {tab==='Approvals'?<View style={{gap:10}}>
   <Text style={{color:c.text,fontSize:23,fontWeight:'900'}}>Coach Approval Oversight</Text>
   <Text style={{color:c.muted,fontSize:10,lineHeight:16}}>View belt-change and competition-category requests across the Academy. Only the assigned Coach can approve or reject their request.</Text>
   <View style={{flexDirection:'row',gap:8}}><Stat icon="shield" label="Pending" value={pendingAcademyApprovals.length} sub="Awaiting assigned Coach"/><Stat icon="check" label="Reviewed" value={academyApprovals.filter((x:any)=>x.status!=='pending').length} sub="Decision history"/></View>
   {academyApprovals.length?academyApprovals.map((row:any)=><Card key={row.id} style={{padding:13}}>
    <View style={{flexDirection:'row',alignItems:'center',gap:8}}><View style={{flex:1}}><Text style={{color:c.text,fontSize:11,fontWeight:'900'}}>{athleteName(row.athlete_user_id)}</Text><Text style={{color:c.muted,fontSize:8,marginTop:3}}>{row.request_type==='belt_change'?'Belt change':'Competition category'} · {coachName(row.coach_user_id)}</Text></View><Text style={{color:row.status==='pending'?c.warning:row.status==='approved'?c.success:c.muted,fontSize:8,fontWeight:'900'}}>{String(row.status).toUpperCase()}</Text></View>
    <Text style={{color:c.text,fontSize:10,marginTop:8}}>{row.current_value||'Not set'} → <Text style={{fontWeight:'900'}}>{row.requested_value}</Text></Text>
    {row.athlete_weight_kg!=null?<Text style={{color:c.muted,fontSize:8,marginTop:3}}>Athlete-submitted weight for category review: {row.athlete_weight_kg} kg</Text>:null}
    {row.status==='pending'&&row.coach_user_id===session?.user?.id?<View style={{flexDirection:'row',gap:8,marginTop:10}}><Button title="REJECT" secondary onPress={()=>void reviewAcademyApproval(row.id,'rejected')} busy={busy}/><Button title="APPROVE" onPress={()=>void reviewAcademyApproval(row.id,'approved')} busy={busy}/></View>:row.status==='pending'?<Text style={{color:c.muted,fontSize:8,marginTop:8}}>Assigned Coach must review this request from their Coach workspace.</Text>:null}
   </Card>):<Card><Text style={{color:c.text,fontWeight:'900'}}>No approval requests yet</Text></Card>}
  </View>:null}

  {tab==='Communication'?<View style={{gap:10}}>
   <Text style={{color:c.text,fontSize:23,fontWeight:'900'}}>Academy Communication</Text>
   <Text style={{color:c.muted,fontSize:10,lineHeight:16}}>Use existing private AthleteN conversations and training-group chats. Group access and membership permissions remain enforced by the messaging service.</Text>
   <Pressable onPress={()=>router.push('/messages')} style={{backgroundColor:c.accentSoft,borderWidth:1,borderColor:c.accentDeep,borderRadius:14,padding:14,flexDirection:'row',alignItems:'center',gap:10}}><Icon name="message" size={20}/><View style={{flex:1}}><Text style={{color:c.text,fontSize:11,fontWeight:'900'}}>Open AthleteN Messages</Text><Text style={{color:c.muted,fontSize:8,marginTop:3}}>Direct conversations, group management, replies and notifications.</Text></View><Icon name="chevron" size={16}/></Pressable>
   {groupRows.length?groupRows.map((g:any)=><Card key={g.id} style={{padding:12}}><View style={{flexDirection:'row',alignItems:'center',gap:8}}><View style={{flex:1}}><Text style={{color:c.text,fontSize:11,fontWeight:'900'}}>{g.name}</Text><Text style={{color:c.muted,fontSize:8,marginTop:3}}>{coachName(g.coach_user_id)} · {g.focus_area||'Training group'}</Text></View>{g.conversation_id?<Pressable onPress={()=>router.push({pathname:'/messages',params:{conversationId:g.conversation_id}})} style={{backgroundColor:c.accent,borderRadius:10,paddingHorizontal:11,paddingVertical:8}}><Text style={{color:'#fff',fontSize:8,fontWeight:'900'}}>OPEN CHAT</Text></Pressable>:<Text style={{color:c.muted,fontSize:8}}>No group chat linked</Text>}</View></Card>):<Card><Text style={{color:c.text,fontWeight:'900'}}>No training groups yet</Text></Card>}
   <Card><Text style={{color:c.text,fontSize:11,fontWeight:'900'}}>Announcements and guardian updates</Text><Text style={{color:c.muted,fontSize:9,lineHeight:15,marginTop:5}}>Use group conversations for now. A separate broadcast/announcement feature and parent/guardian delivery flow are not enabled in this release, to avoid sending messages without the right consent and notification controls.</Text></Card>
  </View>:null}

  {tab!=='Dashboard'?<View style={{marginTop:2,marginBottom:2}}><Card style={{padding:14,borderColor:c.accentDeep,backgroundColor:'#071523'}}><View style={{flexDirection:'row',alignItems:'center',gap:10}}><View style={{width:38,height:38,borderRadius:12,backgroundColor:c.accentSoft,alignItems:'center',justifyContent:'center'}}><Icon name="ai" size={20}/></View><View style={{flex:1}}><Text style={{color:c.text,fontSize:13,fontWeight:'900'}}>AthleteN AI</Text><Text style={{color:c.muted,fontSize:8,marginTop:2}}>{remaining.toLocaleString('en-IN')} / {aiLimit.toLocaleString('en-IN')} messages remaining</Text></View><Pressable onPress={()=>setAiOpen(true)} style={{backgroundColor:c.accent,borderRadius:11,paddingHorizontal:12,paddingVertical:9}}><Text style={{color:'#fff',fontSize:8,fontWeight:'900'}}>ASK AI</Text></Pressable></View></Card></View>:null}

  {tab==='Finance'?<View style={{gap:10}}><Text style={{color:c.text,fontSize:23,fontWeight:'900'}}>Finance</Text><Text style={{color:c.muted,fontSize:10}}>Real academy income and expenses.</Text>{financeAccount?<><Card accent><Text style={{color:c.muted,fontSize:8,fontWeight:'900'}}>ACADEMY FINANCE ACCOUNT</Text><Text style={{color:c.text,fontSize:18,fontWeight:'900',marginTop:3}}>{financeAccount.name}</Text><Text style={{color:c.accentBright,fontSize:9,fontWeight:'900',marginTop:3}}>INR · {financeTx.length} recent transactions</Text></Card><Card><Text style={{color:c.text,fontSize:14,fontWeight:'900'}}>Add transaction</Text><View style={{flexDirection:'row',gap:7}}><Pressable onPress={()=>setFinanceType('income')} style={{flex:1,padding:10,borderRadius:11,backgroundColor:financeType==='income'?c.accent:c.surface,borderWidth:1,borderColor:c.border}}><Text style={{color:financeType==='income'?'#fff':c.muted,textAlign:'center',fontSize:9,fontWeight:'900'}}>INCOME</Text></Pressable><Pressable onPress={()=>setFinanceType('expense')} style={{flex:1,padding:10,borderRadius:11,backgroundColor:financeType==='expense'?'#8b3a45':c.surface,borderWidth:1,borderColor:c.border}}><Text style={{color:financeType==='expense'?'#fff':c.muted,textAlign:'center',fontSize:9,fontWeight:'900'}}>EXPENSE</Text></Pressable></View><Field label="AMOUNT (INR)" value={financeAmount} onChangeText={setFinanceAmount} keyboardType="decimal-pad" placeholder="0"/><Field label="CATEGORY" value={financeCategory} onChangeText={setFinanceCategory} placeholder="Training fees"/><Field label="DESCRIPTION" value={financeDescription} onChangeText={setFinanceDescription} placeholder="Monthly academy fee"/><Button title="ADD TRANSACTION" onPress={()=>void addFinanceTransaction()} busy={busy}/></Card>{financeTx.map(tx=><Card key={tx.id} style={{padding:12}}><View style={{flexDirection:'row',alignItems:'center'}}><View style={{flex:1}}><Text style={{color:c.text,fontWeight:'900',fontSize:11}}>{tx.category}</Text><Text style={{color:c.muted,fontSize:8,marginTop:3}}>{tx.description||'No description'} · {tx.transaction_date}</Text></View><Text style={{color:tx.type==='income'?c.accentBright:'#ff8f9f',fontSize:13,fontWeight:'900'}}>{tx.type==='income'?'+':'-'} ₹{Number(tx.amount).toLocaleString('en-IN')}</Text></View></Card>)}</>:<Card><Text style={{color:c.text,fontWeight:'900'}}>Create academy finance account</Text><Text style={{color:c.muted,fontSize:10,marginTop:4}}>This creates the real finance ledger for this academy.</Text><Button title="CREATE FINANCE ACCOUNT" onPress={()=>void createFinanceAccount()} busy={busy}/></Card>}</View>:null}
  <View style={{marginTop:18,gap:10}}>
  <Pressable onPress={()=>router.push('/reports')} style={{backgroundColor:c.accentSoft,borderWidth:1,borderColor:c.accentDeep,borderRadius:16,padding:14,flexDirection:'row',alignItems:'center',gap:11}}>
   <View style={{width:40,height:40,borderRadius:13,backgroundColor:c.background,alignItems:'center',justifyContent:'center'}}><Icon name="ai" size={19}/></View>
   <View style={{flex:1}}><Text style={{color:c.accentBright,fontSize:8,fontWeight:'900',letterSpacing:1.2}}>ATHLETEN INTELLIGENCE</Text><Text style={{color:c.text,fontSize:14,fontWeight:'900',marginTop:2}}>AI Monthly & Match Reports</Text><Text style={{color:c.muted,fontSize:10,marginTop:2}}>Generate reports for your academy workspace.</Text></View><Icon name="arrow" size={16} color={c.muted}/>
  </Pressable>
  <PlanSection />
  <Pressable onPress={()=>router.push('/academy-settings')} style={{backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong,borderRadius:18,padding:14,flexDirection:'row',alignItems:'center',gap:11}}>
   <View style={{width:40,height:40,borderRadius:13,backgroundColor:c.accentSoft,alignItems:'center',justifyContent:'center'}}><Icon name="settings" size={19}/></View>
   <View style={{flex:1}}><Text style={{color:c.accentBright,fontSize:8,fontWeight:'900',letterSpacing:1.2}}>ACADEMY SETTINGS</Text><Text style={{color:c.text,fontSize:14,fontWeight:'900',marginTop:2}}>Settings</Text><Text style={{color:c.muted,fontSize:10,marginTop:2}}>Academy profile, navigation, plan and account settings.</Text></View>
   <Icon name="arrow" size={16} color={c.muted}/>
  </Pressable>
 </View>
  <Modal visible={aiOpen} transparent animationType="slide" onRequestClose={()=>setAiOpen(false)}><View style={{flex:1,backgroundColor:'#000000B8',justifyContent:'flex-end'}}><View style={{backgroundColor:c.background,borderTopLeftRadius:28,borderTopRightRadius:28,borderWidth:1,borderColor:c.borderStrong,padding:18,paddingBottom:28,maxHeight:'82%'}}><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{aiPanel}</ScrollView></View></View></Modal>
 </Screen>;
}
