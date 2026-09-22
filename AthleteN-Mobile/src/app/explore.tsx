import { useCallback,useEffect,useState } from 'react';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Screen,Header,Section,Card,FeatureRow,c } from '@/components/mobile-ui';

export default function ExploreScreen(){
 const router=useRouter(); const {session,profile}=useAuth(); const [counts,setCounts]=useState({docs:0,check:0,roadmap:0,notices:0});
 const load=useCallback(async()=>{if(!session)return;const uid=session.user.id;const [d,ch,r,n]=await Promise.all([
  supabase.from('documents').select('id',{count:'exact',head:true}).eq('user_id',uid),
  supabase.from('competition_checklists').select('id,completed').eq('user_id',uid),
  supabase.from('roadmap_items').select('id',{count:'exact',head:true}),
  supabase.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',uid).is('read_at',null)
 ]);setCounts({docs:d.count||0,check:(ch.data||[]).filter((x:any)=>!x.completed).length,roadmap:r.count||0,notices:n.count||0})},[session]);
 useEffect(()=>{void load()},[load]);
 return <Screen><Header eyebrow="ATHLETEN V2" title="More" subtitle="The rest of the AthleteN command center, rebuilt for mobile."/>
  <Section title="TAEKWONDO">
   <FeatureRow title="Taekwondo Hub" text={profile?.discipline?profile.discipline+' performance, bouts and training':'Kyorugi & Poomsae performance'} onPress={()=>router.push({pathname:'/taekwondo'})}/>
   <FeatureRow title="Competition Checklist" text="Gear, documents and pre-event preparation" badge={String(counts.check)} onPress={()=>router.push({pathname:'/checklist'})}/>
   <FeatureRow title="Weight & Category" text="Weight history and competition context" onPress={()=>router.push({pathname:'/weight'})}/>
  </Section>
  <Section title="ATHLETE CENTER">
   <FeatureRow title="Calendar" text="Training and competition timeline" onPress={()=>router.push({pathname:'/calendar'})}/>
   <FeatureRow title="Medals" text="Full medal record" onPress={()=>router.push({pathname:'/medals'})}/>
   <FeatureRow title="Documents" text="Private athlete documents" badge={String(counts.docs)} onPress={()=>router.push({pathname:'/documents'})}/>
   <FeatureRow title="Verification" text="Athlete/student verification status" onPress={()=>router.push({pathname:'/verification'})}/>
  </Section>
  <Section title="ATHLETEN COMMUNITY">
   <FeatureRow title="Messages" text="Secure athlete, coach and team messaging" onPress={()=>router.push({pathname:'/messages'})}/>
   <FeatureRow title="Roadmap" text="Vote on what AthleteN should build next" badge={String(counts.roadmap)} onPress={()=>router.push({pathname:'/roadmap'})}/>
   <FeatureRow title="Feedback" text="Report a problem or suggest an improvement" onPress={()=>router.push({pathname:'/feedback'})}/>
   <FeatureRow title="Notifications" text="Account and competition updates" badge={String(counts.notices)} onPress={()=>router.push({pathname:'/notifications'})}/>
  </Section>
  <Card accent><Text style={{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:1.2}}>ATHLETEN MOBILE</Text><Text style={{color:c.text,fontSize:18,fontWeight:'900'}}>One athlete record. Every important workflow.</Text><Text style={{color:'#BBD6FF',fontSize:11,lineHeight:17}}>The mobile app now exposes the same core athlete operating system as the web app, while keeping navigation touch-first.</Text></Card>
 </Screen>
}