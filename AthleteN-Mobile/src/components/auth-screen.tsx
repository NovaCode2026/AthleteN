import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/theme';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

function authRedirect(next?: string) {
  const path = next ? `auth/callback?next=${encodeURIComponent(next)}` : 'auth/callback';
  return Constants.executionEnvironment === 'storeClient'
    ? Linking.createURL(path)
    : `athletenmobile://${path}`;
}

export default function AuthScreen() {
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [verificationNotice, setVerificationNotice] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

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
          options: { data: { full_name: name.trim() }, emailRedirectTo: authRedirect() },
        });
        if (result.error) setError(result.error.message);
        else if (result.data.session) setVerificationNotice('Account created. Your email is already verified or email confirmation is disabled.');
        else setVerificationNotice('Account created. Check your inbox and verify your email before signing in.');
      } else {
        const result = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (result.error) {
          setError(/email not confirmed/i.test(result.error.message)
            ? 'Your email is not verified yet. Check your inbox, then resend the verification email if needed.'
            : result.error.message);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setError('');
    setVerificationNotice('');
    setGoogleBusy(true);
    try {
      const redirectTo = authRedirect();
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (oauthError) {
        if (/provider.*not.*enabled|unsupported provider/i.test(oauthError.message)) {
          throw new Error('Google sign-in is not enabled in the AthleteN Supabase Auth provider settings yet.');
        }
        throw oauthError;
      }
      if (!data?.url) throw new Error('Google sign-in could not start.');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success' || !result.url) {
        if (result.type !== 'cancel') setError('Google sign-in was not completed.');
        return;
      }

      const callback = new URL(result.url);
      const code = callback.searchParams.get('code');
      if (!code) throw new Error('Google sign-in returned without an authorization code.');

      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) throw exchangeError;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Google sign-in failed.');
    } finally {
      setGoogleBusy(false);
    }
  }

  async function resetPassword() {
    const cleanEmail = email.trim().toLowerCase();
    setError('');
    setVerificationNotice('');
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Enter the email linked to your AthleteN account first.');
      return;
    }
    setResetBusy(true);
    try {
      const result = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: authRedirect('reset-password'),
      });
      if (result.error) setError(result.error.message);
      else setVerificationNotice('Password reset email sent to the email entered above. Check your inbox and spam folder.');
    } finally {
      setResetBusy(false);
    }
  }

  async function resendVerification() {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) { setError('Enter the email address you used to register first.'); return; }
    setError('');
    setResending(true);
    try {
      const result = await supabase.auth.resend({ type: 'signup', email: cleanEmail });
      if (result.error) setError(result.error.message);
      else setVerificationNotice('Verification email sent. Check your inbox and spam folder.');
    } finally { setResending(false); }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.topAccent} />
      <View style={styles.content}>
        <View style={styles.brandBlock}>
          <Image source={require('@/assets/logo.png')} style={styles.logo} />
          <View><Text style={styles.brand}>ATHLETEN</Text><Text style={styles.brandSub}>ATHLETE PERFORMANCE PLATFORM</Text></View>
        </View>

        <Text style={styles.kicker}>{register ? 'CREATE YOUR ATHLETE PROFILE' : 'WELCOME BACK'}</Text>
        <Text style={styles.title}>{register ? 'Build your AthleteN profile.' : 'Your performance. One place.'}</Text>
        <Text style={styles.subtitle}>Training, competition, weight, goals and athlete intelligence — built around you.</Text>

        <Pressable onPress={signInWithGoogle} disabled={busy || googleBusy || resending || resetBusy} style={styles.google}>
          {googleBusy ? <ActivityIndicator color={Colors.dark.text} /> : <><View style={styles.googleMark}><Text style={styles.googleG}>G</Text></View><Text style={styles.googleText}>CONTINUE WITH GOOGLE</Text></>}
        </Pressable>

        <View style={styles.divider}><View style={styles.line} /><Text style={styles.or}>OR</Text><View style={styles.line} /></View>

        <View style={styles.form}>
          {register && <TextInput value={name} onChangeText={setName} placeholder="Full name" placeholderTextColor={Colors.dark.muted} style={styles.input} />}
          <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="Email" placeholderTextColor={Colors.dark.muted} style={styles.input} />
          <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="Password" placeholderTextColor={Colors.dark.muted} style={styles.input} />
          {!!error && <Text style={styles.error}>{error}</Text>}
          {!!verificationNotice && <Text style={styles.notice}>{verificationNotice}</Text>}
          <Pressable onPress={submit} disabled={busy || googleBusy || resending} style={styles.primary}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{register ? 'CREATE ACCOUNT' : 'SIGN IN'}</Text>}
          </Pressable>
          {!register && <Pressable onPress={resetPassword} disabled={busy || googleBusy || resending || resetBusy}><Text style={styles.forgot}>{resetBusy ? 'SENDING RESET EMAIL…' : 'Forgot password? Send reset email'}</Text></Pressable>}
          {!register && /not verified|not confirmed/i.test(error) && <Pressable onPress={resendVerification} disabled={resending} style={styles.secondary}>{resending ? <ActivityIndicator color={Colors.dark.accent} /> : <Text style={styles.secondaryText}>RESEND VERIFICATION</Text>}</Pressable>}
          {register && !!verificationNotice && <Pressable onPress={resendVerification} disabled={resending} style={styles.secondary}>{resending ? <ActivityIndicator color={Colors.dark.accent} /> : <Text style={styles.secondaryText}>RESEND VERIFICATION EMAIL</Text>}</Pressable>}
        </View>

        <Pressable onPress={() => { setRegister(!register); setError(''); setVerificationNotice(''); }}>
          <Text style={styles.switch}>{register ? 'Already have an account? Sign in' : 'New to AthleteN? Create an account'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen:{flex:1,backgroundColor:Colors.dark.background},
  topAccent:{position:'absolute',top:0,left:0,right:0,height:3,backgroundColor:Colors.dark.accent},
  content:{flex:1,paddingHorizontal:24,justifyContent:'center',gap:13},
  brandBlock:{flexDirection:'row',alignItems:'center',gap:11,marginBottom:14},
  logo:{width:54,height:54,borderRadius:16},
  brand:{color:Colors.dark.text,fontSize:16,fontWeight:'900',letterSpacing:3.6},
  brandSub:{color:Colors.dark.muted,fontSize:7,fontWeight:'800',letterSpacing:1.1,marginTop:3},
  kicker:{color:Colors.dark.accentBright,fontSize:9,fontWeight:'900',letterSpacing:1.6},
  title:{color:Colors.dark.text,fontSize:31,fontWeight:'900',letterSpacing:-0.6,lineHeight:36},
  subtitle:{color:Colors.dark.muted,fontSize:13,lineHeight:20,marginBottom:4},
  google:{height:52,borderRadius:14,backgroundColor:Colors.dark.surface,borderWidth:1,borderColor:Colors.dark.borderStrong,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:10},
  googleMark:{width:25,height:25,borderRadius:8,backgroundColor:'#fff',alignItems:'center',justifyContent:'center'},
  googleG:{color:'#4285F4',fontSize:15,fontWeight:'900'},
  googleText:{color:Colors.dark.text,fontSize:10,fontWeight:'900',letterSpacing:1},
  divider:{flexDirection:'row',alignItems:'center',gap:9},
  line:{flex:1,height:1,backgroundColor:Colors.dark.border},
  or:{color:Colors.dark.muted,fontSize:9,fontWeight:'900'},
  form:{backgroundColor:Colors.dark.surface,borderWidth:1,borderColor:Colors.dark.border,borderRadius:22,padding:15,gap:10},
  input:{backgroundColor:Colors.dark.background,borderWidth:1,borderColor:Colors.dark.border,borderRadius:13,color:Colors.dark.text,padding:14,fontSize:14},
  primary:{backgroundColor:Colors.dark.accent,borderRadius:13,padding:15,alignItems:'center'},
  primaryText:{color:'#fff',fontSize:11,fontWeight:'900',letterSpacing:1.2},
  secondary:{borderWidth:1,borderColor:Colors.dark.borderStrong,borderRadius:13,padding:13,alignItems:'center'},
  secondaryText:{color:Colors.dark.accentBright,fontSize:10,fontWeight:'900',letterSpacing:1},
  forgot:{color:Colors.dark.muted,textAlign:'center',fontSize:10,fontWeight:'700',padding:5},
  switch:{color:Colors.dark.accentBright,textAlign:'center',fontSize:12,fontWeight:'800',padding:8},
  error:{color:Colors.dark.danger,fontSize:11,lineHeight:17},
  notice:{color:Colors.dark.success,fontSize:11,lineHeight:17},
});
