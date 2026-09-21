import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

const c=Colors.dark;

export default function CompeteScreen(){
 const {session,profile}=useAuth();
 const [tournaments,setTournaments]=useState<any[]>([]);
 const [selected,setSelected]=useState<string|null>(null);
 const [matches,setMatches]=useState<any[]>([]);
 const [medals,setMedals]=useState<any[]>([]);
 const [checklist,setChecklist]=useState<any[]>([]);
 const [name,setName]=useState(''); const [date,setDate]=useState(''); const [location,setLocation]=useState('');
 const [opponent,setOpponent]=useState(''); const [round,setRound]=useState(''); const [result,setResult]=useState(''); const [score,setScore]=useState('');
 const [medalEvent,setMedalEvent]=useState(''); const [medalType,setMedalType]=useState(''); const [medalDate,setMedalDate]=useState('');
 const [item,setItem]=useState('');
 const [busy,setBusy]=useState(false); const [message,setMessage]=useState('');

 const load=useCallback(async()=>{
  if(!session)return;
  const uid=session.user.id;
  const [t,m,cx]=await Promise.all([
   supabase.from('tournaments').select('id,name,starts_at,location,status,result').eq('user_id',uid).order('starts_at',{ascending:false}),
   supabase.from('medals').select('id,event_name,medal_type,category,awarded_at,result_notes').eq('user_id',uid).order('awarded_at',{ascending:false}),
   supabase.from('competition_checklists').select('id,item,category,completed').eq('user_id',uid).order('created_at',{ascending:false}),
  ]);
  setTournaments(t.data||[]); setMedals(m.data||[]); setChecklist(cx.data||[]);
  if(selected){const r=await supabase.from('matches').select('id,opponent_name,division,round_name,result,score,notes').eq('user_id',uid).eq('tournament_id',selected).order('created_at',{ascending:false});setMatches(r.data||[])}
 },[session,selected]);
 useEffect(()=>{void load()},[load]);

 async function addTournament(){
  if(!session||!name.trim()){setMessage('Tournament name is required.');return}
  setBusy(true); const {data,error}=await supabase.from('tournaments').insert({user_id:session.user.id,name:name.trim(),starts_at:date.trim()||null,location:location.trim()||null,status:'planned'}).select().single(); setBusy(false);
  if(error)setMessage(error.message);else{setName('');setDate('');setLocation('');setSelected(data.id);setMessage('Tournament saved.');await load()}
 }
 async function addMatch(){
  if(!session||!selected||!opponent.trim()){setMessage('Select a tournament and enter the opponent.');return}
  setBusy(true);const {error}=await supabase.from('matches').insert({user_id:session.user.id,tournament_id:selected,opponent_name:opponent.trim(),round_name:round.trim()||null,result:result.trim()||null,score:score.trim()||null});setBusy(false);
  if(error)setMessage(error.message);else{setOpponent('');setRound('');setResult('');setScore('');setMessage('Match saved.');await load()}
 }
 async function addMedal(){
  if(!session||!medalEvent.trim()||!medalType.trim()){setMessage('Event and medal type are required.');return}
  setBusy(true);const {error}=await supabase.from('medals').insert({user_id:session.user.id,event_name:medalEvent.trim(),medal_type:medalType.trim(),awarded_at:medalDate.trim()||null,category:profile?.discipline||null});setBusy(false);
  if(error)setMessage(error.message);else{setMedalEvent('');setMedalType('');setMedalDate('');setMessage('Medal saved.');await load()}
 }
 async function addChecklist(){
  if(!session||!item.trim()){setMessage('Checklist item is required.');return}
  setBusy(true);const {error}=await supabase.from('competition_checklists').insert({user_id:session.user.id,item:item.trim(),category:'equipment',completed:false});setBusy(false);
  if(error)setMessage(error.message);else{setItem('');await load()}
 }
 async function toggleCheck(x:any){
  const {error}=await supabase.from('competition_checklists').update({completed:!x.completed}).eq('id',x.id).eq('user_id',session?.user.id);
  if(error)setMessage(error.message);else await load();
 }
 async function remove(table:string,id:string){setBusy(true);const {error}=await supabase.from(table).delete().eq('id',id).eq('user_id',session?.user.id);setBusy(false);if(error)setMessage(error.message);else await load()}

 return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
  <Text style={styles.eyebrow}>COMPETE</Text><Text style={styles.title}>Competition center</Text><Text style={styles.sub}>Everything here is saved to your AthleteN account.</Text>
  <Section title="ADD TOURNAMENT">
   <Field label="Tournament name *" value={name} onChangeText={setName} placeholder="e.g. State Championship"/>
   <Field label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} placeholder="2026-10-05"/>
   <Field label="Location" value={location} onChangeText={setLocation} placeholder="City / venue"/>
   <Button title="SAVE TOURNAMENT" onPress={addTournament} busy={busy}/>
  </Section>
  <Text style={styles.section}>TOURNAMENTS ({tournaments.length})</Text>
  {tournaments.length===0?<Empty text="No tournaments saved."/>:tournaments.map(t=><Pressable key={t.id} onPress={()=>setSelected(t.id)} style={[styles.card,selected===t.id&&styles.selected]}>
   <View style={styles.cardRow}><Text style={styles.cardTitle}>{t.name}</Text><Text style={styles.link}>{selected===t.id?'SELECTED':'OPEN'}</Text></View>
   <Text style={styles.meta}>{t.starts_at||'Date not set'}{t.location?' • '+t.location:''}</Text><Text style={styles.meta}>Status: {t.status||'planned'}{t.result?' • Result: '+t.result:''}</Text>
  </Pressable>)}

  {selected&&<Section title="MATCHES FOR SELECTED TOURNAMENT">
   <Field label="Opponent *" value={opponent} onChangeText={setOpponent} placeholder="Opponent name"/>
   <Field label="Round" value={round} onChangeText={setRound} placeholder="Quarterfinal / Final"/>
   <Field label="Result" value={result} onChangeText={setResult} placeholder="Win / Loss / Pending"/>
   <Field label="Score" value={score} onChangeText={setScore} placeholder="12-8"/>
   <Button title="SAVE MATCH" onPress={addMatch} busy={busy}/>
   {matches.map(m=><View style={styles.innerCard} key={m.id}><View style={styles.cardRow}><Text style={styles.cardTitle}>{m.opponent_name}</Text><Text style={styles.link}>{m.result||'Pending'}</Text></View><Text style={styles.meta}>{m.round_name||'Round not set'}{m.score?' • '+m.score:''}</Text><Pressable onPress={()=>remove('matches',m.id)}><Text style={styles.deleteText}>DELETE</Text></Pressable></View>)}
   {matches.length===0&&<Text style={styles.meta}>No matches recorded for this tournament.</Text>}
  </Section>}

  <Section title="MEDALS">
   <Field label="Event *" value={medalEvent} onChangeText={setMedalEvent} placeholder="Event name"/>
   <Field label="Medal type *" value={medalType} onChangeText={setMedalType} placeholder="Gold / Silver / Bronze"/>
   <Field label="Awarded date" value={medalDate} onChangeText={setMedalDate} placeholder="2026-09-21"/>
   <Button title="SAVE MEDAL" onPress={addMedal} busy={busy}/>
   {medals.map(m=><View style={styles.innerCard} key={m.id}><View style={styles.cardRow}><Text style={styles.cardTitle}>{m.event_name}</Text><Text style={styles.link}>{m.medal_type}</Text></View><Text style={styles.meta}>{m.awarded_at||'Date not set'}{m.category?' • '+m.category:''}</Text><Pressable onPress={()=>remove('medals',m.id)}><Text style={styles.deleteText}>DELETE</Text></Pressable></View>)}
  </Section>

  <Section title="COMPETITION CHECKLIST">
   <Field label="New item *" value={item} onChangeText={setItem} placeholder="Passport / dobok / protector"/>
   <Button title="ADD CHECKLIST ITEM" onPress={addChecklist} busy={busy}/>
   {checklist.map(x=><View style={styles.checkRow} key={x.id}><Pressable onPress={()=>toggleCheck(x)} style={[styles.check,x.completed&&styles.checkDone]}><Text style={styles.checkText}>{x.completed?'✓':''}</Text></Pressable><Text style={[styles.checkLabel,x.completed&&styles.done]}>{x.item}</Text><Pressable onPress={()=>remove('competition_checklists',x.id)}><Text style={styles.deleteText}>×</Text></Pressable></View>)}
   {checklist.length===0&&<Text style={styles.meta}>No checklist items yet.</Text>}
  </Section>
  {!!message&&<Text style={styles.message}>{message}</Text>}
 </ScrollView>
}

