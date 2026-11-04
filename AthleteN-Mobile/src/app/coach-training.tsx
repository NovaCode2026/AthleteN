import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Screen, Header, Section, Card, Button, RefreshButton, c } from '@/components/mobile-ui';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

const DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
function isValidDateOnly(value:string){
 const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
 if(!match)return false;
 const year=Number(match[1]);const month=Number(match[2]);const day=Number(match[3]);
 if(month<1||month>12||day<1||day>31)return false;
 const date=new Date(Date.UTC(year,month-1,day));
 return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day;
}
type Athlete={user_id:string;full_name?:string|null};
type Group={id:string;name:string;focus_area?:string|null;recurrence_days:string[];start_time?:string|null;duration_minutes:number;active:boolean};
type Session={id:string;group_id:string;session_date:string;start_time?:string|null;title:string;status:string;training_type?:string|null;locked?:boolean};

export default function CoachTraining(){
 const {profile}=useAuth();
 const [athletes,setAthletes]=useState<Athlete[]>([]);
 const [groups,setGroups]=useState<Group[]>([]);
 const [sessions,setSessions]=useState<Session[]>([]);
 const [selectedAthletes,setSelectedAthletes]=useState<string[]>([]);
 const [selectedSession,setSelectedSession]=useState<Session|null>(null);
 const [sessionAthleteIds,setSessionAthleteIds]=useState<string[]>([]);
 const [attendance,setAttendance]=useState<Record<string,string>>({});
 const [attendanceBusy,setAttendanceBusy]=useState(false);
 const [name,setName]=useState('Regular Kyorugi Training');
 const [focus,setFocus]=useState('Kyorugi');
 const [duration,setDuration]=useState('90');
 const [startTime,setStartTime]=useState('17:00');
 const [days,setDays]=useState<string[]>(['Mon','Wed','Fri']);
 const [busy,setBusy]=useState(false); const [extraDate,setExtraDate]=useState(new Date().toISOString().slice(0,10)); const [extraType,setExtraType]=useState('sparring'); const [extraTitle,setExtraTitle]=useState('Extra Sparring'); const [extraTime,setExtraTime]=useState('19:00'); const [extraVenue,setExtraVenue]=useState(''); const [extraNotes,setExtraNotes]=useState(''); const [holidayDate,setHolidayDate]=useState(new Date().toISOString().slice(0,10)); const [holidayReason,setHolidayReason]=useState('Academy holiday'); const [holidayGroup,setHolidayGroup]=useState<string>(''); const [extraGroup,setExtraGroup]=useState<string>('');

 const load=useCallback(async()=>{
  if(!profile?.user_id)return false;
  setLoading(true);
  try{
   const links=await supabase.from('coach_athlete_links').select('athlete_user_id').eq('coach_user_id',profile.user_id).eq('status','active');
   if(links.error)throw links.error;
   const ids=(links.data||[]).map((x:any)=>x.athlete_user_id).filter(Boolean);
   if(ids.length){
    const p=await supabase.from('profiles').select('user_id,full_name').in('user_id',ids);
    if(p.error)throw p.error;
    setAthletes((p.data||[]) as Athlete[]);
   }else setAthletes([]);
   const g=await supabase.from('training_groups').select('id,name,focus_area,recurrence_days,start_time,duration_minutes,active').eq('coach_user_id',profile.user_id).eq('active',true).order('created_at',{ascending:false});
   if(g.error)throw g.error;
   setGroups((g.data||[]) as Group[]);
   const gids=(g.data||[]).map((x:any)=>x.id);
   if(gids.length){
    const s=await supabase.from('training_group_sessions').select('id,group_id,session_date,start_time,title,status,training_type,venue,notes,locked').in('group_id',gids).order('session_date',{ascending:false}).limit(100);
    if(s.error)throw s.error;
    setSessions((s.data||[]) as Session[]);
   }else setSessions([]);
   return true;
  }catch(error){
   Alert.alert('Training data could not be loaded',error instanceof Error?error.message:'Check your connection and retry.');
   return false;
  }finally{setLoading(false);}
 },[profile?.user_id]);

 useEffect(()=>{void load()},[load]);

 const toggleDay=(d:string)=>setDays(v=>v.includes(d)?v.filter(x=>x!==d):[...v,d]);
 const toggleAthlete=(id:string)=>setSelectedAthletes(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);

 async function createGroup(){
  const minutes=Number(duration);
  if(!profile?.user_id||!name.trim()||!days.length||!selectedAthletes.length)return Alert.alert('Complete training setup','Choose a name, at least one weekly day and at least one athlete.');
  if(!Number.isInteger(minutes)||minutes<15||minutes>360)return Alert.alert('Invalid duration','Enter a whole-number duration between 15 and 360 minutes.');
  if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTime))return Alert.alert('Invalid start time','Use 24-hour HH:MM format, for example 17:00.');
  setBusy(true);
  try{
   const {data,error}=await supabase.rpc('create_coach_training_group',{p_name:name.trim(),p_focus:focus.trim(),p_recurrence_days:days,p_start_time:startTime,p_duration_minutes:minutes,p_athlete_ids:selectedAthletes});
   if(error)throw error;
   if(!data)throw new Error('The server did not confirm creation of the training group.');
   setSelectedAthletes([]);
   const refreshed=await load();
   Alert.alert('Training group created',refreshed?'AthleteN generated the regular sessions.':'The group was created, but the list could not refresh. Use refresh or reopen this screen.');
  }catch(error){Alert.alert('Could not create training group',error instanceof Error?error.message:'The request failed.');}
  finally{setBusy(false);}
 }

 async function createExtra(){
  const gid=extraGroup||groups[0]?.id;
  const minutes=Number(duration);
  if(!gid)return Alert.alert('No training group','Create a regular group first.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(extraDate)||Number.isNaN(Date.parse(extraDate+'T00:00:00')))return Alert.alert('Invalid date','Enter the date as YYYY-MM-DD.');
  if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(extraTime))return Alert.alert('Invalid start time','Use 24-hour HH:MM format, for example 19:00.');
  if(!Number.isInteger(minutes)||minutes<15||minutes>360)return Alert.alert('Invalid duration','Enter a whole-number duration between 15 and 360 minutes.');
  setBusy(true);
  try{
   const {data,error}=await supabase.rpc('create_coach_extra_training',{p_group_id:gid,p_session_date:extraDate,p_start_time:extraTime,p_duration_minutes:minutes,p_training_type:extraType,p_title:extraTitle.trim()||'Extra training',p_focus:null,p_venue:extraVenue.trim()||null,p_notes:extraNotes.trim()||null});
   if(error)throw error;
   if(!data)throw new Error('The server did not confirm creation of the extra session.');
   const refreshed=await load();
   Alert.alert('Extra training added',refreshed?'The session is on the group schedule.':'The session was created, but the list could not refresh.');
  }catch(error){Alert.alert('Could not add extra training',error instanceof Error?error.message:'The request failed.');}
  finally{setBusy(false);}
 }

 async function performCancelDate(){
  setBusy(true);
  try{
   const {data,error}=await supabase.rpc('cancel_coach_training_date',{p_date:holidayDate,p_group_id:holidayGroup||null,p_reason:holidayReason.trim()||'Academy holiday'});
   if(error)throw error;
   const refreshed=await load();
   Alert.alert('Training cancelled',String(data||0)+' session(s) cancelled.'+(refreshed?'':' The list could not refresh.'));
  }catch(error){Alert.alert('Could not cancel training',error instanceof Error?error.message:'The request failed.');}
  finally{setBusy(false);}
 }

 function cancelDate(){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(holidayDate)||Number.isNaN(Date.parse(holidayDate+'T00:00:00')))return Alert.alert('Invalid date','Enter the date as YYYY-MM-DD.');
  const scope=holidayGroup?'the selected group':'all active groups';
  Alert.alert('Confirm session cancellation','This will cancel '+scope+' scheduled for '+holidayDate+'. Continue?',[
   {text:'Keep sessions',style:'cancel'},
   {text:'Cancel training',style:'destructive',onPress:()=>void performCancelDate()}
  ]);
 }
 async function markAllPresent(){
  const session=selectedSession;
  if(!session||session.status==='cancelled'||session.locked||attendanceBusy)return;
  const saveAll=async()=>{
   setAttendanceBusy(true);
   try{
    const m=await supabase.from('training_group_members').select('athlete_user_id').eq('group_id',session.group_id).eq('status','active');
    if(m.error)throw m.error;
    const ids=[...new Set((m.data||[]).map((x:any)=>x.athlete_user_id).filter(Boolean))];
    if(!ids.length){Alert.alert('No active athletes','There are no active athletes in this training group.');return;}
    const {error}=await supabase.from('training_group_attendance').upsert(
     ids.map(id=>({session_id:session.id,athlete_user_id:id,status:'present',updated_at:new Date().toISOString()})),
     {onConflict:'session_id,athlete_user_id'}
    );
    if(error)throw error;
    setAttendance(current=>({...current,...Object.fromEntries(ids.map(id=>[id,'present']))}));
    Alert.alert('Attendance saved',ids.length+' active athlete(s) marked present.');
   }catch(error){Alert.alert('Attendance not saved',error instanceof Error?error.message:'The attendance update failed.');}
   finally{setAttendanceBusy(false);}
  };

  // A "mark all" tap must not silently erase existing absence, late or excused records.
  const existingOverrides=sessionAthleteIds.filter(id=>Boolean(attendance[id])&&attendance[id]!=='present').length;
  if(existingOverrides>0){
   Alert.alert(
    'Replace existing attendance?',
    'This will replace '+existingOverrides+' saved non-present status(es) with Present. Continue only if every active athlete was present.',
    [
     {text:'Keep current records',style:'cancel'},
     {text:'Mark everyone present',style:'destructive',onPress:()=>void saveAll()}
    ]
   );
   return;
  }
  await saveAll();
 }
 async function lockAttendance(){
  const session=selectedSession;
  if(!session||attendanceBusy||session.locked||session.status==='cancelled')return;
  setAttendanceBusy(true);
  try{
   const {data,error}=await supabase.from('training_group_sessions').update({locked:true,updated_at:new Date().toISOString()}).eq('id',session.id).eq('locked',false).select('id,locked').maybeSingle();
   if(error)throw error;
   if(!data?.locked)throw new Error('The session could not be locked. Refresh attendance and try again.');
   setSelectedSession({...session,locked:true});
   Alert.alert('Attendance locked','This session can no longer be edited.');
  }catch(error){Alert.alert('Could not lock attendance',error instanceof Error?error.message:'The session could not be locked.');}
  finally{setAttendanceBusy(false);}
 }
 async function openAttendance(s:Session){
  if(attendanceBusy)return;
  setAttendanceBusy(true);
  setSelectedSession(s);
  setAttendance({});
  setSessionAthleteIds([]);
  try{
   const [attendanceResult,membersResult]=await Promise.all([
    supabase.from('training_group_attendance').select('athlete_user_id,status').eq('session_id',s.id),
    supabase.from('training_group_members').select('athlete_user_id').eq('group_id',s.group_id).eq('status','active')
   ]);
   if(attendanceResult.error)throw attendanceResult.error;
   if(membersResult.error)throw membersResult.error;
   const map:Record<string,string>={};
   for(const row of attendanceResult.data||[])map[row.athlete_user_id]=row.status||'absent';
   setAttendance(map);
   setSessionAthleteIds([...new Set((membersResult.data||[]).map((row:any)=>row.athlete_user_id).filter(Boolean))]);
  }catch(error){
   setSelectedSession(null);
   Alert.alert('Attendance could not be loaded',error instanceof Error?error.message:'Refresh and try again.');
  }finally{setAttendanceBusy(false);}
 }

 async function setAttendanceStatus(id:string,status:string){
  const session=selectedSession;
  if(!session||attendanceBusy||session.locked||session.status==='cancelled')return;
  const previous=attendance[id]||'absent';
  setAttendanceBusy(true);
  setAttendance(current=>({...current,[id]:status}));
  try{
   const {error}=await supabase.from('training_group_attendance').upsert(
    {session_id:session.id,athlete_user_id:id,status,updated_at:new Date().toISOString()},
    {onConflict:'session_id,athlete_user_id'}
   );
   if(error)throw error;
  }catch(error){
   setAttendance(current=>({...current,[id]:previous}));
   Alert.alert('Attendance not saved',error instanceof Error?error.message:'The attendance update failed.');
  }finally{setAttendanceBusy(false);}
 }

 const selectedMemberCount=selectedSession?sessionAthleteIds.length:0; const attendanceCounts=useMemo(()=>{const vals=sessionAthleteIds.map(id=>attendance[id]||'absent');return {present:vals.filter(v=>v==='present').length,late:vals.filter(v=>v==='late').length,absent:vals.filter(v=>v==='absent').length,excused:vals.filter(v=>v==='excused').length}},[sessionAthleteIds,attendance]); const selectedGroupName=useMemo(()=>selectedSession?groups.find(g=>g.id===selectedSession.group_id)?.name:'', [selectedSession,groups]); const TYPES=['sparring','poomsae','technique','kicking','footwork','defense','pads','strength','endurance','mobility','tactics','tournament','grading','camp','recovery','other'];

 return <Screen>
  <Header back eyebrow="COACH / TRAINING" title="Training Control" subtitle="Build regular weekly training, assign athletes, and mark attendance session by session." right={<RefreshButton onPress={()=>void load()} busy={loading}/>} />
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
   {sessions.length?sessions.map(s=><Pressable key={s.id} disabled={attendanceBusy} onPress={()=>void openAttendance(s)}><Card><View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><View style={{flex:1}}><Text style={{color:c.text,fontWeight:'900'}}>{s.title}</Text><Text style={{color:c.muted,fontSize:10,marginTop:3}}>{s.session_date} · {s.start_time||'Time not set'} · {(s.training_type||'regular').toUpperCase()}</Text></View><Text style={{color:s.status==='cancelled'?'#ff7082':c.accentBright,fontWeight:'900'}}>{s.status==='cancelled'?'OFF':'ATTEND ›'}</Text></View></Card></Pressable>):<Card><Text style={{color:c.muted}}>No training sessions yet.</Text></Card>}
  </Section>
  {selectedSession?<Section title={'ATTENDANCE · '+selectedGroupName}><Card><Text style={{color:c.text,fontWeight:'900'}}>{selectedSession.title}</Text><Text style={{color:c.muted,fontSize:10,marginBottom:8}}>{selectedSession.session_date} · {selectedMemberCount} athletes · {selectedSession.locked?'Attendance locked':'Tap a status to update.'}</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:6,marginBottom:10}}><Text style={{color:c.success,fontSize:9,fontWeight:'900'}}>PRESENT {attendanceCounts.present}</Text><Text style={{color:c.warning,fontSize:9,fontWeight:'900'}}>LATE {attendanceCounts.late}</Text><Text style={{color:c.danger,fontSize:9,fontWeight:'900'}}>ABSENT {attendanceCounts.absent}</Text><Text style={{color:c.muted,fontSize:9,fontWeight:'900'}}>EXCUSED {attendanceCounts.excused}</Text></View><Pressable disabled={attendanceBusy||selectedSession.locked||selectedSession.status==='cancelled'} onPress={()=>void markAllPresent()}><Text style={{color:c.accentBright,fontWeight:'900',fontSize:10,marginBottom:8}}>MARK ALL PRESENT</Text></Pressable>{athletes.filter(a=>sessionAthleteIds.includes(a.user_id)).map(a=><View key={a.user_id} style={{padding:10,borderRadius:11,borderWidth:1,borderColor:c.border,marginBottom:6}}><View style={{flexDirection:'row',justifyContent:'space-between'}}><Text style={{color:c.text,fontWeight:'900'}}>{a.full_name||'Athlete'}</Text><Text style={{color:c.muted,fontSize:9,fontWeight:'900'}}>{(attendance[a.user_id]||'absent').toUpperCase()}</Text></View><View style={{flexDirection:'row',gap:5,marginTop:8}}>{['present','late','absent','excused'].map(st=><Pressable key={st} disabled={attendanceBusy||selectedSession.locked||selectedSession.status==='cancelled'} onPress={()=>void setAttendanceStatus(a.user_id,st)} style={{paddingVertical:6,paddingHorizontal:7,borderRadius:8,borderWidth:1,borderColor:attendance[a.user_id]===st?c.accent:c.border}}><Text style={{color:attendance[a.user_id]===st?c.accentBright:c.muted,fontSize:8,fontWeight:'900'}}>{st.toUpperCase()}</Text></Pressable>)}</View></View>)}<Button title="LOCK ATTENDANCE" onPress={()=>void lockAttendance()} busy={busy||attendanceBusy}/></Card></Section>:null}
 
  
</Screen>;
}
const input={backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:12,color:c.text,padding:12,fontSize:12,marginBottom:8} as any;
const label={color:c.muted,fontSize:9,fontWeight:'900',letterSpacing:1,marginTop:4,marginBottom:7} as any;
