import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Screen, Card, Button, Field, c } from '@/components/mobile-ui';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

type Tab='Dashboard'|'People'|'Training'|'Events'|'Finance';
type Member={user_id:string;role:string;status:string;full_name?:string|null;belt?:string|null;discipline?:string|null;username?:string|null};
type Session={id:string;session_date:string;start_time:string;title:string};
type Event={id:string;name:string;starts_at:string;location?:string|null;status?:string|null};

const iconNames:any={athletes:'person.2.fill',coaches:'person.crop.rectangle.stack.fill',training:'figure.run',events:'trophy.fill',people:'person.2.fill',finance:'indianrupeesign.circle.fill',calendar:'calendar',ai:'sparkles',settings:'gearshape.fill',code:'qrcode',refresh:'arrow.clockwise',chevron:'chevron.right'};
function Icon({name,size=20,color=c.accentBright}:{name:string;size?:number;color?:string}){return <SymbolView name={iconNames[name]||name} size={size} tintColor={color}/>}

const tabs:{key:Tab;label:string;icon:string}[]=[
 {key:'Dashboard',label:'Dashboard',icon:'sparkles'},{key:'People',label:'People',icon:'people'},{key:'Training',label:'Training',icon:'training'},{key:'Events',label:'Events',icon:'events'},{key:'Finance',label:'Finance',icon:'finance'}
];

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
 const [sessions,setSessions]=useState<Session[]>([]);
 const [events,setEvents]=useState<Event[]>([]);
 const [attendance,setAttendance]=useState<number[]>(Array(7).fill(0));
 const [savedCode,setSavedCode]=useState('');
 const [code,setCode]=useState('');
 const [coachUsername,setCoachUsername]=useState('');
 const [busy,setBusy]=useState(false);
 const [aiQuestion,setAiQuestion]=useState('');
 const [aiAnswer,setAiAnswer]=useState('');
 const [aiBusy,setAiBusy]=useState(false);

 const load=async()=>{
  if(!profile?.academy_id)return;
  const today=new Date().toISOString().slice(0,10);
  const start=new Date(Date.now()-6*86400000).toISOString().slice(0,10);
  const [a,m,t,cc]=await Promise.all([
   supabase.from('academies').select('id,name,city,state,country,status').eq('id',profile.academy_id).maybeSingle(),
   supabase.from('academy_memberships').select('user_id,role,status').eq('academy_id',profile.academy_id).eq('status','active'),
   supabase.from('tournaments').select('id,name,starts_at,location,status').eq('sport','Taekwondo').gte('starts_at',today).order('starts_at').limit(6),
   supabase.rpc('get_my_connection_code')
  ]);
  setAcademy(a.data);
  setSavedCode(cc.data?.code||'');
  const base=(m.data||[]) as any[];
  const ids=base.map(x=>x.user_id);
  if(ids.length){
   const p=await supabase.from('profiles').select('user_id,full_name,belt,discipline,username').in('user_id',ids);
   const map=new Map((p.data||[]).map((x:any)=>[x.user_id,x]));
   setMembers(base.map(x=>({...x,...(map.get(x.user_id)||{})})));
  }else setMembers([]);
  setEvents((t.data||[]) as Event[]);

  const coachIds=base.filter(x=>x.role==='coach').map(x=>x.user_id);
  if(coachIds.length){
   const g=await supabase.from('training_groups').select('id').in('coach_user_id',coachIds).eq('active',true);
   const groupIds=(g.data||[]).map((x:any)=>x.id);
   if(groupIds.length){
    const s=await supabase.from('training_group_sessions').select('id,session_date,start_time,title').in('group_id',groupIds).gte('session_date',today).order('session_date').order('start_time').limit(12);
    setSessions((s.data||[]) as Session[]);
    const past=await supabase.from('training_group_sessions').select('id,session_date').in('group_id',groupIds).gte('session_date',start).lte('session_date',today);
    const ids2=(past.data||[]).map((x:any)=>x.id);
    if(ids2.length){
     const ar=await supabase.from('training_group_attendance').select('session_id,status').in('session_id',ids2);
     setAttendance(Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));const day=d.toISOString().slice(0,10);const sessionIds=new Set((past.data||[]).filter((x:any)=>x.session_date===day).map((x:any)=>x.id));return (ar.data||[]).filter((x:any)=>sessionIds.has(x.session_id)&&['present','late'].includes(x.status)).length}));
    }else setAttendance(Array(7).fill(0));
   }else setSessions([]);
  }else setSessions([]);
 };

 useEffect(()=>{void load()},[profile?.academy_id]);

 const athletes=members.filter(x=>x.role==='athlete').length;
 const coaches=members.filter(x=>x.role==='coach').length;
 const activeGroups=new Set(sessions.map(x=>x.title)).size;
 const maxAttendance=Math.max(1,...attendance);
 const avgAttendance=athletes?Math.min(100,Math.round((attendance.reduce((a,b)=>a+b,0)/(7*athletes))*100)):0;

 async function saveCode(){
  const value=code.trim().toUpperCase(); if(!value)return;
  setBusy(true); const {data,error}=await supabase.rpc('set_connection_code',{p_code:value}); setBusy(false);
  if(error){alert(error.message);return} setSavedCode(String(data?.code||value));setCode('');
 }
 async function addCoach(){
  const value=coachUsername.trim();if(!value)return;
  setBusy(true);const {error}=await supabase.rpc('academy_add_coach',{p_username:value});setBusy(false);
  if(error){alert(error.message);return}setCoachUsername('');await load();
 }
 async function askAI(prompt?:string){
  const q=(prompt||aiQuestion).trim();if(!q||!session)return;
  setAiBusy(true);setAiAnswer('');
  const context='Academy: '+(academy?.name||'AthleteN Academy')+'; active athletes: '+athletes+'; active coaches: '+coaches+'; active training groups: '+activeGroups+'; upcoming competitions: '+events.length+'; average attendance last 7 days: '+avgAttendance+'%.';
  try{
   const response=await fetch('https://athleten.netlify.app/.netlify/functions/ai-coach',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({topic:'Performance Reports',prompt:context+'\nAcademy admin question: '+q})});
   const data=await response.json().catch(()=>({}));
   setAiAnswer(response.ok?String(data.answer||'No response returned.'):String(data.error||'AI Coach is unavailable right now.'));
  }catch(e){setAiAnswer('AI Coach connection failed. Please try again.')}
  setAiBusy(false);setAiQuestion('');
 }

 const quick=(next:Tab)=>setTab(next);

 return <Screen>
  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
   <View><Text style={{color:c.accentBright,fontSize:8,fontWeight:'900',letterSpacing:1.5}}>ATHLETEN ACADEMY</Text><Text style={{color:c.text,fontSize:25,fontWeight:'900',marginTop:3}}>{academy?.name||'Academy'}</Text></View>
   <Pressable onPress={()=>void load()} style={{width:40,height:40,borderRadius:13,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'}}><Icon name="refresh" size={18}/></Pressable>
  </View>

  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:8}} contentContainerStyle={{gap:7}}>
   {tabs.map(x=><Pressable key={x.key} onPress={()=>setTab(x.key)} style={{flex:1,minWidth:62,paddingHorizontal:10,paddingVertical:9,borderRadius:16,backgroundColor:tab===x.key?c.accent:c.surface,borderWidth:1,borderColor:tab===x.key?c.accent:c.border,alignItems:'center',gap:3}}><Icon name={x.icon} size={15} color={tab===x.key?'#fff':c.muted}/><Text style={{color:tab===x.key?'#fff':c.muted,fontSize:8,fontWeight:'900'}}>{x.label}</Text></Pressable>)}
  </ScrollView>

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

   <View><Text style={{color:c.text,fontSize:14,fontWeight:'900',marginBottom:8}}>Attendance · Last 7 Days</Text><Card><View style={{height:130,flexDirection:'row',alignItems:'flex-end',gap:6}}>{attendance.map((n,i)=><View key={i} style={{flex:1,alignItems:'center',justifyContent:'flex-end',height:'100%'}}><Text style={{color:c.muted,fontSize:7,marginBottom:3}}>{n}</Text><View style={{width:'62%',height:Math.max(4,(n/maxAttendance)*92),borderRadius:5,backgroundColor:c.accent}}/><Text style={{color:c.muted,fontSize:7,marginTop:4}}>{['M','T','W','T','F','S','S'][i]}</Text></View>)}</View><View style={{flexDirection:'row',justifyContent:'space-between',marginTop:11}}><Text style={{color:c.muted,fontSize:9}}>Average attendance</Text><Text style={{color:c.accentBright,fontSize:16,fontWeight:'900'}}>{avgAttendance}%</Text></View></Card></View>

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
   {members.length?members.map(m=><Card key={m.user_id} style={{padding:13}}><View style={{flexDirection:'row',alignItems:'center',gap:11}}><View style={{width:40,height:40,borderRadius:12,backgroundColor:c.accentSoft,alignItems:'center',justifyContent:'center'}}><Icon name={m.role==='coach'?'coaches':'athletes'} size={18}/></View><View style={{flex:1}}><Text style={{color:c.text,fontSize:12,fontWeight:'900'}}>{m.full_name||m.username||'Member'}</Text><Text style={{color:c.muted,fontSize:9,marginTop:3}}>{m.role.toUpperCase()} · {m.discipline||'Taekwondo'}{m.belt?' · '+m.belt:''}</Text></View><Text style={{color:c.accentBright,fontSize:8,fontWeight:'900'}}>ACTIVE</Text></View></Card>):<Card><Text style={{color:c.text,fontWeight:'900'}}>No connected people yet</Text><Text style={{color:c.muted,fontSize:10,marginTop:4}}>Add coaches here or share the academy code with athletes.</Text></Card>}
  </View>:null}

  {tab==='Training'?<View style={{gap:9}}><Text style={{color:c.text,fontSize:23,fontWeight:'900'}}>Training</Text><Text style={{color:c.muted,fontSize:10}}>Live sessions created by academy coaches.</Text>{sessions.length?sessions.map(s=><Card key={s.id}><Text style={{color:c.text,fontWeight:'900'}}>{s.title}</Text><Text style={{color:c.muted,fontSize:9,marginTop:4}}>{new Date(s.session_date).toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'})} · {s.start_time?.slice(0,5)}</Text></Card>):<Card><Text style={{color:c.text,fontWeight:'900'}}>No sessions yet</Text><Text style={{color:c.muted,fontSize:10,marginTop:4}}>Once a coach creates a regular training group, it appears here.</Text></Card>}</View>:null}

  {tab==='Events'?<View style={{gap:9}}><Text style={{color:c.text,fontSize:23,fontWeight:'900'}}>Competitions</Text><Text style={{color:c.muted,fontSize:10}}>Upcoming Taekwondo events.</Text>{events.length?events.map(e=><Card key={e.id}><View style={{flexDirection:'row',gap:10,alignItems:'center'}}><View style={{width:40,height:40,borderRadius:12,backgroundColor:'#ff9b2f20',alignItems:'center',justifyContent:'center'}}><Icon name="events" size={18} color="#ff9b2f"/></View><View style={{flex:1}}><Text style={{color:c.text,fontWeight:'900'}}>{e.name}</Text><Text style={{color:c.muted,fontSize:9,marginTop:4}}>{new Date(e.starts_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})} · {e.location||'Location TBD'}</Text></View></View></Card>):<Card><Text style={{color:c.text,fontWeight:'900'}}>No upcoming competitions</Text></Card>}</View>:null}

  {tab==='Finance'?<View style={{gap:10}}><Text style={{color:c.text,fontSize:23,fontWeight:'900'}}>Finance</Text><Text style={{color:c.muted,fontSize:10}}>Academy money in one place.</Text><Card accent><Text style={{color:c.muted,fontSize:8,fontWeight:'900'}}>ACADEMY PLAN</Text><Text style={{color:c.text,fontSize:25,fontWeight:'900',marginTop:4}}>₹799 / month</Text><Text style={{color:c.accentBright,fontSize:9,fontWeight:'900',marginTop:4}}>1,000 AI messages / month</Text></Card><Card><Text style={{color:c.text,fontWeight:'900'}}>Finance workspace</Text><Text style={{color:c.muted,fontSize:10,lineHeight:17,marginTop:5}}>Revenue, expenses, pending fees and transactions will be connected to the academy finance records.</Text></Card></View>:null}
 </Screen>;
}
