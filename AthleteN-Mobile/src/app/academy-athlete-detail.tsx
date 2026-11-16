// @ts-nocheck
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, Header, Section, Card, c, Icon } from '@/components/mobile-ui';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

const pad=(value:number)=>String(value).padStart(2,'0');
const dayKey=(date:Date)=>date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate());
const parseDay=(value:string)=>new Date(String(value).slice(0,10)+'T12:00:00');
const prettyDate=(value?:string|null)=>value?parseDay(String(value)).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):'Date not set';
const statusColor=(status:string)=>status==='present'?c.success:status==='late'?c.warning:status==='absent'?c.danger:status==='excused'?c.muted:c.textSecondary;

function Stat({label,value,color=c.text}:{label:string;value:string|number;color?:string}){
 return <View style={{flexGrow:1,flexBasis:'30%',minWidth:88,backgroundColor:c.background,borderWidth:1,borderColor:c.border,borderRadius:14,padding:12,gap:5}}>
  <Text style={{color:c.muted,fontSize:8,fontWeight:'900',letterSpacing:.8}}>{label.toUpperCase()}</Text>
  <Text style={{color,fontSize:22,fontWeight:'900'}}>{value}</Text>
 </View>;
}
function Empty({text}:{text:string}){
 return <Card><Text style={{color:c.muted,fontSize:10,lineHeight:16}}>{text}</Text></Card>;
}
function DataRow({title,subtitle,right}:{title:string;subtitle?:string;right?:string}){
 return <View style={{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:9,borderBottomWidth:1,borderBottomColor:c.border}}>
  <View style={{flex:1,gap:3}}><Text style={{color:c.text,fontSize:12,fontWeight:'800'}}>{title}</Text>{subtitle?<Text style={{color:c.muted,fontSize:9,lineHeight:14}}>{subtitle}</Text>:null}</View>
  {right?<Text style={{color:c.accentBright,fontSize:10,fontWeight:'900'}}>{right}</Text>:null}
 </View>;
}

