import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/theme';
import AthleteNLogo from '@/components/athleten-logo';

const c=Colors.dark;
export default function ResetPasswordScreen(){
 const router=useRouter(); const [password,setPassword]=useState(''); const [confirm,setConfirm]=useState(''); const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [done,setDone]=useState(false);
 async function update(){
  setError('');
  if(password.length<8){setError('Password must be at least 8 characters.');return}
  if(password!==confirm){setError('Passwords do not match.');return}
  setBusy(true);
  try {
   const {error}=await supabase.auth.updateUser({password});
   if(error)setError(error.message); else setDone(true);
  } catch (error) {
   setError(error instanceof Error?error.message:'Password could not be updated. Check your connection and try again.');
  } finally { setBusy(false); }
 }
 return <SafeAreaView style={s.screen}><View style={s.content}>
  <AthleteNLogo width={190} height={105} style={s.logo} /><Text style={s.title}>{done?'Password updated':'Choose a new password'}</Text>
  {done?<><Text style={s.sub}>Your AthleteN password has been changed successfully.</Text><Pressable style={s.primary} onPress={()=>router.replace('/')}><Text style={s.primaryText}>CONTINUE</Text></Pressable></>:<>
   <Text style={s.sub}>Use a new password you can remember. Never share it with anyone.</Text>
   <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="New password" placeholderTextColor={c.muted} style={s.input}/>
   <TextInput value={confirm} onChangeText={setConfirm} secureTextEntry placeholder="Confirm new password" placeholderTextColor={c.muted} style={s.input}/>
   {!!error&&<Text style={s.error}>{error}</Text>}
   <Pressable onPress={update} disabled={busy} style={s.primary}>{busy?<ActivityIndicator color="#fff"/>:<Text style={s.primaryText}>UPDATE PASSWORD</Text>}</Pressable>
  </>}
 </View></SafeAreaView>
}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:c.background},content:{flex:1,paddingHorizontal:24,paddingVertical:28,justifyContent:'center',gap:16,width:'100%',maxWidth:560,alignSelf:'center'},logo:{width:190,height:105,alignSelf:'flex-start',marginBottom:4},title:{color:c.text,fontSize:32,fontWeight:'900',letterSpacing:-.8},sub:{color:c.muted,fontSize:14,lineHeight:21},input:{backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong,borderRadius:15,color:c.text,padding:16,fontSize:15},primary:{backgroundColor:c.accent,borderRadius:15,padding:16,alignItems:'center',shadowColor:c.accent,shadowOpacity:.18,shadowRadius:9,elevation:2},primaryText:{color:'#fff',fontWeight:'900',letterSpacing:1,fontSize:12},error:{color:'#FF9BAA',fontSize:12}});
