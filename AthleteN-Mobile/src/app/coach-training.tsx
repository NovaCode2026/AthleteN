import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Screen, Header, Section, Card, Button, c } from '@/components/mobile-ui';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

const DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
type Athlete={user_id:string;full_name?:string|null};
type Group={id:string;name:string;focus_area?:string|null;recurrence_days:string[];start_time?:string|null;duration_minutes:number;active:boolean};
type Session={id:string;group_id:string;session_date:string;start_time?:string|null;title:string;status:string};

export default function CoachTraining(){
 const {profile}=useAuth();
 const [athletes,setAthletes]=useState<Athlete[]>([]);
 const [groups,setGroups]=useState<Group[]>([]);
 const [sessions,setSessions]=useState<Session[]>([]);
 const [selectedAthletes,setSelectedAthletes]=useState<string[]>([]);
 const [selectedSession,setSelectedSession]=useState<Session|null>(null);
 const [attendance,setAttendance]=useState<Record<string,boolean>>({});
 const [name,setName]=useState('Regular Kyorugi Training');
 const [focus,setFocus]=useState('Kyorugi');
 const [duration,setDuration]=useState('90');
 const [startTime,setStartTime]=useState('17:00');
 const [days,setDays]=useState<string[]>(['Mon','Wed','Fri']);
 const [busy,setBusy]=useState(false);

 const load=useCallback(async()=>{
  if(!profile?.user_id)return;
  const links=await supabase.from('coach_athlete_links').select('athlete_user_id').eq('coach_user_id',profile.user_id).eq('status','active');
  const ids=(links.data||[]).map((x:any)=>x.athlete_user_id);
  if(ids.length){
   const p=await supabase.from('profiles').select('user_id,full_name').in('user_id',ids);
   setAthletes((p.data||[]) as Athlete[]);
  } else setAthletes([]);
  const g=await supabase.from('training_groups').select('id,name,focus_area,recurrence_days,start_time,duration_minutes,active').eq('coach_user_id',profile.user_id).eq('active',true).order('created_at',{ascending:false});
  setGroups((g.data||[]) as Group[]);
  const gids=(g.data||[]).map((x:any)=>x.id);
  if(gids.length){
   const s=await supabase.from('training_group_sessions').select('id,group_id,session_date,start_time,title,status').in('group_id',gids).gte('session_date',new Date().toISOString().slice(0,10)).order('session_date',{ascending:true}).limit(30);
   setSessions((s.data||[]) as Session[]);
  } else setSessions([]);
 },[profile?.user_id]);

 useEffect(()=>{void load()},[load]);

 const toggleDay=(d:string)=>setDays(v=>v.includes(d)?v.filter(x=>x!==d):[...v,d]);
 const toggleAthlete=(id:string)=>setSelectedAthletes(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);

 async function createGroup(){
  if(!profile?.user_id||!name.trim()||!days.length||!selectedAthletes.length)return Alert.alert('Complete training setup','Choose a name, at least one weekly day and at least one athlete.');
  setBusy(true);
  const {data,error}=await supabase.rpc('create_coach_training_group',{p_name:name.trim(),p_focus:focus.trim(),p_recurrence_days:days,p_start_time:startTime,p_duration_minutes:Number(duration)||90,p_athlete_ids:selectedAthletes});
  setBusy(false);
  if(error)Alert.alert('Could not create training group',error.message);
  else{setSelectedAthletes([]);await load();Alert.alert('Training group created','AthleteN generated the next 8 weeks of regular sessions.');}
 }

 async function openAttendance(s:Session){
  setSelectedSession(s);
  const {data}=await supabase.from('training_group_attendance').select('athlete_user_id,status').eq('session_id',s.id);
  const map:Record<string,boolean>={}; for(const a of data||[])map[a.athlete_user_id]=a.status==='present'; setAttendance(map);
  const m=await supabase.from('training_group_members').select('athlete_user_id').eq('group_id',s.group_id).eq('status','active');
  setSelectedAthletes((m.data||[]).map((x:any)=>x.athlete_user_id));
 }

 async function toggleAttendance(id:string){
  if(!selectedSession)return;
  const next=!attendance[id]; setAttendance(v=>({...v,[id]:next}));
  if(next) await supabase.from('training_group_attendance').upsert({session_id:selectedSession.id,athlete_user_id:id,status:'present'},{onConflict:'session_id,athlete_user_id'});
  else await supabase.from('training_group_attendance').delete().eq('session_id',selectedSession.id).eq('athlete_user_id',id);
 }

 const selectedGroupName=useMemo(()=>selectedSession?groups.find(g=>g.id===selectedSession.group_id)?.name:'', [selectedSession,groups]);

 return <Screen>
  <Header back eyebrow="COACH / TRAINING" title="Training Control" subtitle="Build regular weekly training, assign athletes, and mark attendance session by session."/>
  <Section title="CREATE REGULAR TRAINING">
   <Card>
    <TextInput value={name} onChangeText={setName} placeholder="Training group name" placeholderTextColor={c.muted} style={input}/>
    <TextInput value={focus} onChangeText={setFocus} placeholder="Focus: Kyorugi, Poomsae..." placeholderTextColor={c.muted} style={input}/>
    <View style={{flexDirection:'row',gap:8}}><TextInput value={startTime} onChangeText={setStartTime} placeholder="17:00" placeholderTextColor={c.muted} style={[input,{flex:1}]}/><TextInput value={duration} onChangeText={setDuration} placeholder="90" keyboardType="number-pad" placeholderTextColor={c.muted} style={[input,{flex:1}]}/></View>
    <Text style={label}>WEEKLY SCHEDULE</Text>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:7}}>{DAYS.map(d=><Pressable key={d} onPress={()=>toggleDay(d)} style={{paddingVertical:9,paddingHorizontal:11,borderRadius:10,borderWidth:1,borderColor:days.includes(d)?c.accent:c.border,backgroundColor:days.includes(d)?c.accentSoft:c.surface}}><Text style={{color:days.includes(d)?c.accentBright:c.muted,fontWeight:'900',fontSize:10}}>{d}</Text></Pressable>)}</View>
    <Text style={label}>ATHLETES</Text>
    {athletes.length?athletes.map(a=><Pressable key={a.user_id} onPress={()=>toggleAthlete(a.user_id)} style={{padding:10,borderRadius:11,borderWidth:1,borderColor:selectedAthletes.includes(a.user_id)?c.accent:c.border,marginBottom:6}}><Text style={{color:c.text,fontWeight:'900'}}>{selectedAthletes.includes(a.user_id)?'✓ ':''}{a.full_name||'Athlete'}</Text></Pressable>):<Text style={{color:c.muted,fontSize:10}}>Connect athletes first.</Text>}
    <Button title="CREATE WEEKLY TRAINING GROUP" onPress={()=>void createGroup()} busy={busy}/>
   </Card>
  </Section>
  <Section title="ACTIVE TRAINING GROUPS">
   {groups.length?groups.map(g=><Card key={g.id}><View style={{flexDirection:'row',justifyContent:'space-between',gap:10}}><View style={{flex:1}}><Text style={{color:c.text,fontSize:15,fontWeight:'900'}}>{g.name}</Text><Text style={{color:c.muted,fontSize:10,marginTop:3}}>{g.focus_area||'Training'} · {g.recurrence_days.join(' · ')} · {g.start_time||'Time not set'}</Text></View><Text style={{color:c.accentBright,fontWeight:'900'}}>{g.duration_minutes}m</Text></View></Card>):<Card accent><Text style={{color:c.text,fontWeight:'900'}}>No regular groups yet</Text><Text style={{color:c.muted,fontSize:10,marginTop:3}}>Create one above and AthleteN will generate recurring sessions.</Text></Card>}
  </Section>
  <Section title="UPCOMING SESSIONS">
   {sessions.length?sessions.map(s=><Pressable key={s.id} onPress={()=>void openAttendance(s)}><Card><View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><View style={{flex:1}}><Text style={{color:c.text,fontWeight:'900'}}>{s.title}</Text><Text style={{color:c.muted,fontSize:10,marginTop:3}}>{s.session_date} · {s.start_time||'Time not set'}</Text></View><Text style={{color:c.accentBright,fontWeight:'900'}}>ATTEND ›</Text></View></Card></Pressable>):<Card><Text style={{color:c.muted}}>No upcoming sessions.</Text></Card>}
  </Section>
  {selectedSession?<Section title={'ATTENDANCE · '+selectedGroupName}><Card><Text style={{color:c.text,fontWeight:'900'}}>{selectedSession.title}</Text><Text style={{color:c.muted,fontSize:10,marginBottom:8}}>{selectedSession.session_date} · Tap each athlete to mark present.</Text>{athletes.filter(a=>selectedAthletes.includes(a.user_id)).map(a=><Pressable key={a.user_id} onPress={()=>void toggleAttendance(a.user_id)} style={{padding:11,borderRadius:11,borderWidth:1,borderColor:attendance[a.user_id]?c.success:c.border,backgroundColor:attendance[a.user_id]?'#073d24':c.surface,marginBottom:6}}><Text style={{color:attendance[a.user_id]?c.success:c.text,fontWeight:'900'}}>{attendance[a.user_id]?'✓ PRESENT':'○ ABSENT'} · {a.full_name||'Athlete'}</Text></Pressable>)}</Card></Section>:null}
 </Screen>;
}
const input={backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:12,color:c.text,padding:12,fontSize:12,marginBottom:8} as any;
const label={color:c.muted,fontSize:9,fontWeight:'900',letterSpacing:1,marginTop:4,marginBottom:7} as any;
