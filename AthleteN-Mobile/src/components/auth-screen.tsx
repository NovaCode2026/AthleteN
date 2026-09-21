import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/theme';

export default function AuthScreen() {
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    if (!email.trim() || password.length < 6 || (register && !name.trim())) {
      setError(register ? 'Enter your name, email and a 6+ character password.' : 'Enter your email and password.');
      return;
    }
    setBusy(true);
    const result = register
      ? await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name.trim() } } })
      : await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (result.error) setError(result.error.message);
    else if (register) setError('Account created. Check your email if confirmation is enabled.');
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.brand}>ATHLETEN</Text>
        <Text style={styles.title}>{register ? 'Create your athlete account' : 'Welcome back'}</Text>
        <Text style={styles.subtitle}>Training, competitions and progress in one place.</Text>
        {register && <TextInput value={name} onChangeText={setName} placeholder="Full name" placeholderTextColor={Colors.dark.muted} style={styles.input} />}
        <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Email" placeholderTextColor={Colors.dark.muted} style={styles.input} />
        <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="Password" placeholderTextColor={Colors.dark.muted} style={styles.input} />
        {!!error && <Text style={styles.error}>{error}</Text>}
        <Pressable onPress={submit} disabled={busy} style={styles.primary}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{register ? 'CREATE ACCOUNT' : 'SIGN IN'}</Text>}
        </Pressable>
        <Pressable onPress={() => { setRegister(!register); setError(''); }}>
          <Text style={styles.switch}>{register ? 'Already have an account? Sign in' : 'New to AthleteN? Create an account'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen:{flex:1,backgroundColor:Colors.dark.background},
  content:{flex:1,padding:24,justifyContent:'center',gap:14},
  brand:{color:Colors.dark.accent,fontSize:14,fontWeight:'900',letterSpacing:4},
  title:{color:Colors.dark.text,fontSize:29,fontWeight:'800',marginTop:8},
  subtitle:{color:Colors.dark.muted,fontSize:14,lineHeight:21,marginBottom:8},
  input:{backgroundColor:Colors.dark.surface,borderWidth:1,borderColor:Colors.dark.border,borderRadius:14,color:Colors.dark.text,padding:15,fontSize:15},
  primary:{backgroundColor:Colors.dark.accent,borderRadius:14,padding:15,alignItems:'center'},
  primaryText:{color:'#fff',fontSize:12,fontWeight:'900',letterSpacing:1},
  switch:{color:Colors.dark.accent,textAlign:'center',fontSize:13,padding:10},
  error:{color:'#B6D0FF',fontSize:12,lineHeight:18},
});
