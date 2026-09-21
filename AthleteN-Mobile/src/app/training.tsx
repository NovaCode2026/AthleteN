import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

const c=Colors.dark;

export default function TrainingScreen(){
 const {session,profile}=useAuth();
 const [title,setTitle]=useState('');
 const [minutes,setMinutes]=useState('');
 const [intensity,setIntensity]=useState('');
 const [notes,setNotes]=useState('');
 const [items,setItems]=useState<any[]>([]);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');

 const load=useCallback(async()=>{
  if(!session)return;
  const {data,error}=await supabase.from('training_sessions').select('id,title,session_date,minutes,intensity,notes').eq('user_id',session.user.id).order('session_date',{ascending:false}).order('created_at',{ascending:false}).limit(50);
  if(error)setMessage(error.message); else setItems(data||[]);
 },[session]);
 useEffect(()=>{void load()},[load]);

 async function add(){
  const mins=Number(minutes);
  if(!session||!title.trim()||!Number.isFinite(mins)||mins<=0){setMessage('Session title and a duration greater than zero are required.');return}
  setBusy(true);setMessage('');
  const {error}=await supabase.from('training_sessions').insert({user_id:session.user.id,title:title.trim(),session_date:new Date().toISOString().slice(0,10),minutes:mins,intensity:intensity.trim()||null,notes:notes.trim()||null});
  setBusy(false);
  if(error)setMessage(error.message);else{setTitle('');setMinutes('');setIntensity('');setNotes('');setMessage('Session saved to your account.');await load()}
 }
 async function remove(id:string){
  setBusy(true);setMessage('');
  const {error}=await supabase.from('training_sessions').delete().eq('id',id).eq('user_id',session?.user.id);
  setBusy(false);
  if(error)setMessage(error.message);else await load();
 }

 return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
  <Text style={styles.eyebrow}>TRAINING</Text><Text style={styles.title}>Training log</Text>
  <Text style={styles.sub}>{profile?.discipline || 'Taekwondo'} sessions stored against your account.</Text>
  <View style={styles.card}>
   <Field label="Session title *" value={title} onChangeText={setTitle} placeholder={profile?.discipline==='Poomsae'?'e.g. Poomsae technique':'e.g. Kyorugi sparring'}/>
   <Field label="Duration (minutes) *" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" placeholder="60"/>
   <Field label="Intensity" value={intensity} onChangeText={setIntensity} placeholder="Easy / Moderate / Hard"/>
   <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="What did you work on?"/>
   {!!message&&<Text style={styles.message}>{message}</Text>}
   <Pressable onPress={add} disabled={busy} style={styles.button}>{busy?<ActivityIndicator color="#fff"/>:<Text style={styles.buttonText}>SAVE SESSION</Text>}</Pressable>
  </View>
  <Text style={styles.section}>HISTORY ({items.length})</Text>
  {items.length===0?<View style={styles.card}><Text style={styles.cardTitle}>No sessions yet</Text><Text style={styles.meta}>Save your first training session above.</Text></View>:items.map(item=><View style={styles.card} key={item.id}>
   <View style={styles.cardRow}><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.minutes}>{item.minutes} min</Text></View>
   <Text style={styles.meta}>{item.session_date}{item.intensity?' • '+item.intensity:''}</Text>
   {item.notes?<Text style={styles.note}>{item.notes}</Text>:null}
   <Pressable onPress={()=>remove(item.id)} disabled={busy} style={styles.delete}><Text style={styles.deleteText}>DELETE</Text></Pressable>
  </View>)}
 </ScrollView>
}

function Field({label,value,onChangeText,placeholder,keyboardType}:{label:string;value:string;onChangeText:(v:string)=>void;placeholder:string;keyboardType?:any}){return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={c.muted} keyboardType={keyboardType} style={styles.input}/></View>}
const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:c.background},content:{padding:20,gap:12,paddingTop:52,paddingBottom:40},eyebrow:{color:c.accent,fontSize:10,fontWeight:'900',letterSpacing:1.5},title:{color:c.text,fontSize:29,fontWeight:'800'},sub:{color:c.muted,fontSize:14,lineHeight:20,marginBottom:4},
 card:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:17,padding:16,gap:9},field:{gap:6},label:{color:c.text,fontSize:12,fontWeight:'700'},input:{backgroundColor:c.background,borderWidth:1,borderColor:c.border,borderRadius:13,color:c.text,padding:14,fontSize:14},message:{color:'#B6D0FF',fontSize:12},button:{backgroundColor:c.accent,borderRadius:14,padding:15,alignItems:'center',marginTop:2},buttonText:{color:'#fff',fontSize:12,fontWeight:'900',letterSpacing:1},section:{color:c.muted,fontSize:10,fontWeight:'900',letterSpacing:1.5,marginTop:10},cardRow:{flexDirection:'row',justifyContent:'space-between',gap:10},cardTitle:{color:c.text,fontSize:15,fontWeight:'750',flex:1},minutes:{color:c.accent,fontSize:12,fontWeight:'800'},meta:{color:c.muted,fontSize:12},note:{color:'#C0C7D5',fontSize:12,lineHeight:18},delete:{alignSelf:'flex-start',paddingVertical:5},deleteText:{color:'#F0A8B1',fontSize:10,fontWeight:'900',letterSpacing:1}
});