function Section({title,children}:{title:string;children:React.ReactNode}){return <View style={styles.sectionBlock}><Text style={styles.section}>{title}</Text><View style={styles.card}>{children}</View></View>}
function Field({label,value,onChangeText,placeholder,keyboardType}:{label:string;value:string;onChangeText:(v:string)=>void;placeholder:string;keyboardType?:any}){return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={c.muted} keyboardType={keyboardType} style={styles.input}/></View>}
function Button({title,onPress,busy}:{title:string;onPress:()=>void;busy:boolean}){return <Pressable onPress={onPress} disabled={busy} style={styles.button}>{busy?<ActivityIndicator color="#fff"/>:<Text style={styles.buttonText}>{title}</Text>}</Pressable>}
function Empty({text}:{text:string}){return <View style={styles.card}><Text style={styles.meta}>{text}</Text></View>}
const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:c.background},content:{padding:20,paddingTop:52,paddingBottom:50,gap:12},eyebrow:{color:c.accent,fontSize:10,fontWeight:'900',letterSpacing:1.5},title:{color:c.text,fontSize:29,fontWeight:'800'},sub:{color:c.muted,fontSize:14,lineHeight:20},sectionBlock:{gap:8},section:{color:c.muted,fontSize:10,fontWeight:'900',letterSpacing:1.5,marginTop:7},card:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:17,padding:16,gap:9},selected:{borderColor:c.accent},innerCard:{backgroundColor:c.background,borderWidth:1,borderColor:c.border,borderRadius:13,padding:13,gap:5},cardRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10},cardTitle:{color:c.text,fontSize:15,fontWeight:'750',flex:1},meta:{color:c.muted,fontSize:12,lineHeight:18},link:{color:c.accent,fontSize:10,fontWeight:'900',letterSpacing:1},field:{gap:6},label:{color:c.text,fontSize:12,fontWeight:'700'},input:{backgroundColor:c.background,borderWidth:1,borderColor:c.border,borderRadius:12,color:c.text,padding:13,fontSize:14},button:{backgroundColor:c.accent,borderRadius:13,padding:14,alignItems:'center'},buttonText:{color:'#fff',fontSize:11,fontWeight:'900',letterSpacing:1},message:{color:'#B6D0FF',fontSize:12},deleteText:{color:'#F0A8B1',fontSize:10,fontWeight:'900',letterSpacing:1},checkRow:{flexDirection:'row',alignItems:'center',gap:10,borderBottomWidth:1,borderBottomColor:c.border,paddingVertical:8},check:{width:26,height:26,borderRadius:8,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},checkDone:{backgroundColor:c.accent,borderColor:c.accent},checkText:{color:'#fff',fontWeight:'900'},checkLabel:{color:c.text,flex:1,fontSize:13},done:{textDecorationLine:'line-through',color:c.muted}
});
