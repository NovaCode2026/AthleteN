import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/theme';
import { useRouter } from 'expo-router';

export default function AuthScreen() {
  const router = useRouter();
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [verificationNotice, setVerificationNotice] = useState('');

  async function submit() {
    setError('');
    setVerificationNotice('');
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes('@') || password.length < 6 || (register && !name.trim())) {
      setError(register ? 'Enter your name, a valid email and a 6+ character password.' : 'Enter your email and password.');
      return;
    }

    setBusy(true);
    try {
      if (register) {
        const result = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { data: { full_name: name.trim() } },
        });

        if (result.error) {
          setError(result.error.message);
          return;
        }

        if (result.data.session) {
          setVerificationNotice('Account created. Your email is already verified or email confirmation is disabled.');
        } else {
          setVerificationNotice('Account created. Check your inbox and verify your email before signing in.');
        }
      } else {
        const result = await supabase.auth.signInWithPassword({ email: cleanEmail, password });

        if (result.error) {
          if (/email not confirmed/i.test(result.error.message)) {
            setError('Your email is not verified yet. Check your inbox, then tap RESEND VERIFICATION below if needed.');
          } else {
            setError(result.error.message);
          }
          return;
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification() {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Enter the email address you used to register first.');
      return;
    }

    setError('');
    setVerificationNotice('');
    setResending(true);
    try {
      const result = await supabase.auth.resend({ type: 'signup', email: cleanEmail });
      if (result.error) setError(result.error.message);
      else setVerificationNotice('Verification email sent. Check your inbox and spam folder.');
    } finally {
      setResending(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.brand}>ATHLETEN</Text>
        <Text style={styles.title}>{register ? 'Create your athlete account' : 'Welcome back'}</Text>
        <Text style={styles.subtitle}>Training, competitions and progress in one place.</Text>

        {register && (
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Full name"
            placeholderTextColor={Colors.dark.muted}
            style={styles.input}
          />
        )}

        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          placeholder="Email"
          placeholderTextColor={Colors.dark.muted}
          style={styles.input}
        />

        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Password"
          placeholderTextColor={Colors.dark.muted}
          style={styles.input}
        />

        {!!error && <Text style={styles.error}>{error}</Text>}
        {!!verificationNotice && <Text style={styles.notice}>{verificationNotice}</Text>}

        <Pressable onPress={submit} disabled={busy || resending} style={styles.primary}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{register ? 'CREATE ACCOUNT' : 'SIGN IN'}</Text>}
        </Pressable>

        {!register && <Pressable onPress={() => router.push('/reset-request')} disabled={busy || resending}><Text style={styles.forgot}>Forgot password?</Text></Pressable>}

        {!register && /not verified|not confirmed/i.test(error) && (
          <Pressable onPress={resendVerification} disabled={resending} style={styles.secondary}>
            {resending ? <ActivityIndicator color={Colors.dark.accent} /> : <Text style={styles.secondaryText}>RESEND VERIFICATION</Text>}
          </Pressable>
        )}

        {register && !!verificationNotice && (
          <Pressable onPress={resendVerification} disabled={resending} style={styles.secondary}>
            {resending ? <ActivityIndicator color={Colors.dark.accent} /> : <Text style={styles.secondaryText}>RESEND VERIFICATION EMAIL</Text>}
          </Pressable>
        )}

        <Pressable onPress={() => { setRegister(!register); setError(''); setVerificationNotice(''); }}>
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
  secondary:{backgroundColor:'transparent',borderWidth:1,borderColor:Colors.dark.accent,borderRadius:14,padding:14,alignItems:'center'},
  secondaryText:{color:Colors.dark.accent,fontSize:12,fontWeight:'900',letterSpacing:1},
  switch:{color:Colors.dark.accent,textAlign:'center',fontSize:13,padding:10},
  forgot:{color:Colors.dark.muted,textAlign:'center',fontSize:12,fontWeight:'700',padding:4},
  error:{color:'#FF9BAA',fontSize:12,lineHeight:18},
  notice:{color:'#9BC3FF',fontSize:12,lineHeight:18},
});
