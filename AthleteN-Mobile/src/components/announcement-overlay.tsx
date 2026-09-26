import { useCallback,useEffect,useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/theme';

const c=Colors.dark;

export default function AnnouncementOverlay(){
 const {session}=useAuth();
 const [item,setItem]=useState<any>(null);
 const [busy,setBusy]=useState(false);

 const load=useCallback(async()=>{
  if(!session){setItem(null);return;}
  const {data:announcements}=await supabase.from('announcements').select('id,title,body,published_at').eq('audience','all').not('published_at','is',null).lte('published_at',new Date().toISOString()).order('published_at',{ascending:false}).limit(20);
  if(!announcements?.length){setItem(null);return;}
  const ids=announcements.map((a:any)=>a.id);
  const {data:reads}=await supabase.from('announcement_reads').select('announcement_id').eq('user_id',session.user.id).in('announcement_id',ids);
  const readSet=new Set((reads||[]).map((r:any)=>r.announcement_id));
  setItem(announcements.find((a:any)=>!readSet.has(a.id))||null);
 },[session]);

 useEffect(()=>{
  void load();
  if(!session)return;
  const channel=supabase.channel('global-announcements-'+session.user.id)
   .on('postgres_changes',{event:'INSERT',schema:'public',table:'announcements'},()=>{void load()})
   .subscribe();
  return ()=>{void supabase.removeChannel(channel)};
 },[load,session]);

 async function close(){
  if(!session||!item||busy)return;
  setBusy(true);
  await supabase.from('announcement_reads').upsert({announcement_id:item.id,user_id:session.user.id},{onConflict:'announcement_id,user_id'});
  setBusy(false);
  setItem(null);
  void load();
 }

 if(!item)return null;
 return <Modal visible transparent animationType="fade" onRequestClose={()=>{}} statusBarTranslucent>
  <View style={{flex:1,backgroundColor:'rgba(0,0,0,.72)',justifyContent:'center',padding:22}}>
   <View style={{backgroundColor:c.surfaceRaised,borderWidth:1,borderColor:c.accent,borderRadius:24,padding:20,gap:12}}>
    <Text style={{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:1.5}}>ATHLETEN ANNOUNCEMENT</Text>
    <Text style={{color:c.text,fontSize:23,fontWeight:'900'}}>{item.title}</Text>
    <Text style={{color:c.muted,fontSize:12,lineHeight:19}}>{item.body}</Text>
    <Text style={{color:c.muted,fontSize:8}}>{new Date(item.published_at).toLocaleString()}</Text>
    <Pressable disabled={busy} onPress={()=>void close()} style={{backgroundColor:c.accent,borderRadius:13,paddingVertical:14,alignItems:'center',marginTop:4}}>
     <Text style={{color:'#fff',fontSize:10,fontWeight:'900',letterSpacing:1}}>CLOSE ANNOUNCEMENT</Text>
    </Pressable>
   </View>
  </View>
 </Modal>;
}
