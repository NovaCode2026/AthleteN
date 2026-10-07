// @ts-nocheck
import { useCallback,useEffect,useState } from 'react';
import { Alert,Pressable,ScrollView,Text,View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Screen,Header,Card,c } from '@/components/mobile-ui';

export default function SettingsScreen(){
 const {session,profile,signOut}=useAuth(); const [blocked,setBlocked]=useState<any[]>([]); const [message,setMessage]=useState('');
 const load=useCallback(async()=>{if(!session)return;const {data,error}=await supabase.from('user_blocks').select('blocked_user_id,created_at').eq('blocker_user_id',session.user.id);if(error){setMessage(error.message);return}const ids=(data||[]).map((x:any)=>x.blocked_user_id);if(!ids.length){setBlocked([]);return}const {data:people,error:e}=await supabase.from('profiles').select('user_id,full_name,username,account_code').in('user_id',ids);if(e)setMessage(e.message);setBlocked((people||[]).map((p:any)=>({...p,created_at:(data||[]).find((b:any)=>b.blocked_user_id===p.user_id)?.created_at})));},[session]);
 useEffect(()=>{void load()},[load]);
 async function unblock(id:string){const {error}=await supabase.rpc('unblock_messaging_user',{p_user_id:id});if(error)setMessage(error.message);else await load();}
 return <Screen><Header back eyebrow="ATHLETEN SETTINGS" title="Settings" subtitle="Account, privacy, communication and app controls in one place."/>
 <ScrollView contentContainerStyle={{paddingBottom:40}}>
  <Text style={section}>ACCOUNT</Text>
  <Card><Row title="Profile & athlete identity" desc="Name, sport, club, coach, discipline and profile photo." onPress={()=>router.push('/profile')}/><Row title="Plan & billing" desc="Subscription, features and AI usage." onPress={()=>router.push('/plans')}/><Row title="Change password" desc="Update your account password." onPress={()=>router.push('/change-password')}/></Card>
  <Text style={section}>MESSAGING & PRIVACY</Text>
  <Card><Row title="Messages" desc="Account code, search, chats and conversation controls." onPress={()=>router.push('/messages')}/><Row title="Blocked accounts" desc="Review blocked users and unblock them." onPress={()=>{}}/>{blocked.length?blocked.map((p:any)=><View key={p.user_id} style={blockedRow}><View style={{flex:1}}><Text style={name}>{p.full_name||'Athlete'}</Text><Text style={muted}>@{p.username||'unknown'} · {p.account_code||'no code'}</Text></View><Pressable onPress={()=>void unblock(p.user_id)} style={unblock}><Text style={unblockText}>UNBLOCK</Text></Pressable></View>):<Text style={muted}>No blocked accounts.</Text>}</Card>
  <Text style={section}>ALERTS & PERSONALIZATION</Text>
  <Card><Row title="Notification settings" desc="Training, competition, coach and account alerts." onPress={()=>router.push('/notification-settings')}/><Row title="Navigation settings" desc="Choose and reorder your bottom navigation." onPress={()=>router.push('/navigation-settings')}/></Card>
  <Text style={section}>TEAM</Text>
  <Card><Row title="Coach & Academy" desc="Connect to your coach or academy." onPress={()=>router.push('/team')}/><Row title="Attendance" desc="View attendance and team participation." onPress={()=>router.push('/attendance')}/></Card>
  <Text style={section}>DATA & SUPPORT</Text>
  <Card><Row title="Documents" desc="Athlete documents and certificates." onPress={()=>router.push('/documents')}/><Row title="Support" desc="Get help with AthleteN." onPress={()=>router.push('/support')}/><Row title="Feedback" desc="Send product feedback to NovaCode." onPress={()=>router.push('/feedback')}/><Row title="Policies" desc="Review AthleteN policies and terms." onPress={()=>router.push('/policies')}/></Card>
  <Text style={section}>ACCOUNT ACTION</Text>
  <Pressable onPress={()=>Alert.alert('Sign out?','You can sign back in anytime.',[{text:'Cancel',style:'cancel'},{text:'Sign out',style:'destructive',onPress:()=>void signOut()}])} style={signout}><Text style={signoutText}>SIGN OUT</Text></Pressable>
  {message?<Text style={error}>{message}</Text>:null}
 </ScrollView></Screen>
}
function Row({title,desc,onPress}:{title:string;desc:string;onPress:()=>void}){return <Pressable onPress={onPress} style={row}><View style={{flex:1}}><Text style={name}>{title}</Text><Text style={muted}>{desc}</Text></View><Text style={arrow}>›</Text></Pressable>}
const section:any={color:c.muted,fontSize:9,fontWeight:'900',letterSpacing:1.3,marginTop:14,marginBottom:7};
const row:any={flexDirection:'row',alignItems:'center',paddingVertical:13,borderBottomWidth:1,borderBottomColor:c.border};
const name:any={color:c.text,fontSize:12,fontWeight:'900'};
const muted:any={color:c.muted,fontSize:9,lineHeight:14,marginTop:2};
const arrow:any={color:c.accentBright,fontSize:24};
const blockedRow:any={flexDirection:'row',alignItems:'center',paddingVertical:10,borderBottomWidth:1,borderBottomColor:c.border};
const unblock:any={borderWidth:1,borderColor:c.border,borderRadius:9,padding:8};
const unblockText:any={color:c.accentBright,fontSize:8,fontWeight:'900'};
const signout:any={borderWidth:1,borderColor:c.danger,borderRadius:12,padding:14,alignItems:'center',marginTop:8};
const signoutText:any={color:c.danger,fontSize:9,fontWeight:'900'};
const error:any={color:c.danger,fontSize:10,marginTop:10};
