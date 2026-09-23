import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Icon as AppIcon } from '@/components/mobile-ui';
import { Screen, Card, Button, Field, c } from '@/components/mobile-ui';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { getAiLimit } from '@/lib/entitlements';
import PlanSection from '@/components/plan-section';

type Tab='Dashboard'|'People'|'Training'|'Events'|'Finance';
type Member={user_id:string;role:string;status:string;full_name?:string|null;belt?:string|null;discipline?:string|null;username?:string|null};
type Session={id:string;session_date:string;start_time:string;title:string};
type Event={id:string;name:string;starts_at:string;location?:string|null;status?:string|null};

const academyIconMap:any={athletes:'people',coaches:'coach',training:'training',events:'event',people:'people',finance:'finance',calendar:'calendar',ai:'ai',settings:'settings',code:'searchCircle',refresh:'refresh',chevron:'arrow'};
function Icon({name,size=20,color=c.accentBright}:{name:string;size?:number;color?:string}){return <AppIcon name={academyIconMap[name]||name} size={size} color={color}/>} 

const tabs:{key:Tab;label:string;icon:string}[]=[
 {key:'Dashboard',label:'Dashboard',icon:'sparkles'},{key:'People',label:'People',icon:'people'},{key:'Training',label:'Training',icon:'training'},{key:'Events',label:'Events',icon:'events'},{key:'Finance',label:'Finance',icon:'finance'}
];

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

function Stat({icon,label,value,sub,accent=c.accent}:{icon:string;label:string;value:string|number;sub:string;accent?:string}){
 return <Card style={{flex:1,minWidth:0,padding:14}}>
  <View style={{flexDirection:'row',alignItems:'center',gap:10}}>
   <View style={{width:40,height:40,borderRadius:13,backgroundColor:accent+'20',alignItems:'center',justifyContent:'center'}}><Icon name={icon} color={accent} size={21}/></View>
   <View style={{flex:1,minWidth:0}}><Text numberOfLines={1} adjustsFontSizeToFit style={{color:c.muted,fontSize:8,fontWeight:'900',letterSpacing:.5}}>{label.toUpperCase()}</Text><Text style={{color:c.text,fontSize:23,fontWeight:'900',marginTop:2}}>{value}</Text></View>
  </View>
  <Text style={{color:c.accentBright,fontSize:8,fontWeight:'800',marginTop:9}}>{sub}</Text>
 </Card>;
}

