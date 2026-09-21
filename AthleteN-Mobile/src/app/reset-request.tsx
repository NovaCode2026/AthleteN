import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/theme';

const c=Colors.dark;
export default function ResetRequestScreen(){
 const router=useRouter(); const [email,setEmail]=useState(''); const [busy,setBusy]=useState(false); const [message,setMessage]=useState(''); const [error,setError]=useState('');
 async function send(){
  const e=email.trim().toLowerCase(); setError(''); setMessage('');
  if(!e||!e.includes('@')){setError('Enter a valid email address.');return}
  setBusy(true);
  const {error}=await supabase.auth.resetPasswordForEmail(e,{redirectTo:'athletenmobile://reset-password'});
  setBusy(false);
  if(error)setError(error.message); else setMessage('If an account uses this email, a password reset email has been sent. Check your inbox and spam folder.');
 }
 return <SafeAreaView style={s.screen}><View style={s.content}>
  <Text style={s.brand}>ATHLETEN</Text><Text style={s.title}>Reset your password</Text><Text style={s.sub}>Enter the email on your AthleteN account and we’ll send a secure reset link.</Text>
  <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="Email" placeholderTextColor={c.muted} style={s.input}/>
  {!!error&&<Text style={s.error}>{error}</Text>}{!!message&&<Text style={s.notice}>{message}</Text>}
  <Pressable onPress={send} disabled={busy} style={s.primary}>{busy?<ActivityIndicator color="#fff"/>:<Text style={s.primaryText}>SEND RESET EMAIL</Text>}</Pressable>
  <Pressable onPress={()=>router.back()}><Text style={s.link}>BACK TO SIGN IN</Text></Pressable>
 </View></SafeAreaView>
}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:c.background},content:{flex:1,padding:24,justifyContent:'center',gap:15},brand:{color:c.accent,fontSize:14,fontWeight:'900',letterSpacing:4},title:{color:c.text,fontSize:30,fontWeight:'900'},sub:{color:c.muted,fontSize:14,lineHeight:21},input:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:14,color:c.text,padding:15,fontSize:15},primary:{backgroundColor:c.accent,borderRadius:14,padding:15,alignItems:'center'},primaryText:{color:'#fff',fontWeight:'900',letterSpacing:1,fontSize:12},link:{color:c.accent,textAlign:'center',fontWeight:'800',padding:10},error:{color:'#FF9BAA',fontSize:12},notice:{color:'#9BC3FF',fontSize:12,lineHeight:18}});
