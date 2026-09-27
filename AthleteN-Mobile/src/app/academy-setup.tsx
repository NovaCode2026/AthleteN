import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

const c = Colors.dark;

export default function AcademySetupScreen() {
  const router = useRouter();
  const { session, profile, refreshProfile } = useAuth();
  const [academyId, setAcademyId] = useState<string | null>(String(profile?.academy_id || '') || null);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('India');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!session) return;
      let id = String(profile?.academy_id || '') || null;

      if (!id) {
        const { data, error } = await supabase
          .from('academies')
          .select('id')
          .eq('owner_user_id', session.user.id)
          .eq('status', 'active')
          .maybeSingle();

        if (error) {
          if (alive) { setMessage(error.message); setLoading(false); }
          return;
        }

        if (data?.id) {
          id = data.id;
          await supabase.from('profiles').update({ academy_id: id }).eq('user_id', session.user.id);
          if (alive) setAcademyId(id);
        }
      }

      if (!id) {
        const created = await supabase
          .from('academies')
          .insert({
            owner_user_id: session.user.id,
            name: 'New AthleteN Academy',
            country: 'India',
            status: 'active',
            setup_completed: false,
          })
          .select('id,name,city,state,country,contact_email,contact_phone,setup_completed')
          .single();

        if (created.error) {
          if (alive) { setMessage(created.error.message); setLoading(false); }
          return;
        }

        id = created.data.id;
        await supabase.from('profiles').update({ academy_id: id }).eq('user_id', session.user.id);
        if (alive) setAcademyId(id);
      }

      const { data, error } = await supabase
        .from('academies')
        .select('id,name,city,state,country,contact_email,contact_phone,setup_completed')
        .eq('id', id)
        .single();

      if (!alive) return;
      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      setName(data.name === 'New AthleteN Academy' ? '' : String(data.name || ''));
      setCity(String(data.city || ''));
      setState(String(data.state || ''));
      setCountry(String(data.country || 'India'));
      setEmail(String(data.contact_email || ''));
      setPhone(String(data.contact_phone || ''));
      setLoading(false);
    })();

    return () => { alive = false; };
  }, [session?.user.id, profile?.academy_id]);

  async function finishSetup() {
    setMessage('');
    const values = [name, city, state, country, email, phone].map(v => v.trim());
    if (values.some(v => !v)) {
      setMessage('Please complete every required academy field.');
      return;
    }
    if (!email.includes('@')) {
      setMessage('Enter a valid academy email address.');
      return;
    }
    if (phone.replace(/\D/g, '').length < 10) {
      setMessage('Enter a valid academy phone number.');
      return;
    }
    if (!session || !academyId) {
      setMessage('Your academy workspace is not ready yet. Please try again.');
      return;
    }

    setBusy(true);
    const { error } = await supabase
      .from('academies')
      .update({
        name: name.trim(),
        city: city.trim(),
        state: state.trim(),
        country: country.trim(),
        contact_email: email.trim(),
        contact_phone: phone.trim(),
        setup_completed: true,
        setup_completed_at: new Date().toISOString(),
      })
      .eq('id', academyId)
      .eq('owner_user_id', session.user.id);

    if (error) {
      setBusy(false);
      setMessage(error.message);
      return;
    }

    await refreshProfile();
    setBusy(false);
    router.replace('/academy');
  }

  if (loading) {
    return (
      <SafeAreaView style={s.screen}>
        <View style={s.loading}><ActivityIndicator size="large" color={c.accent}/><Text style={s.loadingText}>Preparing your Academy workspace…</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.progress}><View style={s.progressActive}/><View style={s.progressInactive}/><View style={s.progressInactive}/></View>
        <Text style={s.kicker}>ATHLETEN ACADEMY</Text>
        <Text style={s.title}>Set up your academy.</Text>
        <Text style={s.subtitle}>Your Academy plan is active. Before you enter the Academy dashboard, complete the workspace details below.</Text>

        <View style={s.badge}><Text style={s.badgeText}>ACADEMY PLAN • ACTIVE</Text></View>

        <View style={s.card}>
          <Text style={s.section}>ACADEMY DETAILS</Text>
          <Field label="Academy name *" value={name} onChangeText={setName} placeholder="Your academy name"/>
          <Field label="City *" value={city} onChangeText={setCity} placeholder="City"/>
          <Field label="State / Province *" value={state} onChangeText={setState} placeholder="State"/>
          <Field label="Country *" value={country} onChangeText={setCountry} placeholder="Country"/>
        </View>

        <View style={s.card}>
          <Text style={s.section}>ACADEMY CONTACT</Text>
          <Field label="Contact email *" value={email} onChangeText={setEmail} placeholder="academy@example.com" keyboardType="email-address"/>
          <Field label="Contact phone *" value={phone} onChangeText={setPhone} placeholder="+91 98765 43210" keyboardType="phone-pad"/>
        </View>

        {message ? <Text style={s.message}>{message}</Text> : null}

        <Pressable onPress={() => void finishSetup()} disabled={busy} style={s.button}>
          {busy ? <ActivityIndicator color="#fff"/> : <Text style={s.buttonText}>COMPLETE ACADEMY SETUP</Text>}
        </Pressable>

        <Text style={s.note}>These details become the foundation of your Academy workspace. You can edit academy information later from Academy Settings.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({label,value,onChangeText,placeholder,keyboardType}:{label:string;value:string;onChangeText:(v:string)=>void;placeholder:string;keyboardType?:any}) {
  return <View style={s.field}>
    <Text style={s.label}>{label}</Text>
    <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={c.muted} keyboardType={keyboardType} autoCapitalize="words" style={s.input}/>
  </View>;
}

const s = StyleSheet.create({
  screen:{flex:1,backgroundColor:c.background},
  content:{padding:22,paddingBottom:45,gap:14},
  loading:{flex:1,alignItems:'center',justifyContent:'center',gap:12},
  loadingText:{color:c.muted,fontSize:12},
  progress:{flexDirection:'row',gap:6,marginBottom:4},
  progressActive:{flex:1,height:4,borderRadius:4,backgroundColor:c.accent},
  progressInactive:{flex:1,height:4,borderRadius:4,backgroundColor:c.border},
  kicker:{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:1.6,marginTop:10},
  title:{color:c.text,fontSize:31,fontWeight:'900',lineHeight:37},
  subtitle:{color:c.muted,fontSize:12,lineHeight:19},
  badge:{alignSelf:'flex-start',backgroundColor:c.accentSoft,borderWidth:1,borderColor:c.accentDeep,borderRadius:999,paddingHorizontal:11,paddingVertical:7},
  badgeText:{color:c.accentBright,fontSize:8,fontWeight:'900',letterSpacing:1},
  card:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:20,padding:15,gap:12},
  section:{color:c.muted,fontSize:9,fontWeight:'900',letterSpacing:1.5},
  field:{gap:5},
  label:{color:c.textSecondary,fontSize:10,fontWeight:'800'},
  input:{backgroundColor:c.background,borderWidth:1,borderColor:c.border,borderRadius:13,color:c.text,padding:13,fontSize:13},
  button:{backgroundColor:c.accent,borderRadius:14,padding:15,alignItems:'center',marginTop:2},
  buttonText:{color:'#fff',fontSize:10,fontWeight:'900',letterSpacing:1},
  message:{color:c.danger,fontSize:11,lineHeight:17},
  note:{color:c.muted,fontSize:10,lineHeight:16,textAlign:'center'},
});
