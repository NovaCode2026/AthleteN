// @ts-nocheck
import { useCallback,useEffect,useState } from 'react';
import { Pressable,Text,View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Screen,Header,Section,Card,Button,Field,c,RefreshButton } from '@/components/mobile-ui';
import { ATHLETE_QUESTS,getQuestPeriodKey } from '@/lib/athlete-quests';

export default function Missions(){
 const {session}=useAuth();const uid=session?.user?.id;
 const [rows,setRows]=useState<any[]>([]);const [questRows,setQuestRows]=useState<any[]>([]);
 const [title,setTitle]=useState('');const [target,setTarget]=useState('');const [unit,setUnit]=useState('sessions');
 const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 const load=useCallback(async()=>{
  if(!uid)return;setBusy(true);
  const [m,q]=await Promise.all([
   supabase.from('athlete_challenges').select('id,title,target_value,current_value,unit,due_date,status').eq('user_id',uid).order('status',{ascending:true}).order('due_date',{ascending:true}),
   supabase.from('athlete_quest_completions').select('quest_key,period_key,completed_at').eq('user_id',uid)
  ]);
  if(m.error)setMessage(m.error.message);else setRows(m.data||[]);
  if(q.error)setMessage('Quest progress is unavailable until the latest AthleteN data update is installed.');else setQuestRows(q.data||[]);
  setBusy(false);
 },[uid]);
 useEffect(()=>{void load()},[load]);
 const isDone=(quest)=>questRows.some(row=>row.quest_key===quest.key&&row.period_key===getQuestPeriodKey(quest.cadence));
 const toggleQuest=async(quest)=>{
  if(!uid)return;setBusy(true);setMessage('');
  const period=getQuestPeriodKey(quest.cadence);const done=isDone(quest);
  const result=done
   ? await supabase.from('athlete_quest_completions').delete().eq('user_id',uid).eq('quest_key',quest.key).eq('period_key',period)
   : await supabase.from('athlete_quest_completions').insert({user_id:uid,quest_key:quest.key,period_key:period});
  if(result.error)setMessage(result.error.message);else await load();
  setBusy(false);
 };
 const add=async()=>{
  const n=Number(target);if(!uid||!title.trim()||!Number.isFinite(n)||n<=0){setMessage('Add a mission title and a positive target.');return}
  setBusy(true);const {error}=await supabase.from('athlete_challenges').insert({user_id:uid,title:title.trim(),target_value:n,current_value:0,unit:unit.trim()||'sessions',status:'active',created_by:uid});
  if(error)setMessage(error.message);else{setTitle('');setTarget('');setMessage('Personal mission created.');await load()}setBusy(false);
 };
 const complete=async(id:string)=>{
  if(!uid)return;setBusy(true);const {error}=await supabase.from('athlete_challenges').update({status:'completed'}).eq('id',id).eq('user_id',uid);
  if(error)setMessage(error.message);else await load();setBusy(false);
 };
 return <Screen>
  <Header eyebrow="ATHLETEN STREAKS & QUESTS" title="AthleteN Quest" subtitle="Small optional check-ins that support your sporting journey." right={<RefreshButton onPress={()=>void load()} busy={busy}/>}/>
  <Card accent><Text style={{color:c.accentBright,fontSize:9,fontWeight:'900'}}>QUEST PROGRESS</Text><Text style={{color:c.text,fontSize:19,fontWeight:'900'}}>Progress without pressure.</Text><Text style={{color:c.muted,fontSize:10,lineHeight:16}}>Quest completion is for your own tracking. Missing a quest never breaks or resets your training streak, and quests do not award points for extra training volume.</Text></Card>
  {(['daily','weekly','monthly'] as const).map(cadence=><Section key={cadence} title={cadence.toUpperCase()+' QUESTS'}>
   {ATHLETE_QUESTS.filter(x=>x.cadence===cadence).map(quest=>{
    const done=isDone(quest);return <Card key={quest.key}>
     <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10}}>
      <View style={{flex:1,gap:5}}><Text style={{color:c.text,fontSize:13,fontWeight:'900'}}>{quest.title}</Text><Text style={{color:c.muted,fontSize:10,lineHeight:15}}>{quest.description}</Text></View>
      <Pressable accessibilityRole="button" accessibilityState={{checked:done}} disabled={busy} onPress={()=>void toggleQuest(quest)} style={{borderRadius:12,borderWidth:1,borderColor:done?c.success:c.border,paddingHorizontal:11,paddingVertical:9,backgroundColor:done?c.accentSoft:c.surface}}>
       <Text style={{color:done?c.success:c.accentBright,fontSize:9,fontWeight:'900'}}>{done?'DONE · UNDO':'COMPLETE'}</Text>
      </Pressable>
     </View>
    </Card>
   })}
  </Section>)}
  <Section title="PERSONAL MISSIONS">
   <Card><Text style={{color:c.text,fontSize:14,fontWeight:'900'}}>Create your own mission</Text><Text style={{color:c.muted,fontSize:10,lineHeight:15,marginTop:3}}>Use a target that fits your schedule and your coach-approved plan. Avoid adding extra sessions just to finish a target.</Text>
    <Field label="MISSION" value={title} onChangeText={setTitle} placeholder="Example: review my competition notes"/>
    <View style={{flexDirection:'row',gap:9}}><View style={{flex:1}}><Field label="TARGET" value={target} onChangeText={setTarget} placeholder="1" keyboardType="number-pad"/></View><View style={{flex:1}}><Field label="UNIT" value={unit} onChangeText={setUnit} placeholder="reviews"/></View></View>
    <Button title="CREATE PERSONAL MISSION" onPress={add} busy={busy}/>
   </Card>
   {rows.filter(x=>x.status==='active').map(x=><Card key={x.id}><Text style={{color:c.text,fontSize:13,fontWeight:'900'}}>{x.title}</Text><Text style={{color:c.accentBright,fontSize:11,fontWeight:'900',marginTop:3}}>{x.current_value||0} / {x.target_value} {x.unit||''}</Text><Pressable onPress={()=>void complete(x.id)} disabled={busy} style={{marginTop:8}}><Text style={{color:c.success,fontSize:9,fontWeight:'900'}}>MARK COMPLETE</Text></Pressable></Card>)}
   {!rows.some(x=>x.status==='active')?<Card><Text style={{color:c.muted,fontSize:10}}>No personal missions yet.</Text></Card>:null}
   {rows.filter(x=>x.status==='completed').slice(0,8).map(x=><Card key={x.id}><Text style={{color:c.text,fontWeight:'900'}}>{x.title}</Text><Text style={{color:c.success,fontSize:9,fontWeight:'900'}}>COMPLETED</Text></Card>)}
  </Section>
  {message?<Text style={{color:c.warning,fontSize:10}}>{message}</Text>:null}
 </Screen>;
}
