// @ts-nocheck
import { useCallback,useEffect,useState } from 'react';
import { Pressable,Text,View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Screen,Header,Section,Card,Empty,c } from '@/components/mobile-ui';

export default function VerificationReviewScreen(){
 const {profile}=useAuth(); const [rows,setRows]=useState<any[]>([]); const [message,setMessage]=useState(''); const [busy,setBusy]=useState('');
 const allowed=profile?.role==='coach'||profile?.role==='academy_admin'||profile?.role==='academy'||profile?.role==='admin'||profile?.role==='super_admin';
 const load=useCallback(async()=>{if(!allowed)return;const {data,error}=await supabase.rpc('list_pending_weight_verifications');if(error)setMessage(error.message);else setRows(data||[])},[allowed]);
 useEffect(()=>{void load()},[load]);
 async function review(id:string,status:'verified'|'rejected'){setBusy(id+status);setMessage('');const {error}=await supabase.rpc('review_weight_verification',{p_weight_id:id,p_status:status});if(error)setMessage(error.message);else await load();setBusy('')}
 if(!allowed)return <Screen><Header back eyebrow="ATHLETEN TRUST" title="Verification Review" subtitle="Coach and academy verification queue."/><Card><Text style={{color:c.danger,fontWeight:'900'}}>ACCESS RESTRICTED</Text><Text style={{color:c.muted,fontSize:10,marginTop:5}}>Only linked coaches, academy admins or platform admins can review athlete measurements.</Text></Card></Screen>;
 return <Screen><Header back eyebrow="ATHLETEN TRUST" title="Verification Review" subtitle="Review pending athlete measurements before they become verified records."/><Section title={'PENDING · '+rows.length}>{rows.length?rows.map(x=><Card key={x.id}><Text style={{color:c.text,fontSize:14,fontWeight:'900'}}>{x.athlete_name||'Athlete'}</Text><Text style={{color:c.muted,fontSize:10,marginTop:3}}>{Number(x.weight_kg).toFixed(1)} kg · {x.logged_at}</Text><View style={{flexDirection:'row',gap:8,marginTop:11}}><Pressable disabled={!!busy} onPress={()=>void review(x.id,'verified')} style={{flex:1,backgroundColor:c.accent,borderRadius:10,padding:11,alignItems:'center'}}><Text style={{color:'#fff',fontSize:9,fontWeight:'900'}}>{busy===x.id+'verified'?'...':'VERIFY'}</Text></Pressable><Pressable disabled={!!busy} onPress={()=>void review(x.id,'rejected')} style={{flex:1,borderWidth:1,borderColor:c.danger,borderRadius:10,padding:11,alignItems:'center'}}><Text style={{color:c.danger,fontSize:9,fontWeight:'900'}}>{busy===x.id+'rejected'?'...':'REJECT'}</Text></Pressable></View></Card>):<Empty text="No pending weight measurements need review."/>}</Section>{message?<Text style={{color:c.danger,fontSize:10}}>{message}</Text>:null}</Screen>;
}