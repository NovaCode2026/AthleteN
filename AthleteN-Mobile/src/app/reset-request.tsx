import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getEmailAuthRedirect } from '@/lib/auth-links';
import { Colors } from '@/constants/theme';
import AthleteNLogo from '@/components/athleten-logo';

const c=Colors.dark;
export default function ResetRequestScreen(){
 const router=useRouter(); const [email,setEmail]=useState(''); const [busy,setBusy]=useState(false); const [message,setMessage]=useState(''); const [error,setError]=useState('');
 async function send(){
  const e=email.trim().toLowerCase(); setError(''); setMessage('');
  if(!e||!e.includes('@')){setError('Enter a valid email address.');return}
  setBusy(true);
  try {
   const redirectTo=getEmailAuthRedirect('reset-password');
   const {error}=await supabase.auth.resetPasswordForEmail(e,{redirectTo});
   if(error)setError(error.message); else setMessage('If an account uses this email, a password reset email has been sent. Check your inbox and spam folder.');
  } catch (error) {
   setError(error instanceof Error?error.message:'Password reset could not be requested. Check your connection and try again.');
  } finally { setBusy(false); }
 }
 return <SafeAreaView style={s.screen}><View style={s.content}>
  <AthleteNLogo width={190} height={105} style={s.logo} /><Text style={s.title}>Reset your password</Text><Text style={s.sub}>Enter the email on your AthleteN account and we’ll send a secure reset link.</Text>
  <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="Email" placeholderTextColor={c.muted} style={s.input}/>
  {!!error&&<Text style={s.error}>{error}</Text>}{!!message&&<Text style={s.notice}>{message}</Text>}
  <Pressable onPress={send} disabled={busy} style={s.primary}>{busy?<ActivityIndicator color="#fff"/>:<Text style={s.primaryText}>SEND RESET EMAIL</Text>}</Pressable>
  <Pressable onPress={()=>router.back()}><Text style={s.link}>BACK TO SIGN IN</Text></Pressable>
 </View></SafeAreaView>
}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:c.background},content:{flex:1,paddingHorizontal:24,paddingVertical:28,justifyContent:'center',gap:16,width:'100%',maxWidth:560,alignSelf:'center'},logo:{width:190,height:105,alignSelf:'flex-start',marginBottom:4},title:{color:c.text,fontSize:32,fontWeight:'900',letterSpacing:-.8},sub:{color:c.muted,fontSize:14,lineHeight:21},input:{backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong,borderRadius:15,color:c.text,padding:16,fontSize:15},primary:{backgroundColor:c.accent,borderRadius:15,padding:16,alignItems:'center',shadowColor:c.accent,shadowOpacity:.18,shadowRadius:9,elevation:2},primaryText:{color:'#fff',fontWeight:'900',letterSpacing:1,fontSize:12},link:{color:c.accent,textAlign:'center',fontWeight:'800',padding:10},error:{color:'#FF9BAA',fontSize:12},notice:{color:'#9BC3FF',fontSize:12,lineHeight:18}});
