import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/theme';

const c=Colors.dark;
export default function ResetPasswordScreen(){
 const router=useRouter(); const [password,setPassword]=useState(''); const [confirm,setConfirm]=useState(''); const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [done,setDone]=useState(false);
 async function update(){
  setError('');
  if(password.length<6){setError('Password must be at least 6 characters.');return}
  if(password!==confirm){setError('Passwords do not match.');return}
  setBusy(true); const {error}=await supabase.auth.updateUser({password}); setBusy(false);
  if(error)setError(error.message); else setDone(true);
 }
 return <SafeAreaView style={s.screen}><View style={s.content}>
  <Text style={s.brand}>ATHLETEN</Text><Text style={s.title}>{done?'Password updated':'Choose a new password'}</Text>
  {done?<><Text style={s.sub}>Your password has been changed successfully.</Text><Pressable style={s.primary} onPress={()=>router.replace('/')}><Text style={s.primaryText}>CONTINUE</Text></Pressable></>:<>
   <Text style={s.sub}>Use a new password you can remember. Never share it with anyone.</Text>
   <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="New password" placeholderTextColor={c.muted} style={s.input}/>
   <TextInput value={confirm} onChangeText={setConfirm} secureTextEntry placeholder="Confirm new password" placeholderTextColor={c.muted} style={s.input}/>
   {!!error&&<Text style={s.error}>{error}</Text>}
   <Pressable onPress={update} disabled={busy} style={s.primary}>{busy?<ActivityIndicator color="#fff"/>:<Text style={s.primaryText}>UPDATE PASSWORD</Text>}</Pressable>
  </>}
 </View></SafeAreaView>
}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:c.background},content:{flex:1,padding:24,justifyContent:'center',gap:15},brand:{color:c.accent,fontSize:14,fontWeight:'900',letterSpacing:4},title:{color:c.text,fontSize:30,fontWeight:'900'},sub:{color:c.muted,fontSize:14,lineHeight:21},input:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:14,color:c.text,padding:15,fontSize:15},primary:{backgroundColor:c.accent,borderRadius:14,padding:15,alignItems:'center'},primaryText:{color:'#fff',fontWeight:'900',letterSpacing:1,fontSize:12},error:{color:'#FF9BAA',fontSize:12}});
