import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Screen, Card, Button, Field, c } from '@/components/mobile-ui';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

type Member={user_id:string;role:string;status:string;full_name?:string|null;belt?:string|null;discipline?:string|null};
type Session={id:string;session_date:string;start_time:string;title:string;training_type?:string|null;venue?:string|null};
type Event={id:string;name:string;starts_at:string;location?:string|null;status?:string|null};

const tabs=['Dashboard','People','Training','Events','Finance'] as const;
type Tab=typeof tabs[number];

function Stat({icon,label,value,sub,accent=c.accent}:{icon:string;label:string;value:string|number;sub?:string;accent?:string}){
  return <Card style={{flex:1,minWidth:145,padding:14}}>
    <View style={{flexDirection:'row',alignItems:'center',gap:9}}>
      <View style={{width:38,height:38,borderRadius:12,backgroundColor:accent+'22',alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:19}}>{icon}</Text></View>
      <View style={{flex:1}}><Text style={{color:c.muted,fontSize:9,fontWeight:'800'}}>{label.toUpperCase()}</Text><Text style={{color:c.text,fontSize:22,fontWeight:'900',marginTop:2}}>{value}</Text></View>
    </View>
    {sub?<Text style={{color:c.accentBright,fontSize:9,fontWeight:'800',marginTop:8}}>{sub}</Text>:null}
  </Card>;
}

function Action({icon,title,onPress}:{icon:string;title:string;onPress:()=>void}){
  return <Pressable onPress={onPress} style={{backgroundColor:c.panel,borderWidth:1,borderColor:c.border,borderRadius:12,padding:13,flexDirection:'row',alignItems:'center',gap:10}}>
    <Text style={{fontSize:17}}>{icon}</Text><Text style={{color:c.text,fontSize:11,fontWeight:'900'}}>{title}</Text>
  </Pressable>;
}

