// @ts-nocheck
import { useCallback,useEffect,useState } from 'react';
import { Text,View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Screen,Header,Section,Card,FeatureRow,c,RefreshButton } from '@/components/mobile-ui';

export default function AthletePassport(){
 const {session,profile}=useAuth();const router=useRouter();const [d,setD]=useState<any>({medals:[],events:[],badges:[],milestones:[],sessions:0});const [busy,setBusy]=useState(false);
 const load=useCallback(async()=>{if(!session)return;setBusy(true);const uid=session.user.id;const [m,e,b,ms,s]=await Promise.all([
  supabase.from('medals').select('id,event_name,medal_type,category,awarded_at,verification_status').eq('user_id',uid).order('awarded_at',{ascending:false}).limit(6),
  supabase.from('tournaments').select('id,name,starts_at,result,verification_status').eq('user_id',uid).not('result','is',null).order('starts_at',{ascending:false}).limit(6),
  supabase.from('athlete_badges').select('id,badge_key,awarded_at').eq('user_id',uid).order('awarded_at',{ascending:false}).limit(6),
  supabase.from('athlete_milestones').select('id,title,achieved_at,verification_status').eq('user_id',uid).order('achieved_at',{ascending:false}).limit(6),
  supabase.from('training_sessions').select('id',{count:'exact',head:true}).eq('user_id',uid)
 ]);setD({medals:m.data||[],events:e.data||[],badges:b.data||[],milestones:ms.data||[],sessions:s.count||0});setBusy(false)},[session]);
 useEffect(()=>{void load()},[load]);
 return <Screen><Header back eyebrow="ATHLETEN IDENTITY" title="Athlete Passport" subtitle="A compact record of who you are, what you have achieved and what AthleteN can verify." right={<RefreshButton onPress={()=>void load()} busy={busy}/>}/>
 <Card accent><Text style={{color:c.accentBright,fontSize:9,fontWeight:'900'}}>ATHLETEN PASSPORT</Text><Text style={{color:c.text,fontSize:25,fontWeight:'900',marginTop:4}}>{profile?.full_name||'Athlete'}</Text><Text style={{color:c.muted,fontSize:11}}>{profile?.sport||'Taekwondo'} • {profile?.discipline||'—'} • {profile?.belt||'Belt not set'}</Text><Text style={{color:c.muted,fontSize:10,marginTop:5}}>{profile?.academy||'Independent athlete'}{profile?.coach?' • '+profile.coach:''}</Text></Card>
 <View style={{flexDirection:'row',gap:9}}><Card style={{flex:1}}><Text style={{color:c.muted,fontSize:8,fontWeight:'900'}}>MEDALS</Text><Text style={{color:c.text,fontSize:22,fontWeight:'900'}}>{d.medals.length}</Text></Card><Card style={{flex:1}}><Text style={{color:c.muted,fontSize:8,fontWeight:'900'}}>SESSIONS</Text><Text style={{color:c.text,fontSize:22,fontWeight:'900'}}>{d.sessions}</Text></Card><Card style={{flex:1}}><Text style={{color:c.muted,fontSize:8,fontWeight:'900'}}>BADGES</Text><Text style={{color:c.text,fontSize:22,fontWeight:'900'}}>{d.badges.length}</Text></Card></View>
 <Section title="ACHIEVEMENTS">{d.medals.length?d.medals.map(x=><Card key={x.id}><Text style={{color:c.text,fontWeight:'900'}}>{x.event_name||'Competition'}</Text><Text style={{color:c.accentBright,fontSize:11,fontWeight:'900'}}>{x.medal_type||'Medal'}{x.category?' • '+x.category:''}</Text><Text style={{color:c.muted,fontSize:9}}>{x.awarded_at||'Date not set'} • {x.verification_status||'self_reported'}</Text></Card>):<Card><Text style={{color:c.muted,fontSize:10}}>Verified achievements will appear here.</Text></Card>}</Section>
 <Section title="MILESTONES">{d.milestones.map(x=><Card key={x.id}><Text style={{color:c.text,fontWeight:'900'}}>{x.title}</Text><Text style={{color:c.muted,fontSize:9}}>{x.achieved_at||'Date not set'} • {x.verification_status||'self_reported'}</Text></Card>)}</Section>
 <Section title="RECENT RESULTS">{d.events.map(x=><Card key={x.id}><Text style={{color:c.text,fontWeight:'900'}}>{x.name}</Text><Text style={{color:c.accentBright,fontWeight:'900'}}>{x.result}</Text><Text style={{color:c.muted,fontSize:9}}>{x.starts_at||'Date not set'} • {x.verification_status||'self_reported'}</Text></Card>)}</Section>
 <FeatureRow title="Open badges" text="View the full protected badge catalogue." icon="medal" onPress={()=>router.push('/badges')}/>
 <FeatureRow title="Verification" text="Submit or review evidence for eligible athlete records." icon="shield" onPress={()=>router.push('/verification')}/>
 </Screen>;
}