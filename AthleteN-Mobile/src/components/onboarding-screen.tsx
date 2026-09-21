import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/theme';

export default function OnboardingScreen({ userId, onComplete }: { userId: string; onComplete: () => void }) {
  const [name,setName]=useState('');
  const [dob,setDob]=useState('');
  const [gender,setGender]=useState('');
  const [sport,setSport]=useState('Taekwondo');
  const [club,setClub]=useState('');
  const [coach,setCoach]=useState('');
  const [discipline,setDiscipline]=useState<'Kyorugi'|'Poomsae'>('Kyorugi');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  async function save() {
    if (!name.trim()||!dob.trim()||!gender.trim()||!sport.trim()||!club.trim()||!coach.trim()) {
      setError('All athlete profile fields are required.'); return;
    }
    setBusy(true); setError('');
    const { error: insertError } = await supabase.from('profiles').upsert({
      user_id:userId, full_name:name.trim(), date_of_birth:dob.trim(), gender:gender.trim(),
      sport:sport.trim(), club:club.trim(), coach:coach.trim(), discipline,
    }, { onConflict:'user_id' });
    setBusy(false);
    if (insertError) setError(insertError.message); else onComplete();
  }

  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.brand}>ATHLETEN</Text>
    <Text style={styles.title}>Build your athlete profile</Text>
    <Text style={styles.subtitle}>These details personalize your AthleteN experience.</Text>
    {[
      ['Full name',name,setName],
      ['Date of birth (YYYY-MM-DD)',dob,setDob],
      ['Gender',gender,setGender],
      ['Sport',sport,setSport],
      ['Club / Academy',club,setClub],
      ['Coach',coach,setCoach],
    ].map(([label,value,setter])=><View key={label as string} style={styles.field}><Text style={styles.label}>{label as string} *</Text><TextInput value={value as string} onChangeText={setter as any} placeholder={label as string} placeholderTextColor={Colors.dark.muted} style={styles.input}/></View>)}
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
 field:{gap:6},label:{color:Colors.dark.text,fontSize:12,fontWeight:'700'},
 input:{backgroundColor:Colors.dark.surface,borderWidth:1,borderColor:Colors.dark.border,borderRadius:13,color:Colors.dark.text,padding:14,fontSize:14},
 row:{flexDirection:'row',gap:10},choice:{flex:1,borderWidth:1,borderColor:Colors.dark.border,borderRadius:13,padding:14,alignItems:'center'},choiceActive:{backgroundColor:Colors.dark.accentDeep,borderColor:Colors.dark.accent},choiceText:{color:Colors.dark.text,fontWeight:'700'},
 primary:{backgroundColor:Colors.dark.accent,borderRadius:14,padding:15,alignItems:'center',marginTop:8},primaryText:{color:'#fff',fontWeight:'900',letterSpacing:1,fontSize:12},error:{color:'#B6D0FF',fontSize:12},
});