export default function Academy(){
  const {profile}=useAuth();
  const [tab,setTab]=useState<Tab>('Dashboard');
  const [academy,setAcademy]=useState<any>(null);
  const [members,setMembers]=useState<Member[]>([]);
  const [sessions,setSessions]=useState<Session[]>([]);
  const [events,setEvents]=useState<Event[]>([]);
  const [code,setCode]=useState('');
  const [savedCode,setSavedCode]=useState('');
  const [busy,setBusy]=useState(false);
  const [attendance,setAttendance]=useState<number[]>([0,0,0,0,0,0,0]);

  const load=async()=>{
    if(!profile?.academy_id)return;
    const a=await supabase.from('academies').select('id,name,city,state,country,status,created_at').eq('id',profile.academy_id).maybeSingle();
    setAcademy(a.data);

    const m=await supabase.from('academy_memberships').select('user_id,role,status').eq('academy_id',profile.academy_id).eq('status','active');
    const base=(m.data||[]) as any[];
    const ids=base.map(x=>x.user_id);
    if(ids.length){
      const p=await supabase.from('profiles').select('user_id,full_name,belt,discipline').in('user_id',ids);
      const map=new Map((p.data||[]).map((x:any)=>[x.user_id,x]));
      setMembers(base.map(x=>({...x,...(map.get(x.user_id)||{})})));
    }else setMembers([]);

    const coachIds=base.filter(x=>x.role==='coach').map(x=>x.user_id);
    if(coachIds.length){
      const g=await supabase.from('training_groups').select('id').in('coach_user_id',coachIds).eq('active',true);
      const groupIds=(g.data||[]).map((x:any)=>x.id);
      if(groupIds.length){
        const s=await supabase.from('training_group_sessions').select('id,session_date,start_time,title,training_type,venue').in('group_id',groupIds).gte('session_date',new Date().toISOString().slice(0,10)).order('session_date').order('start_time').limit(8);
        setSessions((s.data||[]) as Session[]);
      }else setSessions([]);
    }else setSessions([]);

    const t=await supabase.from('tournaments').select('id,name,starts_at,location,status').eq('sport','Taekwondo').gte('starts_at',new Date().toISOString().slice(0,10)).order('starts_at').limit(6);
    setEvents((t.data||[]) as Event[]);

    const days=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));return d.toISOString().slice(0,10)});
    const ar=await supabase.from('attendance_records').select('attended_at,status').eq('academy_id',profile.academy_id).gte('attended_at',days[0]+'T00:00:00');
    const counts=days.map(day=>(ar.data||[]).filter((x:any)=>x.attended_at?.slice(0,10)===day && ['present','late','attended'].includes(String(x.status||'').toLowerCase())).length);
    setAttendance(counts);

    const cc=await supabase.rpc('get_my_connection_code');
    setSavedCode(cc.data?.code||'');
  };

  useEffect(()=>{void load()},[profile?.academy_id]);

  const athletes=members.filter(x=>x.role==='athlete').length;
  const coaches=members.filter(x=>x.role==='coach').length;
  const groups=new Set(sessions.map(x=>x.title)).size;
  const maxAttendance=Math.max(1,...attendance);
  const avgAttendance=athletes?Math.min(100,Math.round((attendance.reduce((a,b)=>a+b,0)/(Math.max(1,attendance.length)*athletes))*100)):0;

  async function saveCode(){
    const value=code.trim().toUpperCase();
    if(!value){Alert.alert('Academy code','Enter a code first.');return}
    setBusy(true);
    const {data,error}=await supabase.rpc('set_connection_code',{p_code:value});
    setBusy(false);
    if(error)Alert.alert('Could not save code',error.message);
    else{setSavedCode(String(data?.code||value));setCode('');Alert.alert('Saved','Your academy connection code is '+String(data?.code||value))}
  }

  const quick=(next:Tab)=>setTab(next);

  return <Screen>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:10}} contentContainerStyle={{gap:7,paddingRight:16}}>
      {tabs.map(x=><Pressable key={x} onPress={()=>setTab(x)} style={{paddingHorizontal:15,paddingVertical:9,borderRadius:18,backgroundColor:tab===x?c.accent:c.panel,borderWidth:1,borderColor:tab===x?c.accent:c.border}}>
        <Text style={{color:tab===x?'#fff':c.muted,fontSize:10,fontWeight:'900'}}>{x}</Text>
      </Pressable>)}
    </ScrollView>

    {tab==='Dashboard'?<>

      <View style={{marginBottom:15}}>
        <Text style={{color:c.muted,fontSize:11}}>GOOD AFTERNOON,</Text>
        <Text style={{color:c.text,fontSize:27,fontWeight:'900',marginTop:2}}>{academy?.name||'Your Academy'}</Text>
        <Text style={{color:c.muted,fontSize:11,marginTop:3}}>Discipline Today, Champions Tomorrow.</Text>
      </View>

      <View style={{flexDirection:'row',flexWrap:'wrap',gap:9}}>
        <Stat icon="👥" label="Total Athletes" value={athletes} sub="+ active members" accent="#2186ff"/>
        <Stat icon="🧑‍🏫" label="Total Coaches" value={coaches} sub="Active coaches" accent="#1bb6c9"/>
        <Stat icon="🥋" label="Active Groups" value={groups} sub="Upcoming training" accent="#8a5cff"/>
        <Stat icon="🏆" label="Upcoming Events" value={events.length} sub={events[0]?new Date(events[0].starts_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'}):'None yet'} accent="#ff9b2f"/>
      </View>

      <Card style={{marginTop:10,padding:0,overflow:'hidden'}}>
        <View style={{padding:16,backgroundColor:'#071725'}}>
          <Text style={{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:1}}>ACADEMY OVERVIEW</Text>
          <Text style={{color:c.text,fontSize:22,fontWeight:'900',marginTop:6}}>{academy?.name||'AthleteN Academy'}</Text>
          <Text style={{color:c.muted,fontSize:10,marginTop:4}}>{[academy?.city,academy?.state,academy?.country].filter(Boolean).join(' · ')||'Academy location not set'}</Text>
          <View style={{flexDirection:'row',gap:8,marginTop:16}}>
            <View style={{flex:1,backgroundColor:c.background,borderRadius:12,padding:11}}><Text style={{color:c.muted,fontSize:8}}>DISCIPLINES</Text><Text style={{color:c.text,fontSize:11,fontWeight:'900',marginTop:5}}>Kyorugi · Poomsae</Text></View>
            <View style={{flex:1,backgroundColor:c.background,borderRadius:12,padding:11}}><Text style={{color:c.muted,fontSize:8}}>STATUS</Text><Text style={{color:c.accentBright,fontSize:11,fontWeight:'900',marginTop:5}}>{academy?.status||'Active'}</Text></View>
          </View>
        </View>
      </Card>

      <View style={{marginTop:10}}>
        <Text style={{color:c.text,fontSize:14,fontWeight:'900',marginBottom:8}}>Upcoming Schedule</Text>
        {sessions.length? sessions.slice(0,4).map(s=><Card key={s.id} style={{padding:12,marginBottom:7}}><View style={{flexDirection:'row',alignItems:'center',gap:12}}><View style={{width:48,alignItems:'center'}}><Text style={{color:c.accentBright,fontSize:10,fontWeight:'900'}}>{new Date(s.session_date).toLocaleDateString('en-IN',{day:'2-digit'})}</Text><Text style={{color:c.muted,fontSize:8}}>{new Date(s.session_date).toLocaleDateString('en-IN',{month:'short'}).toUpperCase()}</Text></View><View style={{flex:1}}><Text style={{color:c.text,fontWeight:'900',fontSize:11}}>{s.title}</Text><Text style={{color:c.muted,fontSize:9,marginTop:3}}>{s.start_time?.slice(0,5)} · {s.training_type||'Training'}{s.venue?' · '+s.venue:''}</Text></View><Text style={{color:c.accentBright,fontSize:8,fontWeight:'900'}}>TRAINING</Text></View></Card>):<Card><Text style={{color:c.text,fontWeight:'900'}}>No upcoming training</Text><Text style={{color:c.muted,fontSize:10,marginTop:4}}>Coach groups will appear here automatically.</Text></Card>}
      </View>

      <View style={{marginTop:10}}>
        <Text style={{color:c.text,fontSize:14,fontWeight:'900',marginBottom:8}}>Attendance Overview · Last 7 Days</Text>
        <Card>
          <View style={{height:130,flexDirection:'row',alignItems:'flex-end',gap:7}}>
            {attendance.map((n,i)=><View key={i} style={{flex:1,alignItems:'center',justifyContent:'flex-end',height:'100%'}}><Text style={{color:c.muted,fontSize:7,marginBottom:3}}>{n}</Text><View style={{width:'68%',height:Math.max(5,(n/maxAttendance)*95),borderRadius:5,backgroundColor:c.accent}}/><Text style={{color:c.muted,fontSize:7,marginTop:4}}>{['M','T','W','T','F','S','S'][i]}</Text></View>)}
          </View>
          <View style={{flexDirection:'row',justifyContent:'space-between',marginTop:12}}><Text style={{color:c.muted,fontSize:9}}>Average attendance</Text><Text style={{color:c.accentBright,fontSize:17,fontWeight:'900'}}>{avgAttendance}%</Text></View>
        </Card>
      </View>

      <View style={{marginTop:10}}>
        <Text style={{color:c.text,fontSize:14,fontWeight:'900',marginBottom:8}}>Quick Actions</Text>
        <View style={{gap:7}}>
          <Action icon="👤" title="Manage Athletes" onPress={()=>quick('People')}/>
          <Action icon="🧑‍🏫" title="Manage Coaches" onPress={()=>quick('People')}/>
          <Action icon="👥" title="Manage Training Groups" onPress={()=>quick('Training')}/>
          <Action icon="🏆" title="Manage Competitions" onPress={()=>quick('Events')}/>
          <Action icon="💰" title="Open Finance" onPress={()=>quick('Finance')}/>
        </View>
      </View>

      <Card accent style={{marginTop:10}}>
        <Text style={{color:c.text,fontSize:14,fontWeight:'900'}}>Academy Connection Code</Text>
        <Text style={{color:c.muted,fontSize:9,lineHeight:15,marginTop:4}}>Give this code to athletes and coaches who need to connect with your academy.</Text>
        <Text style={{color:c.accentBright,fontSize:25,fontWeight:'900',marginTop:8}}>{savedCode||'Not set'}</Text>
        <Field label="NEW CODE" value={code} onChangeText={v=>setCode(v.toUpperCase())} autoCapitalize="characters" placeholder="ATN-ACADEMY-01"/>
        <Button title="SAVE ACADEMY CODE" onPress={()=>void saveCode()} busy={busy}/>
      </Card>

    </>:null}

    {tab==='People'?<View>
      <Text style={{color:c.text,fontSize:22,fontWeight:'900'}}>People</Text>
      <Text style={{color:c.muted,fontSize:10,marginTop:4,marginBottom:12}}>Everyone connected to this academy.</Text>
      {members.length?members.map(m=><Card key={m.user_id} style={{marginBottom:7}}><View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><View><Text style={{color:c.text,fontSize:13,fontWeight:'900'}}>{m.full_name||'Member'}</Text><Text style={{color:c.muted,fontSize:9,marginTop:3}}>{m.role} · {m.discipline||'Taekwondo'} · {m.belt||'Belt not set'}</Text></View><Text style={{color:c.accentBright,fontSize:8,fontWeight:'900'}}>{m.status.toUpperCase()}</Text></View></Card>):<Card><Text style={{color:c.text,fontWeight:'900'}}>No members yet</Text></Card>}
    </View>:null}

    {tab==='Training'?<View>
      <Text style={{color:c.text,fontSize:22,fontWeight:'900'}}>Training</Text>
      <Text style={{color:c.muted,fontSize:10,marginTop:4,marginBottom:12}}>Academy-wide upcoming sessions.</Text>
      {sessions.length?sessions.map(s=><Card key={s.id} style={{marginBottom:7}}><Text style={{color:c.text,fontWeight:'900'}}>{s.title}</Text><Text style={{color:c.muted,fontSize:9,marginTop:4}}>{new Date(s.session_date).toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'})} · {s.start_time?.slice(0,5)} · {s.training_type||'Training'}</Text></Card>):<Card><Text style={{color:c.text,fontWeight:'900'}}>No sessions scheduled</Text></Card>}
    </View>:null}

    {tab==='Events'?<View>
      <Text style={{color:c.text,fontSize:22,fontWeight:'900'}}>Competitions</Text>
      <Text style={{color:c.muted,fontSize:10,marginTop:4,marginBottom:12}}>Upcoming Taekwondo events visible to the academy.</Text>
      {events.length?events.map(e=><Card key={e.id} style={{marginBottom:7}}><View style={{flexDirection:'row',justifyContent:'space-between'}}><View style={{flex:1}}><Text style={{color:c.text,fontWeight:'900'}}>{e.name}</Text><Text style={{color:c.muted,fontSize:9,marginTop:4}}>{new Date(e.starts_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})} · {e.location||'Location TBD'}</Text></View><Text style={{color:c.accentBright,fontSize:8,fontWeight:'900'}}>{e.status||'UPCOMING'}</Text></View></Card>):<Card><Text style={{color:c.text,fontWeight:'900'}}>No upcoming competitions</Text></Card>}
    </View>:null}

    {tab==='Finance'?<View>
      <Text style={{color:c.text,fontSize:22,fontWeight:'900'}}>Payments & Finance</Text>
      <Text style={{color:c.muted,fontSize:10,marginTop:4,marginBottom:12}}>Academy finance tools are ready to connect to transactions and payment records.</Text>
      <Card><Text style={{color:c.muted,fontSize:9}}>ACADEMY PLAN</Text><Text style={{color:c.text,fontSize:24,fontWeight:'900',marginTop:4}}>₹799 / month</Text><Text style={{color:c.accentBright,fontSize:9,fontWeight:'900',marginTop:4}}>1,000 AI messages / month</Text></Card>
      <Card style={{marginTop:8}}><Text style={{color:c.text,fontWeight:'900'}}>Finance dashboard</Text><Text style={{color:c.muted,fontSize:10,lineHeight:16,marginTop:5}}>Revenue, pending fees, overdue payments and transaction history will live here.</Text></Card>
    </View>:null}
  </Screen>;
}
