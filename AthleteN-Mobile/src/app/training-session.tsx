// @ts-nocheck
import { useEffect,useRef,useState } from 'react';
import { ActivityIndicator,Pressable,Text,View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Screen,Header,Card,Button,Field,c } from '@/components/mobile-ui';

const blocks=(d:string)=>d==='poomsae'?['Warm-up','Stance & balance','Poomsae technique','Speed & precision','Performance reps','Cooldown']:['Warm-up','Footwork','Kicks','Defence','Sparring','Conditioning','Cooldown'];
export default function TrainingSession(){
 const {session,profile}=useAuth();const router=useRouter();const [running,setRunning]=useState(false);const [seconds,setSeconds]=useState(0);const [title,setTitle]=useState('');const [notes,setNotes]=useState('');const [busy,setBusy]=useState(false);const started=useRef(false);
 useEffect(()=>{if(!running)return;const id=setInterval(()=>setSeconds(x=>x+1),1000);return()=>clearInterval(id)},[running]);
 const finish=async()=>{if(!session||seconds<1)return;setBusy(true);const mins=Math.max(1,Math.round(seconds/60));const {error}=await supabase.from('training_sessions').insert({user_id:session.user.id,title:title.trim()||((profile?.discipline||'Taekwondo')+' session'),session_date:new Date().toISOString().slice(0,10),minutes:mins,intensity:'Session Mode',notes:notes.trim()||null,discipline:profile?.discipline||null,sport:'taekwondo'});setBusy(false);if(error){return}setRunning(false);router.replace('/training')};
 const mm=String(Math.floor(seconds/60)).padStart(2,'0'),ss=String(seconds%60).padStart(2,'0');
 return <Screen><Header back eyebrow="TRAINING MODE" title="Session Mode" subtitle="Start, train, finish. The completed session is saved to your existing training history."/>
 <Card accent><Text style={{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:1.2}}>LIVE SESSION</Text><Text style={{color:c.text,fontSize:54,fontWeight:'900',letterSpacing:2,textAlign:'center',marginVertical:10}}>{mm}:{ss}</Text><View style={{flexDirection:'row',gap:9}}><Button title={running?'PAUSE':'START'} onPress={()=>{started.current=true;setRunning(!running)}}/><Button title="FINISH & SAVE" onPress={finish} busy={busy} secondary/></View></Card>
 <Field label="SESSION NAME" value={title} onChangeText={setTitle} placeholder={profile?.discipline==='poomsae'?'Poomsae performance session':'Kyorugi sparring session'}/>
 <Field label="SESSION NOTES" value={notes} onChangeText={setNotes} placeholder="What did you work on?" />
 <Card><Text style={{color:c.muted,fontSize:8,fontWeight:'900',letterSpacing:1.2}}>SUGGESTED FLOW</Text>{blocks(profile?.discipline).map((x,i)=><View key={x} style={{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:8,borderBottomWidth:i===blocks(profile?.discipline).length-1?0:1,borderBottomColor:c.border}}><Text style={{color:c.accentBright,fontWeight:'900',width:22}}>{i+1}</Text><Text style={{color:c.text,fontSize:12,fontWeight:'800'}}>{x}</Text></View>)}</Card>
 <Card><Text style={{color:c.text,fontSize:13,fontWeight:'900'}}>Why this exists</Text><Text style={{color:c.muted,fontSize:10,lineHeight:16}}>It uses the same training_sessions table as the existing Training screen, so there is one training history instead of two.</Text></Card>
 </Screen>;
}