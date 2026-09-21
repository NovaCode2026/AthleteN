import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

const c=Colors.dark;

export default function TrainingScreen(){
 const {session}=useAuth();
 const [title,setTitle]=useState('');
 const [minutes,setMinutes]=useState('');
 const [intensity,setIntensity]=useState('');
 const [notes,setNotes]=useState('');
 const [items,setItems]=useState<any[]>([]);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');

 const load=useCallback(async()=>{if(!session)return;const {data}=await supabase.from('training_sessions').select('id,title,session_date,minutes,intensity,notes').eq('user_id',session.user.id).order('session_date',{ascending:false}).limit(20);setItems(data||[])},[session]);
 useEffect(()=>{void load()},[load]);

 async function add(){
  if(!session||!title.trim()||Number(minutes)<=0){setMessage('Enter a session title and duration.');return}
  setBusy(true);setMessage('');
  const {error}=await supabase.from('training_sessions').insert({user_id:session.user.id,title:title.trim(),session_date:new Date().toISOString().slice(0,10),minutes:Number(minutes),intensity:intensity.trim()||null,notes:notes.trim()||null});
  setBusy(false);
  if(error)setMessage(error.message);else{setTitle('');setMinutes('');setIntensity('');setNotes('');setMessage('Training session saved.');await load()}
 }

 return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
  <Text style={styles.eyebrow}>TRAINING</Text><Text style={styles.title}>Log your work</Text><Text style={styles.sub}>Keep every session in your AthleteN history.</Text>
  <Field label="Session title" value={title} onChangeText={setTitle} placeholder="e.g. Kyorugi sparring"/>
  <Field label="Duration (minutes)" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" placeholder="60"/>
  <Field label="Intensity" value={intensity} onChangeText={setIntensity} placeholder="Easy / Moderate / Hard"/>
  <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="What did you work on?"/>
  {!!message&&<Text style={styles.message}>{message}</Text>}
  <Pressable onPress={add} disabled={busy} style={styles.button}>{busy?<ActivityIndicator color="#fff"/>:<Text style={styles.buttonText}>SAVE SESSION</Text>}</Pressable>
  <Text style={styles.section}>RECENT SESSIONS</Text>
  {items.length===0?<View style={styles.card}><Text style={styles.cardTitle}>No sessions yet</Text><Text style={styles.meta}>Your saved training sessions will appear here.</Text></View>:items.map(item=><View style={styles.card} key={item.id}><View style={styles.cardRow}><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.minutes}>{item.minutes} min</Text></View><Text style={styles.meta}>{item.session_date}{item.intensity?'  •  '+item.intensity:''}</Text>{item.notes?<Text style={styles.note}>{item.notes}</Text>:null}</View>)}
 </ScrollView>
}

function Field({label,value,onChangeText,placeholder,keyboardType}:{label:string;value:string;onChangeText:(v:string)=>void;placeholder:string;keyboardType?:any}){return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={c.muted} keyboardType={keyboardType} style={styles.input}/></View>}

const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:c.background},content:{padding:20,gap:12,paddingTop:55,paddingBottom:40},eyebrow:{color:c.accent,fontSize:10,fontWeight:'900',letterSpacing:1.5},title:{color:c.text,fontSize:29,fontWeight:'800'},sub:{color:c.muted,fontSize:14,lineHeight:20,marginBottom:8},field:{gap:6},label:{color:c.text,fontSize:12,fontWeight:'700'},input:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:13,color:c.text,padding:14,fontSize:14},message:{color:'#B6D0FF',fontSize:12},button:{backgroundColor:c.accent,borderRadius:14,padding:15,alignItems:'center',marginTop:2},buttonText:{color:'#fff',fontSize:12,fontWeight:'900',letterSpacing:1},section:{color:c.muted,fontSize:10,fontWeight:'900',letterSpacing:1.5,marginTop:14},card:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:17,padding:16,gap:6},cardRow:{flexDirection:'row',justifyContent:'space-between',gap:10},cardTitle:{color:c.text,fontSize:15,fontWeight:'750',flex:1},minutes:{color:c.accent,fontSize:12,fontWeight:'800'},meta:{color:c.muted,fontSize:12},note:{color:'#C0C7D5',fontSize:12,lineHeight:18}
});
