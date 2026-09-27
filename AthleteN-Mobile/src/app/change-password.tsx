import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/theme';

const c = Colors.dark;

export default function ChangePasswordScreen() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function updatePassword() {
    setMessage('');
    setError('');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) return setError(updateError.message);
    setPassword('');
    setConfirm('');
    setMessage('Password changed successfully.');
  }

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.content}>
        <Pressable onPress={() => router.back()} style={s.back}><Text style={s.backText}>‹</Text></Pressable>
        <Text style={s.kicker}>ACCOUNT SECURITY</Text>
        <Text style={s.title}>Password & Security</Text>
        <Text style={s.sub}>Change the password for your currently signed-in AthleteN account.</Text>
        <View style={s.card}>
          <TextInput value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder="New password" placeholderTextColor={c.muted} style={s.input}/>
          <TextInput value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder="Confirm new password" placeholderTextColor={c.muted} style={s.input}/>
          {!!error && <Text style={s.error}>{error}</Text>}
          {!!message && <Text style={s.success}>{message}</Text>}
          <Pressable onPress={updatePassword} disabled={busy} style={s.primary}>
            {busy ? <ActivityIndicator color="#fff"/> : <Text style={s.primaryText}>CHANGE PASSWORD</Text>}
          </Pressable>
        </View>
        <Pressable onPress={() => router.push('/reset-request')} style={s.recovery}>
          <Text style={s.recoveryTitle}>Forgot your current password?</Text>
          <Text style={s.recoveryText}>Use the secure email recovery flow instead.</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen:{flex:1,backgroundColor:c.background},
  content:{flex:1,padding:22,gap:14},
  back:{width:42,height:42,borderRadius:13,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},
  backText:{color:c.text,fontSize:28,lineHeight:30},
  kicker:{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:1.5,marginTop:8},
  title:{color:c.text,fontSize:30,fontWeight:'900'},
  sub:{color:c.muted,fontSize:12,lineHeight:19},
  card:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:20,padding:15,gap:10},
  input:{backgroundColor:c.background,borderWidth:1,borderColor:c.border,borderRadius:13,color:c.text,padding:14,fontSize:14},
  primary:{backgroundColor:c.accent,borderRadius:13,padding:15,alignItems:'center'},
  primaryText:{color:'#fff',fontSize:10,fontWeight:'900',letterSpacing:1},
  error:{color:c.danger,fontSize:11,lineHeight:17},
  success:{color:c.success,fontSize:11,lineHeight:17},
  recovery:{backgroundColor:c.accentSoft,borderWidth:1,borderColor:c.accentDeep,borderRadius:16,padding:14},
  recoveryTitle:{color:c.text,fontSize:12,fontWeight:'900'},
  recoveryText:{color:c.muted,fontSize:10,lineHeight:16,marginTop:3},
});