// @ts-nocheck
import { useCallback,useEffect,useState } from 'react';
import { Pressable,Text,View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Screen,Header,Section,Card,FeatureRow,c,RefreshButton } from '@/components/mobile-ui';

export default function AthleteCommand(){
 const {session,profile}=useAuth(); const router=useRouter(); const [data,setData]=useState<any>({today:null,plan:null,unread:0,challenges:[],checklist:[]}); const [busy,setBusy]=useState(false); const [loadError,setLoadError]=useState('');
 const load=useCallback(async()=>{
  if(!session){setData({today:null,plan:null,unread:0,challenges:[],checklist:[]});return}
  setBusy(true);setLoadError('');
  const uid=session.user.id;const localNow=new Date();const now=[localNow.getFullYear(),String(localNow.getMonth()+1).padStart(2,'0'),String(localNow.getDate()).padStart(2,'0')].join('-');
  try{
   const [t,p,n,ch,cl]=await Promise.all([
    supabase.from('training_sessions').select('id,title,minutes,session_date').eq('user_id',uid).eq('session_date',now).order('created_at',{ascending:false}).limit(1).maybeSingle(),
    supabase.from('training_plans').select('id,title,focus_area,ends_at,status').eq('user_id',uid).neq('status','archived').order('created_at',{ascending:false}).limit(1).maybeSingle(),
    supabase.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',uid).is('read_at',null),
    supabase.from('athlete_challenges').select('id,title,target_value,current_value,unit,due_date,status').eq('user_id',uid).eq('status','active').order('due_date',{ascending:true}).limit(3),
    supabase.from('competition_checklists').select('id,item,completed').eq('user_id',uid).eq('completed',false).limit(3)
   ]);
   const hadQueryError=[t.error,p.error,n.error,ch.error,cl.error].some(Boolean);
   setData({today:t.data??null,plan:p.data??null,unread:n.count??0,challenges:ch.data??[],checklist:cl.data??[]});
   if(hadQueryError)setLoadError('Some live signals could not load. Your cockpit is still available; tap refresh to retry.');
  }catch(error){
   console.error('[AthleteN] cockpit data load failed',error);
   setData(current=>({...current,today:null,plan:null,unread:0,challenges:[],checklist:[]}));
   setLoadError('Live signals are temporarily unavailable. Tap refresh to retry.');
  }finally{setBusy(false)}
 },[session]);
 useEffect(()=>{void load()},[load]);
 return <Screen><Header eyebrow="ATHLETEN COMMAND CENTER" title="Today's cockpit" subtitle="The shortest path from opening AthleteN to knowing what matters today." right={<RefreshButton onPress={()=>void load()} busy={busy}/>}/>
 {loadError?<Card><Text style={{color:c.muted,fontSize:10,lineHeight:15}}>{loadError}</Text></Card>:null}
 <Card accent><Text style={{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:1.2}}>ATHLETE MODE</Text><Text style={{color:c.text,fontSize:21,fontWeight:'900',marginTop:3}}>{profile?.discipline||'Taekwondo'} • {profile?.academy||'Independent'}</Text><Text style={{color:c.muted,fontSize:11,marginTop:4}}>Focus on the next useful action, not another dashboard.</Text></Card>
 <Section title="TODAY">
  {data.today?<Card><Text style={{color:c.success,fontSize:9,fontWeight:'900'}}>TRAINING LOGGED</Text><Text style={{color:c.text,fontSize:16,fontWeight:'900'}}>{data.today.title}</Text><Text style={{color:c.muted,fontSize:10}}>{data.today.minutes} minutes</Text></Card>:<FeatureRow title="Start a training session" text="Use Session Mode to time the work and save it when finished." icon="training" onPress={()=>router.push('/training-session')}/>}
  {data.plan?<FeatureRow title={data.plan.title} text={(data.plan.focus_area||'Training plan')+' • ends '+data.plan.ends_at} icon="calendar" onPress={()=>router.push('/training')}/>:null}
 </Section>
 <Section title="NEXT ACTIONS">
  <FeatureRow title="Competition Mode" text="Prepare the next event, checklist and post-event review." icon="event" onPress={()=>router.push('/competition-mode')}/>
  <FeatureRow title="Mission Center" text={(data.challenges?.length??0)?data.challenges.length+' active mission'+(data.challenges.length===1?'':'s'): 'Set challenges that turn goals into actions.'} icon="check" onPress={()=>router.push('/missions')}/>
  <FeatureRow title="Athlete Passport" text="Your verified profile, medals, milestones and badges in one place." icon="shield" onPress={()=>router.push('/athlete-passport')}/>
 </Section>
 <Section title="LIVE SIGNALS">
  <View style={{flexDirection:'row',gap:9}}>
   <Card style={{flex:1}}><Text style={{color:c.muted,fontSize:8,fontWeight:'900'}}>OPEN CHECKLIST</Text><Text style={{color:c.text,fontSize:22,fontWeight:'900'}}>{data.checklist?.length??0}</Text></Card>
   <Card style={{flex:1}}><Text style={{color:c.muted,fontSize:8,fontWeight:'900'}}>UNREAD</Text><Text style={{color:c.text,fontSize:22,fontWeight:'900'}}>{data.unread}</Text></Card>
  </View>
 </Section>
 </Screen>;
}