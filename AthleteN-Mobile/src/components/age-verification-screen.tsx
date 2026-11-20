import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

const c=Colors.dark;
function normalizeDob(value:string){
 const raw=String(value||'').trim();
 const iso=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
 const dmy=raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
 const year=Number(iso?.[1]||dmy?.[3]);
 const month=Number(iso?.[2]||dmy?.[2]);
 const day=Number(iso?.[3]||dmy?.[1]);
 if(!iso&&!dmy)return '';
 const date=new Date(Date.UTC(year,month-1,day));
 if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day||date>new Date())return '';
 return date.toISOString().slice(0,10);
}
function ageFromDob(value:string){
 const normalized=normalizeDob(value);
 if(!normalized)return -1;
 const [year,month,day]=normalized.split('-').map(Number);
 const d=new Date(year,month-1,day);
 const n=new Date();
 let a=n.getFullYear()-d.getFullYear();
 const m=n.getMonth()-d.getMonth();
 if(m<0||(m===0&&n.getDate()<d.getDate()))a--;
 return a;
}
export default function AgeVerificationScreen(){
 const {profile,refreshProfile}=useAuth();
 const [dob,setDob]=useState(String(profile?.date_of_birth||'')),[parentEmail,setParentEmail]=useState(''),[status,setStatus]=useState<string|null>(null),[expires,setExpires]=useState<string|null>(null),[dobLocked,setDobLocked]=useState(Boolean(profile?.date_of_birth)),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const load=useCallback(async()=>{setLoading(true);const {data,error}=await supabase.rpc('get_age_verification_status');if(error)setMessage(error.message);else{const row=data?.[0];setStatus(row?.status||null);setExpires(row?.token_expires_at||null);if(row?.date_of_birth){setDob(row.date_of_birth);setDobLocked(true)}if(row?.parent_email)setParentEmail(row.parent_email)}setLoading(false)},[]);
 useEffect(()=>{void load()},[load]);
 async function submit(){setMessage('');const normalizedDob=normalizeDob(dob);const age=ageFromDob(normalizedDob);if(age<0){setMessage('Enter a valid date of birth in YYYY-MM-DD or DD-MM-YYYY format.');return}if(age<18&&!parentEmail.trim()){setMessage('A parent or guardian email is required for users under 18.');return}setBusy(true);try{const {data,error}=await supabase.functions.invoke('start-parent-approval',{body:{date_of_birth:normalizedDob,parent_email:age<18?parentEmail.trim():'',full_name:profile?.full_name||'AthleteN athlete'}});if(error)throw error;if(data?.error)throw new Error(data.error);setDob(normalizedDob);setStatus(data.status||(age<18?'pending':'not_required'));setExpires(data.expires_at||null);if(data.status==='approved'||data.status==='not_required'){await refreshProfile();setMessage('Age verification is complete. AthleteN is ready.')}else{setMessage('Approval request sent. Your account will unlock after parent/guardian approval.')}}catch(e){setMessage(e instanceof Error?e.message:'Age verification could not be completed.')}finally{setBusy(false)}}
 if(loading)return <View style={s.center}><ActivityIndicator color={c.accent}/><Text style={s.meta}>Checking account safety…</Text></View>;
 if(status==='pending')return <ScrollView style={s.screen} contentContainerStyle={s.content}><Text style={s.kicker}>ATHLETEN • ACCOUNT SAFETY</Text><Text style={s.title}>Waiting for approval</Text><Text style={s.subtitle}>A parent or guardian needs to approve this account before the athlete workspace can open.</Text><View style={s.card}><Text style={s.cardTitle}>PARENT / GUARDIAN APPROVAL</Text><Text style={s.meta}>The approval email has been sent. If it expires, you can resend it below.</Text>{expires?<Text style={s.meta}>Link expires {new Date(expires).toLocaleString()}.</Text>:null}<Pressable style={s.button} onPress={submit} disabled={busy}>{busy?<ActivityIndicator color="#fff"/>:<Text style={s.buttonText}>RESEND APPROVAL</Text>}</Pressable></View>{message?<Text style={s.message}>{message}</Text>:null}</ScrollView>;
 const age=ageFromDob(dob),needsParent=age>=0&&age<18;
 return <ScrollView style={s.screen} contentContainerStyle={s.content}><Text style={s.kicker}>ATHLETEN • ACCOUNT SAFETY</Text><Text style={s.title}>Age verification</Text><Text style={s.subtitle}>Enter your date of birth accurately. AthleteN uses it to determine whether parent/guardian approval is required.</Text><View style={s.card}><Text style={s.label}>DATE OF BIRTH</Text><TextInput value={dob} onChangeText={setDob} editable={!dobLocked} placeholder="YYYY-MM-DD or DD-MM-YYYY" placeholderTextColor={c.muted} style={s.input}/>{dobLocked?<Text style={s.meta}>Date of birth is locked after first submission. Contact support to request a correction.</Text>:null}{needsParent?<><Text style={s.label}>PARENT / GUARDIAN EMAIL</Text><TextInput value={parentEmail} onChangeText={setParentEmail} autoCapitalize="none" keyboardType="email-address" placeholder="parent@example.com" placeholderTextColor={c.muted} style={s.input}/><Text style={s.meta}>Because this account is under 18, a parent/guardian approval step is required.</Text></>:null}<Pressable style={s.button} onPress={submit} disabled={busy}>{busy?<ActivityIndicator color="#fff"/>:<Text style={s.buttonText}>{needsParent?'SEND PARENT APPROVAL':'CONFIRM AGE'}</Text>}</Pressable></View>{message?<Text style={s.message}>{message}</Text>:null}</ScrollView>;
}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:c.background},content:{padding:20,paddingBottom:50,gap:12},center:{flex:1,backgroundColor:c.background,alignItems:'center',justifyContent:'center',gap:10},kicker:{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:1.5},title:{color:c.text,fontSize:28,fontWeight:'900'},subtitle:{color:c.muted,fontSize:12,lineHeight:18},card:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:18,padding:17,gap:11},cardTitle:{color:c.text,fontSize:11,fontWeight:'900',letterSpacing:1},label:{color:c.textSecondary,fontSize:9,fontWeight:'900',letterSpacing:.8},input:{backgroundColor:c.background,borderWidth:1,borderColor:c.border,borderRadius:11,color:c.text,padding:12,fontSize:13},button:{backgroundColor:c.accent,borderRadius:11,padding:13,alignItems:'center'},buttonText:{color:'#fff',fontSize:9,fontWeight:'900',letterSpacing:1},message:{color:c.accentBright,fontSize:11,lineHeight:17},meta:{color:c.muted,fontSize:11,lineHeight:17}});
