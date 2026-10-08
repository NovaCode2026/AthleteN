// @ts-nocheck
import { useCallback,useEffect,useState } from 'react';
import { Pressable,Text,View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Screen,Header,Section,Card,FeatureRow,c,RefreshButton } from '@/components/mobile-ui';

export default function CompetitionMode(){
 const {session}=useAuth();const router=useRouter();const [event,setEvent]=useState<any>(null);const [open,setOpen]=useState<any[]>([]);const [busy,setBusy]=useState(false);
 const load=useCallback(async()=>{if(!session)return;setBusy(true);const uid=session.user.id;const [e,c1]=await Promise.all([supabase.from('tournaments').select('id,name,starts_at,location,status,result,opponent_notes,match_notes').eq('user_id',uid).gte('starts_at',new Date().toISOString().slice(0,10)).order('starts_at',{ascending:true}).limit(1).maybeSingle(),supabase.from('competition_checklists').select('id,item,category,completed').eq('user_id',uid).eq('completed',false).order('created_at',{ascending:true}).limit(6)]);setEvent(e.data||null);setOpen(c1.data||[]);setBusy(false)},[session]);
 useEffect(()=>{void load()},[load]);
 return <Screen><Header back eyebrow="COMPETITION MODE" title="Competition cockpit" subtitle="One place for preparation, event-day context and the review that comes after." right={<RefreshButton onPress={()=>void load()} busy={busy}/>}/>
 {event?<Card accent><Text style={{color:c.accentBright,fontSize:9,fontWeight:'900'}}>NEXT EVENT</Text><Text style={{color:c.text,fontSize:22,fontWeight:'900',marginTop:4}}>{event.name}</Text><Text style={{color:c.muted,fontSize:11,marginTop:3}}>{event.starts_at} • {event.location||'Location not set'}</Text><Text style={{color:c.muted,fontSize:10,marginTop:8}}>Status: {event.status||'planned'}{event.result?' • Result: '+event.result:''}</Text></Card>:<Card><Text style={{color:c.text,fontSize:16,fontWeight:'900'}}>No upcoming competition</Text><Text style={{color:c.muted,fontSize:10}}>Add an event in Compete and this cockpit will automatically pick it up.</Text></Card>}
 <Section title="BEFORE COMPETITION">
  {open.length?<Card>{open.map((x,i)=><View key={x.id} style={{paddingVertical:9,borderBottomWidth:i===open.length-1?0:1,borderBottomColor:c.border}}><Text style={{color:c.text,fontSize:12,fontWeight:'800'}}>{x.item}</Text><Text style={{color:c.muted,fontSize:9}}>{x.category||'Preparation'}</Text></View>)}</Card>:<Card><Text style={{color:c.success,fontWeight:'900'}}>CHECKLIST CLEAR</Text><Text style={{color:c.muted,fontSize:10}}>No open competition checklist items.</Text></Card>}
  <FeatureRow title="Open full checklist" text="Manage every competition preparation item." icon="check" onPress={()=>router.push('/checklist')}/>
 </Section>
 <Section title="COMPETITION INTELLIGENCE">
  <FeatureRow title="Competition Analysis" text="Review patterns and performance from your recorded matches." icon="chart" onPress={()=>router.push('/competition-analysis')}/>
  <FeatureRow title="Fight IQ & Journal" text="Capture what worked, what failed and the next tactical target." icon="ai" onPress={()=>router.push('/athlete-journey')}/>
 </Section>
 <Section title="AFTER THE EVENT">
  <FeatureRow title="Post-competition review" text="Record result, lessons, coach feedback and the next target." icon="edit" onPress={()=>router.push('/athlete-journey')}/>
  <FeatureRow title="Athlete Passport" text="See verified results and achievements after your record is updated." icon="shield" onPress={()=>router.push('/athlete-passport')}/>
 </Section>
 </Screen>;
}