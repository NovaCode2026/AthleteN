import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/theme';

function formatDobInput(value: string) { const digits = value.replace(/\D/g, '').slice(0, 8); if (digits.length <= 4) return digits; if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`; return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`; }
function isValidDob(value: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const [year, month, day] = value.split('-').map(Number); const date = new Date(Date.UTC(year, month - 1, day)); const today = new Date(); return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && date <= new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())); }

export default function OnboardingScreen({ userId, onComplete }: { userId: string; onComplete: () => void }) {
  const [name,setName]=useState('');
  const [dob,setDob]=useState('');
  const [gender,setGender]=useState('');
  const [sport,setSport]=useState('Taekwondo');
  const [club,setClub]=useState('');
  const [coach,setCoach]=useState('');
  const [connectionCode,setConnectionCode]=useState('');
  const [discipline,setDiscipline]=useState<'Kyorugi'|'Poomsae'>('Kyorugi');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  async function save() {
    if (!name.trim()||!dob.trim()||!gender.trim()||!sport.trim()) {
      setError('Name, date of birth, gender, and sport are required.'); return;
    }
    if (!isValidDob(dob)) { setError('Enter a valid date of birth in YYYY-MM-DD format, for example 2013-10-23.'); return; }
    setBusy(true); setError('');
    const { error: insertError } = await supabase.from('profiles').upsert({
      user_id:userId, full_name:name.trim(), date_of_birth:dob.trim(), gender:gender.trim(),
      sport:sport.trim(), club:club.trim(), coach:coach.trim(), discipline:discipline.toLowerCase(),
    }, { onConflict:'user_id' });
    if (insertError) { setBusy(false); setError(insertError.message); return; }
    if (connectionCode.trim()) {
      const { error: connectError } = await supabase.rpc('connect_athlete_by_code', { p_code: connectionCode.trim().toUpperCase() });
      if (connectError) { setBusy(false); setError(`Profile saved, but the connection code could not be applied: ${connectError.message}`); return; }
    }
    setBusy(false);
    onComplete();
  }

  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.brand}>ATHLETEN</Text>
    <Text style={styles.title}>Build your athlete profile</Text>
    <Text style={styles.subtitle}>These details personalize your AthleteN experience.</Text>
    {([
      {label:'Full name',value:name,set:setName,required:true},
      {label:'Date of birth (YYYY-MM-DD)',value:dob,set:setDob,required:true},
      {label:'Gender',value:gender,set:setGender,required:true},
      {label:'Sport',value:sport,set:setSport,required:true},
      {label:'Club / Academy name (optional)',value:club,set:setClub,required:false},
      {label:'Coach name (optional)',value:coach,set:setCoach,required:false},
    ] as const).map(field=><View key={field.label} style={styles.field}><Text style={styles.label}>{field.label}{field.required?' *':''}</Text><TextInput value={field.value} onChangeText={field.label.startsWith('Date of birth')?value=>setDob(formatDobInput(value)):field.set} placeholder={field.label} placeholderTextColor={Colors.dark.muted} style={styles.input} keyboardType={field.label.startsWith('Date of birth')?'numeric':'default'} autoCapitalize={field.label==='Full name'?'words':'sentences'} />{field.label.startsWith('Date of birth')&&<Text style={styles.hint}>Type YYYYMMDD or YYYY-MM-DD; AthleteN formats and validates the date.</Text>}</View>)}
    <View style={styles.field}><Text style={styles.label}>Academy or Coach connection code (optional)</Text><Text style={styles.hint}>Enter the code shared by your academy or coach to connect your account. You can skip this and connect later.</Text><TextInput value={connectionCode} onChangeText={setConnectionCode} autoCapitalize="characters" autoCorrect={false} placeholder="e.g. SRTAEKWONDO" placeholderTextColor={Colors.dark.muted} style={styles.input}/></View>
    <Text style={styles.label}>Taekwondo discipline *</Text>
    <View style={styles.row}><Pressable onPress={()=>setDiscipline('Kyorugi')} style={[styles.choice,discipline==='Kyorugi'&&styles.choiceActive]}><Text style={styles.choiceText}>Kyorugi</Text></Pressable><Pressable onPress={()=>setDiscipline('Poomsae')} style={[styles.choice,discipline==='Poomsae'&&styles.choiceActive]}><Text style={styles.choiceText}>Poomsae</Text></Pressable></View>
    {!!error&&<Text style={styles.error}>{error}</Text>}
    <Pressable onPress={save} disabled={busy} style={styles.primary}>{busy?<ActivityIndicator color="#fff"/>:<Text style={styles.primaryText}>CONTINUE</Text>}</Pressable>
  </ScrollView></SafeAreaView>;
}

const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:Colors.dark.background},content:{padding:24,gap:12,paddingBottom:40},
 brand:{color:Colors.dark.accent,fontSize:14,fontWeight:'900',letterSpacing:4,marginTop:10},
 title:{color:Colors.dark.text,fontSize:28,fontWeight:'800',marginTop:4},subtitle:{color:Colors.dark.muted,fontSize:14,lineHeight:21,marginBottom:8},
 field:{gap:6},label:{color:Colors.dark.text,fontSize:12,fontWeight:'700'},hint:{color:Colors.dark.muted,fontSize:12,lineHeight:18},
 input:{backgroundColor:Colors.dark.surface,borderWidth:1,borderColor:Colors.dark.border,borderRadius:13,color:Colors.dark.text,padding:14,fontSize:14},
 row:{flexDirection:'row',gap:10},choice:{flex:1,borderWidth:1,borderColor:Colors.dark.border,borderRadius:13,padding:14,alignItems:'center'},choiceActive:{backgroundColor:Colors.dark.accentDeep,borderColor:Colors.dark.accent},choiceText:{color:Colors.dark.text,fontWeight:'700'},
 primary:{backgroundColor:Colors.dark.accent,borderRadius:14,padding:15,alignItems:'center',marginTop:8},primaryText:{color:'#fff',fontWeight:'900',letterSpacing:1,fontSize:12},error:{color:'#B6D0FF',fontSize:12},
});