export default function Academy(){
 const {session,profile}=useAuth();
 const [tab,setTab]=useState<Tab>('Dashboard');
 const [academy,setAcademy]=useState<any>(null);
 const [members,setMembers]=useState<Member[]>([]);
 const [sessions,setSessions]=useState<Session[]>([]); const [activeGroupCount,setActiveGroupCount]=useState(0);
 const [events,setEvents]=useState<Event[]>([]);
 const [attendance,setAttendance]=useState<number[]>(Array(7).fill(0));
 const [savedCode,setSavedCode]=useState('');
 const [code,setCode]=useState('');
 const [coachUsername,setCoachUsername]=useState('');
 const [eventName,setEventName]=useState(''); const [eventDate,setEventDate]=useState(''); const [eventLocation,setEventLocation]=useState(''); const [eventAthlete,setEventAthlete]=useState(''); const [eventCoach,setEventCoach]=useState('');
 const [financeAccount,setFinanceAccount]=useState<any>(null); const [financeTx,setFinanceTx]=useState<any[]>([]);
 const [groupName,setGroupName]=useState(''); const [groupFocus,setGroupFocus]=useState(''); const [groupCoach,setGroupCoach]=useState(''); const [groupDays,setGroupDays]=useState('Mon,Wed,Fri'); const [groupTime,setGroupTime]=useState('17:00'); const [groupDuration,setGroupDuration]=useState('90'); const [groupAthletes,setGroupAthletes]=useState(''); const [financeType,setFinanceType]=useState<'income'|'expense'>('income'); const [financeAmount,setFinanceAmount]=useState(''); const [financeCategory,setFinanceCategory]=useState('Training fees'); const [financeDescription,setFinanceDescription]=useState('');
 const [busy,setBusy]=useState(false);
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
  const [a,m,t,cc,usage]=await Promise.all([
   supabase.from('academies').select('id,name,city,state,country,status').eq('id',profile.academy_id).maybeSingle(),
   supabase.from('academy_memberships').select('user_id,role,status').eq('academy_id',profile.academy_id).eq('status','active'),
   supabase.from('tournaments').select('id,name,starts_at,location,status').eq('sport','Taekwondo').gte('starts_at',today).order('starts_at').limit(6),
   supabase.rpc('get_my_connection_code'),
   supabase.from('subscription_usage').select('ai_requests_used,ai_requests_limit').eq('user_id',session?.user?.id||'').eq('usage_month',monthStart.toISOString().slice(0,10)).maybeSingle()
  ]);
  if(a.error||m.error||t.error){setDataError(a.error?.message||m.error?.message||t.error?.message||'Could not load academy data.');}
  setAcademy(a.data);
  setSavedCode(cc.data?.code||'');
  const fallbackLimit=getAiLimit((profile as any)?.plan_id || (profile as any)?.plan || 'academy');
  setAiUsed(Number(usage.data?.ai_requests_used||0));
  setAiLimit(Number(usage.data?.ai_requests_limit||fallbackLimit));
  const base=(m.data||[]) as any[];
  const ids=base.map(x=>x.user_id);
  if(ids.length){
   const p=await supabase.from('profiles').select('user_id,full_name,belt,discipline,username').in('user_id',ids);
   const map=new Map((p.data||[]).map((x:any)=>[x.user_id,x]));
   setMembers(base.map(x=>({...x,...(map.get(x.user_id)||{})})));
  }else setMembers([]);
  setEvents((t.data||[]) as Event[]);
  const fa=await supabase.from('finance_accounts').select('id,name,currency').eq('academy_id',profile.academy_id).eq('owner_type','academy').maybeSingle();
  if(fa.data){setFinanceAccount(fa.data); const tx=await supabase.from('finance_transactions').select('id,type,amount,category,description,transaction_date').eq('account_id',fa.data.id).order('transaction_date',{ascending:false}).limit(20); setFinanceTx(tx.data||[]);} else setFinanceTx([]);

  const coachIds=base.filter(x=>x.role==='coach').map(x=>x.user_id);
  if(coachIds.length){
   const g=await supabase.from('training_groups').select('id').in('coach_user_id',coachIds).eq('active',true);
   const groupIds=(g.data||[]).map((x:any)=>x.id); setActiveGroupCount(groupIds.length);
   if(groupIds.length){
    const s=await supabase.from('training_group_sessions').select('id,session_date,start_time,title').in('group_id',groupIds).gte('session_date',today).order('session_date').order('start_time').limit(12);
    setSessions((s.data||[]) as Session[]);
    const past=await supabase.from('training_group_sessions').select('id,session_date').in('group_id',groupIds).gte('session_date',start).lte('session_date',today);
    const ids2=(past.data||[]).map((x:any)=>x.id);
    if(ids2.length){
     const ar=await supabase.from('training_group_attendance').select('session_id,status').in('session_id',ids2);
     setAttendance(Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));const day=d.toISOString().slice(0,10);const sessionIds=new Set((past.data||[]).filter((x:any)=>x.session_date===day).map((x:any)=>x.id));return (ar.data||[]).filter((x:any)=>sessionIds.has(x.session_id)&&['present','late'].includes(x.status)).length}));
    }else setAttendance(Array(7).fill(0));
   }else {setSessions([]);setActiveGroupCount(0);}
  }else {setSessions([]);setActiveGroupCount(0);}
 };

 useEffect(()=>{void load()},[profile?.academy_id]);

 const athletes=members.filter(x=>x.role==='athlete').length;
 const coaches=members.filter(x=>x.role==='coach').length;
 const activeGroups=activeGroupCount;
 const maxAttendance=Math.max(1,...attendance);
 const avgAttendance=athletes?Math.min(100,Math.round((attendance.reduce((a,b)=>a+b,0)/(7*athletes))*100)):0;

 async function saveCode(){
  const value=code.trim().toUpperCase(); if(!value)return;
  setBusy(true); const {data,error}=await supabase.rpc('set_connection_code',{p_code:value}); setBusy(false);
  if(error){alert(error.message);return} setSavedCode(String(data?.code||value));setCode('');
 }
 async function removeMember(userId:string){
  setBusy(true); const {error}=await supabase.from('academy_memberships').delete().eq('academy_id',profile?.academy_id).eq('user_id',userId); setBusy(false); if(error){alert(error.message);return} await load();
 }
 async function addCoach(){
  const value=coachUsername.trim();if(!value)return;
  setBusy(true);const {error}=await supabase.rpc('academy_add_coach',{p_username:value});setBusy(false);
  if(error){alert(error.message);return}setCoachUsername('');await load();
 }
 async function createTrainingGroup(){ const name=groupName.trim(); const coachText=groupCoach.trim(); if(!name||!coachText)return alert('Enter a group name and coach username.'); const coach=members.find(m=>m.role==='coach'&&(m.user_id===coachText||m.username?.toLowerCase()===coachText.toLowerCase()||m.full_name?.toLowerCase()===coachText.toLowerCase())); if(!coach)return alert('Choose an active academy coach.'); const days=groupDays.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean); const valid=['sun','mon','tue','wed','thu','fri','sat']; if(!days.length||days.some(d=>!valid.includes(d)))return alert('Days must be comma-separated, for example Mon,Wed,Fri.'); if(!/^\d{2}:\d{2}$/.test(groupTime.trim()))return alert('Start time must use HH:MM.'); const duration=Number(groupDuration); if(!Number.isFinite(duration)||duration<15)return alert('Duration must be at least 15 minutes.'); const selected=groupAthletes.trim()?groupAthletes.split(',').map(x=>x.trim()).filter(Boolean):[]; const ids=selected.map(value=>members.find(m=>m.role==='athlete'&&(m.user_id===value||m.username?.toLowerCase()===value.toLowerCase()||m.full_name?.toLowerCase()===value.toLowerCase()))?.user_id).filter(Boolean) as string[]; if(ids.length!==selected.length)return alert('One or more athletes could not be found in this academy.'); setBusy(true); const {error}=await supabase.rpc('academy_create_training_group',{p_name:name,p_focus:groupFocus.trim(),p_recurrence_days:days,p_start_time:groupTime.trim(),p_duration_minutes:duration,p_coach_user_id:coach.user_id,p_athlete_ids:ids}); setBusy(false); if(error){alert(error.message);return} setGroupName('');setGroupFocus('');setGroupCoach('');setGroupAthletes('');await load(); }
 async function createFinanceAccount(){
  if(financeAccount||!profile?.academy_id)return; setBusy(true); const {data,error}=await supabase.from('finance_accounts').insert({owner_user_id:session?.user?.id,academy_id:profile.academy_id,owner_type:'academy',name:(academy?.name||'AthleteN Academy')+' Finance',currency:'INR'}).select('id,name,currency').single(); setBusy(false); if(error){alert(error.message);return} setFinanceAccount(data); setFinanceTx([]);
 }
 async function addFinanceTransaction(){
  if(!financeAccount)return; const amount=Number(financeAmount); if(!Number.isFinite(amount)||amount<=0||!financeCategory.trim())return alert('Enter a valid amount and category.'); setBusy(true); const {error}=await supabase.from('finance_transactions').insert({account_id:financeAccount.id,user_id:session?.user?.id,type:financeType,amount,category:financeCategory.trim(),description:financeDescription.trim()||null}); setBusy(false); if(error){alert(error.message);return} setFinanceAmount('');setFinanceDescription(''); await load();
 }
 async function createEvent(){
  if(!eventName.trim()||!eventDate.trim()||!eventAthlete.trim())return alert('Enter competition name, date and athlete account code/username.');
  const athlete=members.find(m=>m.user_id===eventAthlete.trim()||m.username?.toLowerCase()===eventAthlete.trim().toLowerCase()||m.full_name?.toLowerCase()===eventAthlete.trim().toLowerCase()); if(!athlete||athlete.role!=='athlete')return alert('Choose an active academy athlete.');
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
 const remaining=Math.max(0,aiLimit-aiUsed);
 const aiPanel=<View style={{gap:11}}>
  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><View><Text style={{color:c.accentBright,fontSize:8,fontWeight:'900',letterSpacing:1.2}}>ATHLETEN AI</Text><Text style={{color:c.text,fontSize:20,fontWeight:'900',marginTop:3}}>Academy AI</Text></View><Pressable onPress={()=>setAiOpen(false)} style={{width:36,height:36,borderRadius:12,backgroundColor:c.surface,alignItems:'center',justifyContent:'center'}}><Text style={{color:c.muted,fontSize:20}}>×</Text></Pressable></View>
  <View style={{backgroundColor:c.accentSoft,borderWidth:1,borderColor:c.accentDeep,borderRadius:14,padding:12}}><Text style={{color:c.accentBright,fontSize:10,fontWeight:'900'}}>{remaining.toLocaleString('en-IN')} / {aiLimit.toLocaleString('en-IN')} AI messages remaining</Text><View style={{height:6,borderRadius:4,backgroundColor:c.background,marginTop:8,overflow:'hidden'}}><View style={{height:6,width:(aiLimit?Math.min(100,(aiUsed/aiLimit)*100):100)+'%',backgroundColor:c.accent}}/></View><Text style={{color:c.muted,fontSize:8,marginTop:6}}>Usage is enforced by the server for your Academy plan.</Text></View>
  <Text style={{color:c.muted,fontSize:10,lineHeight:16}}>Ask about athletes, coaches, training, attendance, competitions, or academy operations.</Text>
  <View style={{flexDirection:'row',gap:7}}>{['Academy status?','Attendance trend?','Competition prep?'].map(x=><Pressable key={x} onPress={()=>void askAI(x)} style={{flex:1,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:11,padding:9}}><Text style={{color:c.text,fontSize:8,fontWeight:'800'}}>{x}</Text></Pressable>)}</View>
  <View style={{backgroundColor:c.background,borderWidth:1,borderColor:c.border,borderRadius:13,flexDirection:'row',alignItems:'center'}}><TextInput value={aiQuestion} onChangeText={setAiQuestion} onSubmitEditing={()=>void askAI()} placeholder="Ask AthleteN AI…" placeholderTextColor={c.muted} style={{flex:1,color:c.text,paddingHorizontal:12,paddingVertical:12,fontSize:11}}/><Pressable onPress={()=>void askAI()} disabled={aiBusy||remaining<=0} style={{width:45,height:42,marginRight:4,borderRadius:10,backgroundColor:remaining>0?c.accent:c.border,alignItems:'center',justifyContent:'center'}}>{aiBusy?<ActivityIndicator color="#fff"/>:<Icon name="chevron" size={18} color="#fff"/>}</Pressable></View>
  {aiAnswer?<View style={{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:13,padding:12}}><Text style={{color:c.accentBright,fontSize:8,fontWeight:'900',letterSpacing:1}}>ATHLETEN AI</Text><Text style={{color:c.text,fontSize:10,lineHeight:17,marginTop:5}}>{aiAnswer}</Text></View>:null}
 </View>;
 const bottomBar=<View style={{position:'absolute',left:10,right:10,bottom:10,backgroundColor:'#0B1019',borderWidth:1,borderColor:c.borderStrong,borderRadius:22,padding:7,shadowOpacity:.35,shadowRadius:14,elevation:12}}><View style={{flexDirection:'row',alignItems:'center',gap:5}}>{tabs.map(x=><Pressable key={x.key} onPress={()=>setTab(x.key)} style={{flex:1,alignItems:'center',justifyContent:'center',paddingVertical:8,borderRadius:15,backgroundColor:tab===x.key?c.accent:'transparent'}}><Icon name={x.icon} size={17} color={tab===x.key?'#fff':c.muted}/><Text style={{color:tab===x.key?'#fff':c.muted,fontSize:7,fontWeight:'900',marginTop:3}}>{x.label}</Text></Pressable>)}<Pressable onPress={()=>setAiOpen(true)} style={{width:48,alignItems:'center',justifyContent:'center',paddingVertical:8,borderRadius:15,backgroundColor:c.accentSoft,borderWidth:1,borderColor:c.accentDeep}}><Icon name="ai" size={19}/><Text style={{color:c.accentBright,fontSize:7,fontWeight:'900',marginTop:3}}>AI</Text></Pressable></View></View>;

 return <Screen bottomBar={bottomBar}>
    <PlanSection />
  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
   <View><Text style={{color:c.accentBright,fontSize:8,fontWeight:'900',letterSpacing:1.5}}>ATHLETEN ACADEMY</Text><Text style={{color:c.text,fontSize:25,fontWeight:'900',marginTop:3}}>{academy?.name||'Academy'}</Text></View>
   <Pressable onPress={()=>void load()} style={{width:40,height:40,borderRadius:13,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'}}><Icon name="refresh" size={18}/></Pressable>
  </View>


  {dataError?<Card style={{borderColor:'#8b3a45'}}><Text style={{color:'#ff8f9f',fontSize:10,fontWeight:'900'}}>DATA ERROR</Text><Text style={{color:c.text,fontSize:9,marginTop:4}}>{dataError}</Text><Button title="RETRY" onPress={()=>void load()} secondary/></Card>:null}

  {tab==='Dashboard'?<>
   <View style={{marginTop:4,marginBottom:12}}><Text style={{color:c.muted,fontSize:10}}>ACADEMY CONTROL CENTER</Text><Text style={{color:c.text,fontSize:27,fontWeight:'900',marginTop:3}}>Run your academy.</Text><Text style={{color:c.muted,fontSize:11,marginTop:3}}>People, training, competitions, finance and AI in one place.</Text></View>

   <View style={{flexDirection:'row',flexWrap:'wrap',gap:9}}>
    <Stat icon="athletes" label="Athletes" value={athletes} sub="Active members" accent="#2186ff"/>
    <Stat icon="coaches" label="Coaches" value={coaches} sub="Active coaches" accent="#1bb6c9"/>
    <Stat icon="training" label="Training" value={activeGroups} sub="Active groups" accent="#8a5cff"/>
    <Stat icon="events" label="Competitions" value={events.length} sub="Upcoming events" accent="#ff9b2f"/>
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
   <Text style={{color:c.muted,fontSize:10}}>Manage academy athletes and coaches.</Text>
   <Card><Text style={{color:c.text,fontSize:14,fontWeight:'900'}}>Add a coach</Text><Text style={{color:c.muted,fontSize:9,marginTop:3}}>Use the coach's AthleteN username.</Text><Field label="COACH USERNAME" value={coachUsername} onChangeText={setCoachUsername} autoCorrect={false} placeholder="coach_username"/><Button title="ADD COACH" onPress={()=>void addCoach()} busy={busy}/></Card>
   {members.length?members.map(m=><Card key={m.user_id} style={{padding:13}}><View style={{flexDirection:'row',alignItems:'center',gap:11}}><View style={{width:40,height:40,borderRadius:12,backgroundColor:c.accentSoft,alignItems:'center',justifyContent:'center'}}><Icon name={m.role==='coach'?'coaches':'athletes'} size={18}/></View><View style={{flex:1}}><Text style={{color:c.text,fontSize:12,fontWeight:'900'}}>{m.full_name||m.username||'Member'}</Text><Text style={{color:c.muted,fontSize:9,marginTop:3}}>{m.role.toUpperCase()} · {m.discipline||'Taekwondo'}{m.belt?' · '+m.belt:''}</Text></View>{m.role==='academy_admin'?<Text style={{color:c.muted,fontSize:7,fontWeight:'900'}}>ADMIN</Text>:<Pressable disabled={busy} onPress={()=>void removeMember(m.user_id)} style={{borderWidth:1,borderColor:'#8b3a45',borderRadius:9,paddingHorizontal:8,paddingVertical:6}}><Text style={{color:'#ff8f9f',fontSize:7,fontWeight:'900'}}>REMOVE</Text></Pressable>}</View></Card>):<Card><Text style={{color:c.text,fontWeight:'900'}}>No connected people yet</Text><Text style={{color:c.muted,fontSize:10,marginTop:4}}>Add coaches here or share the academy code with athletes.</Text></Card>}
  </View>:null}

  {tab==='Training'?<View style={{gap:9}}><Text style={{color:c.text,fontSize:23,fontWeight:'900'}}>Training</Text><Text style={{color:c.muted,fontSize:10}}>Create academy groups, assign coaches and athletes, and manage the generated schedule.</Text><Card><Text style={{color:c.text,fontSize:14,fontWeight:'900'}}>Create training group</Text><Field label="GROUP NAME" value={groupName} onChangeText={setGroupName} placeholder="Elite Kyorugi"/><Field label="FOCUS" value={groupFocus} onChangeText={setGroupFocus} placeholder="Kyorugi conditioning"/><Field label="COACH USERNAME / NAME" value={groupCoach} onChangeText={setGroupCoach} placeholder="coach_username"/><Field label="ATHLETES (COMMA-SEPARATED, OPTIONAL)" value={groupAthletes} onChangeText={setGroupAthletes} placeholder="athlete1, athlete2"/><Field label="DAYS" value={groupDays} onChangeText={setGroupDays} placeholder="Mon,Wed,Fri"/><Field label="START TIME (HH:MM)" value={groupTime} onChangeText={setGroupTime} placeholder="17:00"/><Field label="DURATION (MINUTES)" value={groupDuration} onChangeText={setGroupDuration} keyboardType="number-pad" placeholder="90"/><Button title="CREATE TRAINING GROUP" onPress={()=>void createTrainingGroup()} busy={busy}/></Card>{sessions.length?sessions.map(s=><Card key={s.id}><Text style={{color:c.text,fontWeight:'900'}}>{s.title}</Text><Text style={{color:c.muted,fontSize:9,marginTop:4}}>{new Date(s.session_date).toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'})} · {s.start_time?.slice(0,5)}</Text></Card>):<Card><Text style={{color:c.text,fontWeight:'900'}}>No sessions yet</Text><Text style={{color:c.muted,fontSize:10,marginTop:4}}>Create a group above to generate the academy schedule.</Text></Card>}</View>:null}

  {tab==='Events'?<View style={{gap:9}}><Text style={{color:c.text,fontSize:23,fontWeight:'900'}}>Competitions</Text><Text style={{color:c.muted,fontSize:10}}>Create and view academy competitions.</Text><Card><Text style={{color:c.text,fontSize:14,fontWeight:'900'}}>Create competition</Text><Field label="NAME" value={eventName} onChangeText={setEventName} placeholder="Delhi Open 2026"/><Field label="DATE (YYYY-MM-DD)" value={eventDate} onChangeText={setEventDate} placeholder="2026-10-25" autoCorrect={false}/><Field label="LOCATION" value={eventLocation} onChangeText={setEventLocation} placeholder="Noida"/><Field label="ATHLETE USERNAME / NAME" value={eventAthlete} onChangeText={setEventAthlete} placeholder="Select an academy athlete"/><Field label="COACH USERNAME (OPTIONAL)" value={eventCoach} onChangeText={setEventCoach} placeholder="Coach username"/><Button title="CREATE COMPETITION" onPress={()=>void createEvent()} busy={busy}/></Card>{events.length?events.map(e=><Card key={e.id}><View style={{flexDirection:'row',gap:10,alignItems:'center'}}><View style={{width:40,height:40,borderRadius:12,backgroundColor:'#ff9b2f20',alignItems:'center',justifyContent:'center'}}><Icon name="events" size={18} color="#ff9b2f"/></View><View style={{flex:1}}><Text style={{color:c.text,fontWeight:'900'}}>{e.name}</Text><Text style={{color:c.muted,fontSize:9,marginTop:4}}>{new Date(e.starts_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})} · {e.location||'Location TBD'}</Text></View></View></Card>):<Card><Text style={{color:c.text,fontWeight:'900'}}>No upcoming competitions</Text></Card>}</View>:null}

  {tab!=='Dashboard'?<View style={{marginTop:2,marginBottom:2}}><Card style={{padding:14,borderColor:c.accentDeep,backgroundColor:'#071523'}}><View style={{flexDirection:'row',alignItems:'center',gap:10}}><View style={{width:38,height:38,borderRadius:12,backgroundColor:c.accentSoft,alignItems:'center',justifyContent:'center'}}><Icon name="ai" size={20}/></View><View style={{flex:1}}><Text style={{color:c.text,fontSize:13,fontWeight:'900'}}>AthleteN AI</Text><Text style={{color:c.muted,fontSize:8,marginTop:2}}>{remaining.toLocaleString('en-IN')} / {aiLimit.toLocaleString('en-IN')} messages remaining</Text></View><Pressable onPress={()=>setAiOpen(true)} style={{backgroundColor:c.accent,borderRadius:11,paddingHorizontal:12,paddingVertical:9}}><Text style={{color:'#fff',fontSize:8,fontWeight:'900'}}>ASK AI</Text></Pressable></View></Card></View>:null}

  {tab==='Finance'?<View style={{gap:10}}><Text style={{color:c.text,fontSize:23,fontWeight:'900'}}>Finance</Text><Text style={{color:c.muted,fontSize:10}}>Real academy income and expenses.</Text>{financeAccount?<><Card accent><Text style={{color:c.muted,fontSize:8,fontWeight:'900'}}>ACADEMY FINANCE ACCOUNT</Text><Text style={{color:c.text,fontSize:18,fontWeight:'900',marginTop:3}}>{financeAccount.name}</Text><Text style={{color:c.accentBright,fontSize:9,fontWeight:'900',marginTop:3}}>INR · {financeTx.length} recent transactions</Text></Card><Card><Text style={{color:c.text,fontSize:14,fontWeight:'900'}}>Add transaction</Text><View style={{flexDirection:'row',gap:7}}><Pressable onPress={()=>setFinanceType('income')} style={{flex:1,padding:10,borderRadius:11,backgroundColor:financeType==='income'?c.accent:c.surface,borderWidth:1,borderColor:c.border}}><Text style={{color:financeType==='income'?'#fff':c.muted,textAlign:'center',fontSize:9,fontWeight:'900'}}>INCOME</Text></Pressable><Pressable onPress={()=>setFinanceType('expense')} style={{flex:1,padding:10,borderRadius:11,backgroundColor:financeType==='expense'?'#8b3a45':c.surface,borderWidth:1,borderColor:c.border}}><Text style={{color:financeType==='expense'?'#fff':c.muted,textAlign:'center',fontSize:9,fontWeight:'900'}}>EXPENSE</Text></Pressable></View><Field label="AMOUNT (INR)" value={financeAmount} onChangeText={setFinanceAmount} keyboardType="decimal-pad" placeholder="0"/><Field label="CATEGORY" value={financeCategory} onChangeText={setFinanceCategory} placeholder="Training fees"/><Field label="DESCRIPTION" value={financeDescription} onChangeText={setFinanceDescription} placeholder="Monthly academy fee"/><Button title="ADD TRANSACTION" onPress={()=>void addFinanceTransaction()} busy={busy}/></Card>{financeTx.map(tx=><Card key={tx.id} style={{padding:12}}><View style={{flexDirection:'row',alignItems:'center'}}><View style={{flex:1}}><Text style={{color:c.text,fontWeight:'900',fontSize:11}}>{tx.category}</Text><Text style={{color:c.muted,fontSize:8,marginTop:3}}>{tx.description||'No description'} · {tx.transaction_date}</Text></View><Text style={{color:tx.type==='income'?c.accentBright:'#ff8f9f',fontSize:13,fontWeight:'900'}}>{tx.type==='income'?'+':'-'} ₹{Number(tx.amount).toLocaleString('en-IN')}</Text></View></Card>)}</>:<Card><Text style={{color:c.text,fontWeight:'900'}}>Create academy finance account</Text><Text style={{color:c.muted,fontSize:10,marginTop:4}}>This creates the real finance ledger for this academy.</Text><Button title="CREATE FINANCE ACCOUNT" onPress={()=>void createFinanceAccount()} busy={busy}/></Card>}</View>:null}
  <Modal visible={aiOpen} transparent animationType="slide" onRequestClose={()=>setAiOpen(false)}><View style={{flex:1,backgroundColor:'#000000B8',justifyContent:'flex-end'}}><View style={{backgroundColor:c.background,borderTopLeftRadius:28,borderTopRightRadius:28,borderWidth:1,borderColor:c.borderStrong,padding:18,paddingBottom:28,maxHeight:'82%'}}><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{aiPanel}</ScrollView></View></View></Modal>
 </Screen>;
}