export default function AcademyAthleteDetail(){
 const params=useLocalSearchParams<{athleteId?:string|string[]}>();
 const athleteId=Array.isArray(params.athleteId)?params.athleteId[0]:String(params.athleteId||'');
 const router=useRouter();
 const {profile,syncVersion}=useAuth();
 const academyId=String(profile?.academy_id||'');
 const isAcademyAdmin=profile?.role==='academy_admin'||profile?.role==='academy';
 const [athlete,setAthlete]=useState<any>(null);
 const [membership,setMembership]=useState<any>(null);
 const [training,setTraining]=useState<any[]>([]);
 const [plans,setPlans]=useState<any[]>([]);
 const [calendarEvents,setCalendarEvents]=useState<any[]>([]);
 const [tournaments,setTournaments]=useState<any[]>([]);
 const [matches,setMatches]=useState<any[]>([]);
 const [medals,setMedals]=useState<any[]>([]);
 const [weights,setWeights]=useState<any[]>([]);
 const [goals,setGoals]=useState<any[]>([]);
 const [injuries,setInjuries]=useState<any[]>([]);
 const [certificates,setCertificates]=useState<any[]>([]);
 const [documents,setDocuments]=useState<any[]>([]);
 const [groups,setGroups]=useState<any[]>([]);
 const [groupSessions,setGroupSessions]=useState<any[]>([]);
 const [attendance,setAttendance]=useState<any[]>([]);
 const [month,setMonth]=useState(new Date(new Date().getFullYear(),new Date().getMonth(),1));
 const [selectedDay,setSelectedDay]=useState(dayKey(new Date()));
 const [loading,setLoading]=useState(true);
 const [refreshing,setRefreshing]=useState(false);
 const [error,setError]=useState('');
 const [warnings,setWarnings]=useState<string[]>([]);

 const load=useCallback(async()=>{
  if(!athleteId||!academyId||!isAcademyAdmin){
   setError('This athlete detail is available only to an authorised Academy Admin.');
   setLoading(false);
   return;
  }
  setLoading(true);
  setError('');
  const nextWarnings:string[]=[];
  try{
   const memberResult=await supabase.from('academy_memberships')
    .select('user_id,role,status,joined_at')
    .eq('academy_id',academyId).eq('user_id',athleteId).eq('role','athlete').eq('status','active').maybeSingle();
   if(memberResult.error)throw memberResult.error;
   if(!memberResult.data)throw new Error('This athlete is not an active member of your academy.');
   const profileResult=await supabase.from('profiles')
    .select('user_id,full_name,username,profile_image_path,sport,discipline,belt,weight_kg,height_cm,competition_weight_category,competition_weight_category_updated_at,academy,coach,achievements,verified_athlete,founder_badge,club,gender')
    .eq('user_id',athleteId).maybeSingle();
   if(profileResult.error)throw profileResult.error;
   if(!profileResult.data)throw new Error('The athlete profile could not be found or is not visible to this academy.');
   setMembership(memberResult.data);
   setAthlete(profileResult.data);

   const results=await Promise.all([
    supabase.from('training_sessions').select('id,title,session_date,minutes,intensity,notes').eq('user_id',athleteId).order('session_date',{ascending:false}).limit(50),
    supabase.from('training_plans').select('id,title,focus_area,starts_at,ends_at,status,notes').eq('user_id',athleteId).order('created_at',{ascending:false}).limit(20),
    supabase.from('calendar_events').select('id,title,event_type,event_date,reminder_at,notes').eq('user_id',athleteId).order('event_date',{ascending:false}).limit(150),
    supabase.from('tournaments').select('id,name,starts_at,location,status,result,discipline,sport,verification_status').eq('user_id',athleteId).order('starts_at',{ascending:false}).limit(60),
    supabase.from('matches').select('id,tournament_id,opponent_name,division,round_name,result,score,notes,created_at').eq('user_id',athleteId).order('created_at',{ascending:false}).limit(80),
    supabase.from('medals').select('id,event_name,medal_type,category,awarded_at,result_notes,sport,discipline,verification_status').eq('user_id',athleteId).order('awarded_at',{ascending:false}).limit(60),
    supabase.from('weight_logs').select('id,logged_at,weight_kg,target_weight_kg,competition_weight_kg,verification_status').eq('user_id',athleteId).order('logged_at',{ascending:false}).limit(30),
    supabase.from('goals').select('id,title,target_date,status,progress,notes').eq('user_id',athleteId).order('created_at',{ascending:false}).limit(40),
    supabase.from('injuries').select('id,title,severity,occurred_at,recovery_status,notes').eq('user_id',athleteId).order('occurred_at',{ascending:false}).limit(30),
    supabase.from('certificates').select('id,title,issued_by,issued_at,verification_status').eq('user_id',athleteId).order('issued_at',{ascending:false}).limit(30),
    supabase.from('documents').select('id,title,document_type,expires_at').eq('user_id',athleteId).order('created_at',{ascending:false}).limit(40),
    supabase.from('training_group_members').select('group_id,status,joined_at').eq('athlete_user_id',athleteId).order('joined_at',{ascending:false})
   ]);
   const labels=['training logs','training plans','calendar events','competitions','matches','medals','weight history','goals','recovery records','certificates','documents','training-group memberships'];
   results.forEach((result,index)=>{if(result.error)nextWarnings.push(labels[index]+': '+result.error.message);});
   setTraining(results[0].data||[]);
   setPlans(results[1].data||[]);
   setCalendarEvents(results[2].data||[]);
   setTournaments(results[3].data||[]);
   setMatches(results[4].data||[]);
   setMedals(results[5].data||[]);
   setWeights(results[6].data||[]);
   setGoals(results[7].data||[]);
   setInjuries(results[8].data||[]);
   setCertificates(results[9].data||[]);
   setDocuments(results[10].data||[]);

   const groupIds=[...new Set((results[11].data||[]).map((row:any)=>String(row.group_id)))];
   if(groupIds.length){
    const groupResult=await supabase.from('training_groups').select('id,name,focus_area,active,default_venue').in('id',groupIds);
    if(groupResult.error)nextWarnings.push('training groups: '+groupResult.error.message);
    const nextGroups=groupResult.data||[];
    setGroups(nextGroups);
    const sessionResult=await supabase.from('training_group_sessions')
     .select('id,group_id,session_date,start_time,title,status,training_type,venue,notes')
     .in('group_id',groupIds).order('session_date',{ascending:false}).limit(400);
    if(sessionResult.error)nextWarnings.push('training calendar: '+sessionResult.error.message);
    const nextSessions=sessionResult.data||[];
    setGroupSessions(nextSessions);
    if(nextSessions.length){
     const attendanceResult=await supabase.from('training_group_attendance')
      .select('session_id,status,marked_at,note')
      .eq('athlete_user_id',athleteId)
      .in('session_id',nextSessions.map((row:any)=>row.id));
     if(attendanceResult.error)nextWarnings.push('attendance: '+attendanceResult.error.message);
     setAttendance(attendanceResult.data||[]);
    }else setAttendance([]);
   }else{
    setGroups([]);
    setGroupSessions([]);
    setAttendance([]);
   }
   setWarnings(nextWarnings);
  }catch(e){
   setError(e instanceof Error?e.message:'Athlete details could not be loaded.');
  }finally{
   setLoading(false);
   setRefreshing(false);
  }
 },[athleteId,academyId,isAcademyAdmin,syncVersion]);

 useEffect(()=>{void load()},[load]);
 const groupNames=useMemo(()=>new Map(groups.map((group:any)=>[group.id,group.name])),[groups]);
 const attendanceMap=useMemo(()=>new Map(attendance.map((row:any)=>[row.session_id,row])),[attendance]);
 const pastSessions=useMemo(()=>groupSessions.filter((row:any)=>row.session_date<=dayKey(new Date())&&row.status!=='cancelled'),[groupSessions]);
 const attendanceStats=useMemo(()=>{
  const marked=pastSessions.map((row:any)=>attendanceMap.get(row.id)).filter(Boolean);
  const present=marked.filter((row:any)=>row.status==='present').length;
  const late=marked.filter((row:any)=>row.status==='late').length;
  const absent=marked.filter((row:any)=>row.status==='absent').length;
  const excused=marked.filter((row:any)=>row.status==='excused').length;
  const attended=present+late;
  const percentage=marked.length?Math.round(attended/marked.length*100):0;
  return {present,late,absent,excused,attended,marked:marked.length,unmarked:Math.max(0,pastSessions.length-marked.length),percentage};
 },[pastSessions,attendanceMap]);

 const calendarItems=useMemo(()=>{
  const rows:any[]=[];
  groupSessions.filter((row:any)=>row.status!=='cancelled').forEach((row:any)=>{
   const record=attendanceMap.get(row.id);
   rows.push({id:'group-'+row.id,day:String(row.session_date).slice(0,10),kind:'attendance',title:row.title||'Academy training',time:row.start_time,subtitle:(groupNames.get(row.group_id)||'Training group')+(row.training_type?' · '+row.training_type:''),status:record?.status||(String(row.session_date)<=dayKey(new Date())?'not marked':'scheduled'),note:record?.note||row.notes||null});
  });
  calendarEvents.forEach((row:any)=>rows.push({id:'calendar-'+row.id,day:dayKey(new Date(row.event_date)),kind:row.event_type||'reminder',title:row.title, time:row.event_date,subtitle:row.notes||'Athlete calendar event',status:null}));
  training.forEach((row:any)=>rows.push({id:'training-'+row.id,day:String(row.session_date).slice(0,10),kind:'training log',title:row.title||'Logged training',time:null,subtitle:(row.minutes?row.minutes+' minutes':'')+(row.intensity?' · '+row.intensity:''),status:null,note:row.notes}));
  tournaments.forEach((row:any)=>{if(row.starts_at)rows.push({id:'competition-'+row.id,day:String(row.starts_at).slice(0,10),kind:'competition',title:row.name, time:null,subtitle:[row.location,row.status].filter(Boolean).join(' · '),status:null});});
  return rows.filter((row:any)=>row.day).sort((a:any,b:any)=>a.day.localeCompare(b.day));
 },[groupSessions,attendanceMap,groupNames,calendarEvents,training,tournaments]);
 const calendarDays=useMemo(()=>{
  const first=new Date(month.getFullYear(),month.getMonth(),1);
  const count=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
  const offset=(first.getDay()+6)%7;
  return [...Array(offset).fill(null),...Array.from({length:count},(_,index)=>new Date(month.getFullYear(),month.getMonth(),index+1))];
 },[month]);
 const selectedItems=calendarItems.filter((row:any)=>row.day===selectedDay);
 const medalCounts={
  gold:medals.filter((row:any)=>String(row.medal_type).toLowerCase().includes('gold')).length,
  silver:medals.filter((row:any)=>String(row.medal_type).toLowerCase().includes('silver')).length,
  bronze:medals.filter((row:any)=>String(row.medal_type).toLowerCase().includes('bronze')).length
 };
 const totalTrainingMinutes=training.reduce((sum:number,row:any)=>sum+Number(row.minutes||0),0);
 const monthEvents=(day:string)=>calendarItems.filter((row:any)=>row.day===day);
 const openMonth=(direction:number)=>{
  const next=new Date(month.getFullYear(),month.getMonth()+direction,1);
  setMonth(next);
  setSelectedDay(dayKey(next));
 };
 const refresh=async()=>{setRefreshing(true);await load()};

 if(loading&&!athlete)return <Screen><Header back eyebrow="ACADEMY / PEOPLE" title="Athlete details" subtitle="Loading the athlete record…"/><Card><ActivityIndicator color={c.accentBright}/><Text style={{color:c.muted,fontSize:10}}>Loading academy records…</Text></Card></Screen>;
 if(error&&!athlete)return <Screen><Header back eyebrow="ACADEMY / PEOPLE" title="Athlete details" subtitle="The athlete record is unavailable."/><Card><Text style={{color:c.danger,fontWeight:'900'}}>Could not open athlete</Text><Text style={{color:c.muted,fontSize:10,lineHeight:16}}>{error}</Text><Pressable onPress={()=>void load()} style={{paddingVertical:8}}><Text style={{color:c.accentBright,fontWeight:'900'}}>RETRY</Text></Pressable></Card></Screen>;

 return <Screen scroll={false}>
  <Header back eyebrow="ACADEMY / ATHLETE PROFILE" title={athlete?.full_name||'Athlete'} subtitle="Profile, attendance, training and competition history." onRefresh={refresh} refreshing={refreshing}/>
  <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void refresh()} tintColor={c.accentBright}/>} contentContainerStyle={{gap:14,paddingBottom:60}}>
   {error?<Card><Text style={{color:c.danger,fontSize:10}}>{error}</Text></Card>:null}
   {warnings.length?<Card><Text style={{color:c.warning,fontSize:9,fontWeight:'900'}}>SOME RECORDS COULD NOT BE LOADED</Text><Text style={{color:c.muted,fontSize:9,lineHeight:14}}>{warnings.join('\n')}</Text></Card>:null}
   <Card accent>
    <View style={{flexDirection:'row',alignItems:'center',gap:12}}>
     <View style={{width:58,height:58,borderRadius:18,backgroundColor:c.background,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:c.accentDeep}}><Text style={{color:c.accentBright,fontSize:25,fontWeight:'900'}}>{String(athlete?.full_name||'A').slice(0,1).toUpperCase()}</Text></View>
     <View style={{flex:1,gap:3}}><Text style={{color:c.text,fontSize:18,fontWeight:'900'}}>{athlete?.full_name||'Athlete'}</Text><Text style={{color:c.muted,fontSize:10}}>{athlete?.username?'@'+athlete.username:'AthleteN account'} · {membership?.status==='active'?'ACTIVE ACADEMY MEMBER':'MEMBERSHIP'}</Text><Text style={{color:c.accentBright,fontSize:9,fontWeight:'900'}}>{String(athlete?.discipline||athlete?.sport||'Taekwondo').toUpperCase()} · {athlete?.belt||'BELT NOT SET'}</Text></View>
    </View>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
     <Stat label="Height" value={athlete?.height_cm?Number(athlete.height_cm)+' cm':'—'}/>
     <Stat label="Weight" value={athlete?.weight_kg?Number(athlete.weight_kg).toFixed(1)+' kg':'—'}/>
     <Stat label="Category" value={athlete?.competition_weight_category||'—'}/>
    </View>
    <Text style={{color:c.muted,fontSize:9}}>Academy joined {prettyDate(membership?.joined_at)}{athlete?.club?' · '+athlete.club:''}</Text>
    {athlete?.achievements?<Text style={{color:c.textSecondary,fontSize:10,lineHeight:16}}>Achievements: {athlete.achievements}</Text>:null}
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:7}}>
     {athlete?.verified_athlete?<Text style={{color:c.success,fontSize:8,fontWeight:'900'}}>VERIFIED ATHLETE</Text>:null}
     {athlete?.founder_badge?<Text style={{color:c.accentBright,fontSize:8,fontWeight:'900'}}>FOUNDING ATHLETE</Text>:null}
    </View>
   </Card>

   <Section title="ATHLETE OVERVIEW">
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
     <Stat label="Training logs" value={training.length}/>
     <Stat label="Attendance" value={attendanceStats.marked?attendanceStats.percentage+'%':'—'} color={attendanceStats.percentage>=75?c.success:c.text}/>
     <Stat label="Competitions" value={tournaments.length}/>
     <Stat label="Matches" value={matches.length}/>
     <Stat label="Medals" value={medals.length}/>
     <Stat label="Active goals" value={goals.filter((row:any)=>row.status==='active'||row.status==='in_progress').length}/>
    </View>
   </Section>

   <Section title="ATTENDANCE CALENDAR">
    <Card>
     <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
      <Pressable onPress={()=>openMonth(-1)} hitSlop={10}><Icon name="chevron-left" size={23}/></Pressable>
      <Text style={{color:c.text,fontSize:15,fontWeight:'900'}}>{month.toLocaleDateString('en-IN',{month:'long',year:'numeric'})}</Text>
      <Pressable onPress={()=>openMonth(1)} hitSlop={10}><Icon name="chevron-right" size={23}/></Pressable>
     </View>
     <View style={{flexDirection:'row',flexWrap:'wrap'}}>
      {['M','T','W','T','F','S','S'].map((label,index)=><Text key={index} style={{width:'14.28%',textAlign:'center',color:c.muted,fontSize:8,fontWeight:'900',paddingVertical:8}}>{label}</Text>)}
      {calendarDays.map((date:any,index:number)=>{
       if(!date)return <View key={'blank-'+index} style={{width:'14.28%',height:46}}/>;
       const key=dayKey(date);
       const dayRows=monthEvents(key);
       const attendanceRows=dayRows.filter((row:any)=>row.kind==='attendance');
       const mark=attendanceRows.find((row:any)=>row.status==='absent')||attendanceRows.find((row:any)=>row.status==='late')||attendanceRows.find((row:any)=>row.status==='present')||attendanceRows[0];
       const dotColor=mark?statusColor(mark.status):dayRows.length?c.accentBright:'transparent';
       return <Pressable key={key} onPress={()=>setSelectedDay(key)} style={{width:'14.28%',height:46,alignItems:'center',justifyContent:'center'}}>
        <View style={{width:32,height:32,borderRadius:16,backgroundColor:key===selectedDay?c.accentSoft:'transparent',borderWidth:key===selectedDay?1:0,borderColor:c.accent,alignItems:'center',justifyContent:'center'}}>
         <Text style={{color:key===selectedDay?c.accentBright:c.text,fontSize:10,fontWeight:'800'}}>{date.getDate()}</Text>
         {dayRows.length?<View style={{position:'absolute',bottom:1,width:5,height:5,borderRadius:3,backgroundColor:dotColor}}/>:null}
        </View>
       </Pressable>;
      })}
     </View>
     <View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>
      {[['Present',c.success],['Late',c.warning],['Absent',c.danger],['Excused',c.muted],['Other event',c.accentBright]].map(([label,color]:any)=><View key={label} style={{flexDirection:'row',alignItems:'center',gap:5}}><View style={{width:7,height:7,borderRadius:4,backgroundColor:color}}/><Text style={{color:c.muted,fontSize:8}}>{label}</Text></View>)}
     </View>
    </Card>
    <Card>
     <Text style={{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:1}}>SCHEDULE · {prettyDate(selectedDay)}</Text>
     {selectedItems.length?selectedItems.map((row:any)=><View key={row.id} style={{paddingVertical:9,borderBottomWidth:1,borderBottomColor:c.border,gap:4}}>
      <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
       <View style={{flex:1}}><Text style={{color:c.text,fontSize:11,fontWeight:'900'}}>{row.title}</Text><Text style={{color:c.muted,fontSize:8}}>{String(row.kind).toUpperCase()}{row.time?' · '+new Date(row.time).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):''}</Text></View>
       {row.status?<Text style={{color:statusColor(row.status),fontSize:8,fontWeight:'900'}}>{String(row.status).toUpperCase()}</Text>:null}
      </View>
      {row.subtitle?<Text style={{color:c.muted,fontSize:9,lineHeight:14}}>{row.subtitle}</Text>:null}
      {row.note?<Text style={{color:c.textSecondary,fontSize:9,lineHeight:14}}>{row.note}</Text>:null}
     </View>):<Text style={{color:c.muted,fontSize:10}}>No attendance or calendar events on this date.</Text>}
    </Card>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
     <Stat label="Present" value={attendanceStats.present} color={c.success}/>
     <Stat label="Late" value={attendanceStats.late} color={c.warning}/>
     <Stat label="Absent" value={attendanceStats.absent} color={c.danger}/>
     <Stat label="Excused" value={attendanceStats.excused}/>
    </View>
    <Text style={{color:c.muted,fontSize:9}}>{attendanceStats.attended} attended of {attendanceStats.marked} marked sessions · {attendanceStats.unmarked} past sessions not marked yet</Text>
    {!groupSessions.length?<Empty text="No academy training sessions are linked to this athlete yet. Attendance will appear here when a coach schedules sessions and marks the register."/>:null}
   </Section>

   <Section title="TRAINING HISTORY">
    <Card>
     <Text style={{color:c.accentBright,fontSize:9,fontWeight:'900'}}>TOTAL LOGGED WORKLOAD · {totalTrainingMinutes.toLocaleString('en-IN')} MINUTES</Text>
     {training.length?training.slice(0,25).map((row:any)=><DataRow key={row.id} title={row.title||'Training session'} subtitle={prettyDate(row.session_date)+(row.intensity?' · '+row.intensity:'')+(row.notes?' · '+row.notes:'')} right={Number(row.minutes||0)+'m'}/>):<Text style={{color:c.muted,fontSize:10}}>No individual training logs saved yet.</Text>}
    </Card>
   </Section>

   <Section title="TRAINING PLANS">
    <Card>{plans.length?plans.map((row:any)=><DataRow key={row.id} title={row.title} subtitle={[row.focus_area,row.starts_at&&row.ends_at?prettyDate(row.starts_at)+' – '+prettyDate(row.ends_at):row.starts_at?prettyDate(row.starts_at):null,row.notes].filter(Boolean).join(' · ')} right={String(row.status||'draft').toUpperCase()}/>):<Text style={{color:c.muted,fontSize:10}}>No training plans saved yet.</Text>}</Card>
   </Section>

   <Section title="COMPETITIONS & MATCH HISTORY">
    <Card>
     {tournaments.length?tournaments.map((row:any)=><View key={row.id} style={{paddingVertical:9,borderBottomWidth:1,borderBottomColor:c.border,gap:4}}>
      <Text style={{color:c.text,fontSize:12,fontWeight:'900'}}>{row.name}</Text>
      <Text style={{color:c.muted,fontSize:9}}>{prettyDate(row.starts_at)}{row.location?' · '+row.location:''}{row.discipline?' · '+row.discipline:''}</Text>
      <Text style={{color:c.accentBright,fontSize:8,fontWeight:'900'}}>{String(row.status||'planned').toUpperCase()}{row.result?' · '+row.result:''}{row.verification_status?' · '+row.verification_status:''}</Text>
      {matches.filter((match:any)=>match.tournament_id===row.id).map((match:any)=><View key={match.id} style={{backgroundColor:c.background,borderRadius:10,padding:10,marginTop:3,gap:3}}>
       <Text style={{color:c.text,fontSize:10,fontWeight:'800'}}>vs {match.opponent_name||'Opponent'} · {match.round_name||'Round not set'}</Text>
       <Text style={{color:c.muted,fontSize:9}}>{match.result||'Result not recorded'}{match.score?' · '+match.score:''}{match.division?' · '+match.division:''}</Text>
       {match.notes?<Text style={{color:c.muted,fontSize:9}}>{match.notes}</Text>:null}
      </View>)}
     </View>):<Text style={{color:c.muted,fontSize:10}}>No competitions saved yet.</Text>}
     {matches.filter((match:any)=>!match.tournament_id).map((match:any)=><DataRow key={match.id} title={'vs '+(match.opponent_name||'Opponent')} subtitle={[match.round_name,match.division,match.score,match.notes].filter(Boolean).join(' · ')} right={match.result||'Result pending'}/>)}
    </Card>
   </Section>

   <Section title="MEDAL RECORD">
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
     <Stat label="Gold" value={medalCounts.gold} color="#F5C451"/>
     <Stat label="Silver" value={medalCounts.silver} color="#C5D2E2"/>
     <Stat label="Bronze" value={medalCounts.bronze} color="#CB8C61"/>
    </View>
    <Card>{medals.length?medals.map((row:any)=><DataRow key={row.id} title={row.event_name} subtitle={[row.category,row.awarded_at?prettyDate(row.awarded_at):null,row.sport,row.discipline,row.result_notes].filter(Boolean).join(' · ')} right={String(row.medal_type).toUpperCase()}/>):<Text style={{color:c.muted,fontSize:10}}>No medals recorded yet.</Text>}</Card>
   </Section>

   <Section title="WEIGHT HISTORY">
    <Card>
     {weights.length?weights.map((row:any)=><DataRow key={row.id} title={Number(row.weight_kg).toFixed(1)+' kg'} subtitle={prettyDate(row.logged_at)+(row.verification_status?' · '+row.verification_status:'')} right={row.competition_weight_kg?Number(row.competition_weight_kg).toFixed(1)+' kg comp.':''}/>):<Text style={{color:c.muted,fontSize:10}}>No weight history has been recorded.</Text>}
    </Card>
   </Section>

   <Section title="GOALS & MILESTONES">
    <Card>{goals.length?goals.map((row:any)=><View key={row.id} style={{paddingVertical:9,borderBottomWidth:1,borderBottomColor:c.border,gap:5}}>
     <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8}}><Text style={{color:c.text,fontSize:11,fontWeight:'900',flex:1}}>{row.title}</Text><Text style={{color:c.accentBright,fontSize:10,fontWeight:'900'}}>{Number(row.progress||0)}%</Text></View>
     <View style={{height:6,backgroundColor:c.background,borderRadius:5,overflow:'hidden'}}><View style={{height:6,width:Math.max(0,Math.min(100,Number(row.progress||0)))+'%',backgroundColor:c.accent,borderRadius:5}}/></View>
     <Text style={{color:c.muted,fontSize:8}}>{String(row.status||'active').toUpperCase()}{row.target_date?' · Target '+prettyDate(row.target_date):''}</Text>
     {row.notes?<Text style={{color:c.muted,fontSize:9}}>{row.notes}</Text>:null}
    </View>):<Text style={{color:c.muted,fontSize:10}}>No goals saved yet.</Text>}</Card>
   </Section>

   <Section title="RECOVERY & INJURY LOG">
    <Card>{injuries.length?injuries.map((row:any)=><DataRow key={row.id} title={row.title} subtitle={[row.occurred_at?prettyDate(row.occurred_at):null,row.severity,row.notes].filter(Boolean).join(' · ')} right={String(row.recovery_status||'REPORTED').toUpperCase()}/>):<Text style={{color:c.muted,fontSize:10}}>No recovery records saved.</Text>}</Card>
   </Section>

   <Section title="CERTIFICATES & DOCUMENTS">
    <Card>
     {certificates.map((row:any)=><DataRow key={'cert-'+row.id} title={row.title} subtitle={['Certificate',row.issued_by,row.issued_at?prettyDate(row.issued_at):null].filter(Boolean).join(' · ')} right={String(row.verification_status||'').toUpperCase()}/>)}
     {documents.map((row:any)=><DataRow key={'doc-'+row.id} title={row.title} subtitle={String(row.document_type||'Document')+(row.expires_at?' · Expires '+prettyDate(row.expires_at):'')} right="DOCUMENT"/>)}
     {!certificates.length&&!documents.length?<Text style={{color:c.muted,fontSize:10}}>No certificates or documents have been uploaded.</Text>:null}
    </Card>
   </Section>
  </ScrollView>
 </Screen>;
}
