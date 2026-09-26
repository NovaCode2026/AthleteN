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
 const [attendance,setAttendance]=useState<Record<string,string>>({});
 const [name,setName]=useState('Regular Kyorugi Training');
 const [focus,setFocus]=useState('Kyorugi');
 const [duration,setDuration]=useState('90');
 const [startTime,setStartTime]=useState('17:00');
 const [days,setDays]=useState<string[]>(['Mon','Wed','Fri']);
 const [busy,setBusy]=useState(false); const [extraDate,setExtraDate]=useState(new Date().toISOString().slice(0,10)); const [extraType,setExtraType]=useState('sparring'); const [extraTitle,setExtraTitle]=useState('Extra Sparring'); const [extraTime,setExtraTime]=useState('19:00'); const [extraVenue,setExtraVenue]=useState(''); const [extraNotes,setExtraNotes]=useState(''); const [holidayDate,setHolidayDate]=useState(new Date().toISOString().slice(0,10)); const [holidayReason,setHolidayReason]=useState('Academy holiday'); const [holidayGroup,setHolidayGroup]=useState<string>(''); const [extraGroup,setExtraGroup]=useState<string>('');

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
   const s=await supabase.from('training_group_sessions').select('id,group_id,session_date,start_time,title,status,training_type,venue,notes,locked').in('group_id',gids).order('session_date',{ascending:false}).limit(100);
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

 async function createExtra(){ const gid=extraGroup||groups[0]?.id; if(!gid)return Alert.alert('No training group','Create a regular group first.'); const {error}=await supabase.rpc('create_coach_extra_training',{p_group_id:gid,p_session_date:extraDate,p_start_time:extraTime,p_duration_minutes:Number(duration)||90,p_training_type:extraType,p_title:extraTitle.trim()||'Extra training',p_focus:null,p_venue:extraVenue.trim()||null,p_notes:extraNotes.trim()||null}); if(error)Alert.alert('Could not add extra training',error.message); else {await load();Alert.alert('Extra training added','The session is now on the group schedule.');} }
 async function cancelDate(){ const {data,error}=await supabase.rpc('cancel_coach_training_date',{p_date:holidayDate,p_group_id:holidayGroup||null,p_reason:holidayReason.trim()||'Academy holiday'}); if(error)Alert.alert('Could not cancel training',error.message); else {await load();Alert.alert('Training cancelled',String(data||0)+' session(s) cancelled. The group chat and notifications were updated automatically.');} }
 async function markAllPresent(){ if(!selectedSession||selectedSession.status==='cancelled'||selectedSession.locked)return; const m=await supabase.from('training_group_members').select('athlete_user_id').eq('group_id',selectedSession.group_id).eq('status','active'); const ids=(m.data||[]).map((x:any)=>x.athlete_user_id); const {error}=await supabase.from('training_group_attendance').upsert(ids.map(id=>({session_id:selectedSession.id,athlete_user_id:id,status:'present',updated_at:new Date().toISOString()})),{onConflict:'session_id,athlete_user_id'}); if(error)Alert.alert('Attendance not saved',error.message); else setAttendance(Object.fromEntries(ids.map(id=>[id,'present']))); }
 async function lockAttendance(){ if(!selectedSession)return; const {error}=await supabase.from('training_group_sessions').update({locked:true,updated_at:new Date().toISOString()}).eq('id',selectedSession.id).eq('locked',false); if(error)Alert.alert('Could not lock attendance',error.message); else {setSelectedSession({...selectedSession,locked:true});Alert.alert('Attendance locked','This session can no longer be edited.');} }
 async function openAttendance(s:Session){
  setSelectedSession(s);
  const {data}=await supabase.from('training_group_attendance').select('athlete_user_id,status').eq('session_id',s.id);
  const map:Record<string,string>={}; for(const a of data||[])map[a.athlete_user_id]=a.status||'absent'; setAttendance(map);
  const m=await supabase.from('training_group_members').select('athlete_user_id').eq('group_id',s.group_id).eq('status','active');
  setSelectedAthletes((m.data||[]).map((x:any)=>x.athlete_user_id));
 }

 async function toggleAttendance(id:string){ const next=attendance[id]==='present'?'absent':'present'; setAttendance(v=>({...v,[id]:next})); const {error}=await supabase.from('training_group_attendance').upsert({session_id:selectedSession?.id,athlete_user_id:id,status:next,updated_at:new Date().toISOString()},{onConflict:'session_id,athlete_user_id'}); if(error)Alert.alert('Attendance not saved',error.message); }

 const selectedMemberCount=selectedSession?selectedAthletes.length:0; const attendanceCounts=useMemo(()=>{const vals=Object.values(attendance);return {present:vals.filter(v=>v==='present').length,late:vals.filter(v=>v==='late').length,absent:vals.filter(v=>v==='absent').length,excused:vals.filter(v=>v==='excused').length}},[attendance]); const selectedGroupName=useMemo(()=>selectedSession?groups.find(g=>g.id===selectedSession.group_id)?.name:'', [selectedSession,groups]); const TYPES=['sparring','poomsae','technique','kicking','footwork','defense','pads','strength','endurance','mobility','tactics','tournament','grading','camp','recovery','other'];

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
  <Section title="EXTRA / SPECIAL TRAINING"><Card><Text style={label}>GROUP</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:7,marginBottom:8}}>{groups.map(g=><Pressable key={g.id} onPress={()=>setExtraGroup(g.id)} style={{padding:9,borderRadius:10,borderWidth:1,borderColor:(extraGroup||groups[0]?.id)===g.id?c.accent:c.border}}><Text style={{color:(extraGroup||groups[0]?.id)===g.id?c.accentBright:c.muted,fontWeight:'900',fontSize:10}}>{g.name}</Text></Pressable>)}</View><TextInput value={extraDate} onChangeText={setExtraDate} placeholder="YYYY-MM-DD" placeholderTextColor={c.muted} style={input}/><View style={{flexDirection:'row',flexWrap:'wrap',gap:6,marginBottom:8}}>{TYPES.map(t=><Pressable key={t} onPress={()=>{setExtraType(t);setExtraTitle(t[0].toUpperCase()+t.slice(1)+' Training')}} style={{paddingVertical:7,paddingHorizontal:9,borderRadius:9,borderWidth:1,borderColor:extraType===t?c.accent:c.border}}><Text style={{color:extraType===t?c.accentBright:c.muted,fontSize:9,fontWeight:'900'}}>{t.toUpperCase()}</Text></Pressable>)}</View><View style={{flexDirection:'row',gap:8}}><TextInput value={extraTime} onChangeText={setExtraTime} placeholder="19:00" placeholderTextColor={c.muted} style={[input,{flex:1}]}/><TextInput value={duration} onChangeText={setDuration} placeholder="90" keyboardType="number-pad" placeholderTextColor={c.muted} style={[input,{flex:1}]}/></View><TextInput value={extraTitle} onChangeText={setExtraTitle} placeholder="Session title" placeholderTextColor={c.muted} style={input}/><TextInput value={extraVenue} onChangeText={setExtraVenue} placeholder="Venue (optional)" placeholderTextColor={c.muted} style={input}/><TextInput value={extraNotes} onChangeText={setExtraNotes} placeholder="Session notes" placeholderTextColor={c.muted} style={[input,{minHeight:60,textAlignVertical:'top'}]}/><Button title="ADD EXTRA TRAINING" onPress={()=>void createExtra()} busy={busy}/></Card></Section>
  <Section title="HOLIDAY / CANCEL TRAINING"><Card><Text style={{color:c.text,fontWeight:'900'}}>Mark a day off</Text><Text style={{color:c.muted,fontSize:10,marginTop:3,marginBottom:8}}>Cancelled sessions do not count as absences. AthleteN automatically posts the update to the affected group chat and creates notifications.</Text><TextInput value={holidayDate} onChangeText={setHolidayDate} placeholder="YYYY-MM-DD" placeholderTextColor={c.muted} style={input}/><View style={{flexDirection:'row',flexWrap:'wrap',gap:7,marginBottom:8}}><Pressable onPress={()=>setHolidayGroup('')} style={{padding:9,borderRadius:10,borderWidth:1,borderColor:holidayGroup===''?c.accent:c.border}}><Text style={{color:holidayGroup===''?c.accentBright:c.muted,fontSize:9,fontWeight:'900'}}>ALL GROUPS</Text></Pressable>{groups.map(g=><Pressable key={g.id} onPress={()=>setHolidayGroup(g.id)} style={{padding:9,borderRadius:10,borderWidth:1,borderColor:holidayGroup===g.id?c.accent:c.border}}><Text style={{color:holidayGroup===g.id?c.accentBright:c.muted,fontSize:9,fontWeight:'900'}}>{g.name}</Text></Pressable>)}</View><TextInput value={holidayReason} onChangeText={setHolidayReason} placeholder="Reason" placeholderTextColor={c.muted} style={input}/><Button title={holidayGroup?'CANCEL SELECTED GROUP DAY':'CANCEL ALL GROUPS THAT DAY'} onPress={()=>void cancelDate()} busy={busy}/></Card></Section>
  <Section title="ACTIVE TRAINING GROUPS">
   {groups.length?groups.map(g=><Card key={g.id}><View style={{flexDirection:'row',justifyContent:'space-between',gap:10}}><View style={{flex:1}}><Text style={{color:c.text,fontSize:15,fontWeight:'900'}}>{g.name}</Text><Text style={{color:c.muted,fontSize:10,marginTop:3}}>{g.focus_area||'Training'} · {g.recurrence_days.join(' · ')} · {g.start_time||'Time not set'}</Text></View><Text style={{color:c.accentBright,fontWeight:'900'}}>{g.duration_minutes}m</Text></View></Card>):<Card accent><Text style={{color:c.text,fontWeight:'900'}}>No regular groups yet</Text><Text style={{color:c.muted,fontSize:10,marginTop:3}}>Create one above and AthleteN will generate recurring sessions.</Text></Card>}
  </Section>
  <Section title="SESSIONS / ATTENDANCE">
   {sessions.length?sessions.map(s=><Pressable key={s.id} onPress={()=>void openAttendance(s)}><Card><View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><View style={{flex:1}}><Text style={{color:c.text,fontWeight:'900'}}>{s.title}</Text><Text style={{color:c.muted,fontSize:10,marginTop:3}}>{s.session_date} · {s.start_time||'Time not set'} · {(s.training_type||'regular').toUpperCase()}</Text></View><Text style={{color:s.status==='cancelled'?'#ff7082':c.accentBright,fontWeight:'900'}}>{s.status==='cancelled'?'OFF':'ATTEND ›'}</Text></View></Card></Pressable>):<Card><Text style={{color:c.muted}}>No training sessions yet.</Text></Card>}
  </Section>
  {selectedSession?<Section title={'ATTENDANCE · '+selectedGroupName}><Card><Text style={{color:c.text,fontWeight:'900'}}>{selectedSession.title}</Text><Text style={{color:c.muted,fontSize:10,marginBottom:8}}>{selectedSession.session_date} · {selectedMemberCount} athletes · {selectedSession.locked?'Attendance locked':'Tap a status to update.'}</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:6,marginBottom:10}}><Text style={{color:c.success,fontSize:9,fontWeight:'900'}}>PRESENT {attendanceCounts.present}</Text><Text style={{color:c.warning,fontSize:9,fontWeight:'900'}}>LATE {attendanceCounts.late}</Text><Text style={{color:c.danger,fontSize:9,fontWeight:'900'}}>ABSENT {attendanceCounts.absent}</Text><Text style={{color:c.muted,fontSize:9,fontWeight:'900'}}>EXCUSED {attendanceCounts.excused}</Text></View><Pressable disabled={selectedSession.locked||selectedSession.status==='cancelled'} onPress={()=>void markAllPresent()}><Text style={{color:c.accentBright,fontWeight:'900',fontSize:10,marginBottom:8}}>MARK ALL PRESENT</Text></Pressable>{athletes.filter(a=>selectedAthletes.includes(a.user_id)).map(a=><View key={a.user_id} style={{padding:10,borderRadius:11,borderWidth:1,borderColor:c.border,marginBottom:6}}><View style={{flexDirection:'row',justifyContent:'space-between'}}><Text style={{color:c.text,fontWeight:'900'}}>{a.full_name||'Athlete'}</Text><Text style={{color:c.muted,fontSize:9,fontWeight:'900'}}>{(attendance[a.user_id]||'absent').toUpperCase()}</Text></View><View style={{flexDirection:'row',gap:5,marginTop:8}}>{['present','late','absent','excused'].map(st=><Pressable key={st} disabled={selectedSession.locked||selectedSession.status==='cancelled'} onPress={()=>void (async()=>{setAttendance(v=>({...v,[a.user_id]:st}));const {error}=await supabase.from('training_group_attendance').upsert({session_id:selectedSession.id,athlete_user_id:a.user_id,status:st,updated_at:new Date().toISOString()},{onConflict:'session_id,athlete_user_id'});if(error)Alert.alert('Attendance not saved',error.message);})()} style={{paddingVertical:6,paddingHorizontal:7,borderRadius:8,borderWidth:1,borderColor:attendance[a.user_id]===st?c.accent:c.border}}><Text style={{color:attendance[a.user_id]===st?c.accentBright:c.muted,fontSize:8,fontWeight:'900'}}>{st.toUpperCase()}</Text></Pressable>)}</View></View>)}<Button title="LOCK ATTENDANCE" onPress={()=>void lockAttendance()} busy={busy}/></Card></Section>:null}
 
  
</Screen>;
}
const input={backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:12,color:c.text,padding:12,fontSize:12,marginBottom:8} as any;
const label={color:c.muted,fontSize:9,fontWeight:'900',letterSpacing:1,marginTop:4,marginBottom:7} as any;
