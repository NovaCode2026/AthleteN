import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

const c=Colors.dark;

export default function ScannerScreen(){
 const {session}=useAuth();
 const [url,setUrl]=useState('');
 const [scans,setScans]=useState<any[]>([]);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');

 const load=useCallback(async()=>{
  if(!session)return;
  const {data,error}=await supabase.from('tournament_scans').select('id,source_url,tournament_name,tournament_date,venue,registration_deadline,weigh_in_information,categories,notices,pdfs,schedules_results,status,last_checked_at,next_check_at,detected_changes,created_at').eq('user_id',session.user.id).order('created_at',{ascending:false});
  if(error)setMessage(error.message);else setScans(data||[]);
 },[session]);
 useEffect(()=>{void load()},[load]);

 async function saveScan(){
  if(!session||!url.trim()){setMessage('A source URL is required.');return}
  try{new URL(url.trim())}catch{setMessage('Enter a valid URL.');return}
  setBusy(true);setMessage('');
  const {error}=await supabase.from('tournament_scans').upsert({user_id:session.user.id,source_url:url.trim(),status:'pending'},{onConflict:'user_id,source_url'});
  setBusy(false);
  if(error)setMessage(error.message);else{setUrl('');setMessage('Source saved. The scanner record is ready for processing by the configured backend scanner.');await load()}
 }
 async function remove(id:string){
  setBusy(true);const {error}=await supabase.from('tournament_scans').delete().eq('id',id).eq('user_id',session?.user.id);setBusy(false);if(error)setMessage(error.message);else await load();
 }
 return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
  <Text style={styles.eyebrow}>ATHLETEN TOOLS</Text><Text style={styles.title}>Tournament scanner</Text>
  <Text style={styles.sub}>Save official tournament sources and review the intelligence returned by the AthleteN backend. This screen never invents scan results.</Text>
  <View style={styles.card}>
   <Text style={styles.label}>Source URL *</Text>
   <TextInput value={url} onChangeText={setUrl} placeholder="https://..." placeholderTextColor={c.muted} autoCapitalize="none" keyboardType="url" style={styles.input}/>
   <Pressable onPress={saveScan} disabled={busy} style={styles.button}>{busy?<ActivityIndicator color="#fff"/>:<Text style={styles.buttonText}>SAVE SOURCE</Text>}</Pressable>
   {!!message&&<Text style={styles.message}>{message}</Text>}
  </View>
  <Text style={styles.section}>SAVED SOURCES ({scans.length})</Text>
  {scans.length===0?<View style={styles.card}><Text style={styles.cardTitle}>No scans saved</Text><Text style={styles.meta}>Add a tournament website or other supported source above.</Text></View>:scans.map(s=><View style={styles.card} key={s.id}>
   <Text style={styles.cardTitle}>{s.tournament_name||'Pending scan'}</Text>
   <Text style={styles.url}>{s.source_url}</Text>
   <View style={styles.row}><Text style={styles.meta}>Status: {s.status}</Text>{s.tournament_date&&<Text style={styles.meta}>Date: {s.tournament_date}</Text>}</View>
   {s.venue?<Text style={styles.meta}>Venue: {s.venue}</Text>:null}
   {s.registration_deadline?<Text style={styles.meta}>Registration deadline: {s.registration_deadline}</Text>:null}
   {s.weigh_in_information?<Text style={styles.meta}>Weigh-in: {s.weigh_in_information}</Text>:null}
   {s.categories?<Text style={styles.meta}>Categories: {s.categories}</Text>:null}
   {s.notices?<Text style={styles.meta}>Notices: {s.notices}</Text>:null}
   {s.schedules_results?<Text style={styles.meta}>Schedule/results: {s.schedules_results}</Text>:null}
   {s.detected_changes?<Text style={styles.change}>Detected changes: {s.detected_changes}</Text>:null}
   {Array.isArray(s.pdfs)&&s.pdfs.length>0?<Text style={styles.meta}>Documents found: {s.pdfs.length}</Text>:null}
   <View style={styles.actions}>
    <Pressable onPress={()=>Linking.openURL(s.source_url)} style={styles.secondary}><Text style={styles.secondaryText}>OPEN SOURCE</Text></Pressable>
    <Pressable onPress={()=>remove(s.id)} disabled={busy} style={styles.secondary}><Text style={styles.deleteText}>DELETE</Text></Pressable>
   </View>
   <Text style={styles.meta}>Last checked: {s.last_checked_at||'Not checked yet'}</Text>
  </View>)}
 </ScrollView>
}
const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:c.background},content:{padding:20,paddingTop:52,paddingBottom:50,gap:12},eyebrow:{color:c.accent,fontSize:10,fontWeight:'900',letterSpacing:1.5},title:{color:c.text,fontSize:29,fontWeight:'800'},sub:{color:c.muted,fontSize:14,lineHeight:20},section:{color:c.muted,fontSize:10,fontWeight:'900',letterSpacing:1.5,marginTop:8},card:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:17,padding:16,gap:9},label:{color:c.text,fontSize:12,fontWeight:'700'},input:{backgroundColor:c.background,borderWidth:1,borderColor:c.border,borderRadius:12,color:c.text,padding:14,fontSize:14},button:{backgroundColor:c.accent,borderRadius:13,padding:14,alignItems:'center'},buttonText:{color:'#fff',fontSize:11,fontWeight:'900',letterSpacing:1},message:{color:'#B6D0FF',fontSize:12},cardTitle:{color:c.text,fontSize:16,fontWeight:'750'},meta:{color:c.muted,fontSize:12,lineHeight:18},url:{color:'#8DB9FF',fontSize:11},row:{flexDirection:'row',justifyContent:'space-between',gap:10},change:{color:'#B6D0FF',fontSize:12,lineHeight:18},actions:{flexDirection:'row',gap:10,marginTop:3},secondary:{flex:1,borderWidth:1,borderColor:c.border,borderRadius:11,padding:11,alignItems:'center'},secondaryText:{color:c.text,fontSize:10,fontWeight:'900',letterSpacing:1},deleteText:{color:'#F0A8B1',fontSize:10,fontWeight:'900',letterSpacing:1}
});
