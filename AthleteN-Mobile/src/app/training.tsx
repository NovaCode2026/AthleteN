import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

const c = Colors.dark;

export default function TrainingScreen() {
  const { session, profile } = useAuth();
  const [title, setTitle] = useState('');
  const [planTitle, setPlanTitle] = useState('Training Block');
  const [planDays, setPlanDays] = useState('30');
  const [activePlan, setActivePlan] = useState<any>(null);
  const [minutes, setMinutes] = useState('');
  const [intensity, setIntensity] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!session) return;
    const { data, error } = await supabase.from('training_sessions').select('id,title,session_date,minutes,intensity,notes').eq('user_id', session.user.id).order('session_date', { ascending: false }).order('created_at', { ascending: false }).limit(50);
    if (error) setMessage(error.message); else setItems(data || []);
    const plan = await supabase.from('training_plans').select('id,title,focus_area,starts_at,ends_at,status').eq('user_id', session.user.id).neq('status','archived').order('created_at',{ascending:false}).limit(1).maybeSingle();
    setActivePlan(plan.data || null);
  }, [session]);

  useEffect(() => { void load(); }, [load]);

  async function savePlan() {
    const days = Number(planDays);
    if (!session || !planTitle.trim() || !Number.isInteger(days) || days < 1 || days > 365) { setMessage('Choose a plan name and a duration from 1 to 365 days.'); return; }
    const start = new Date(); const end = new Date(start); end.setDate(start.getDate() + days - 1);
    setBusy(true); setMessage('');
    const { error } = await supabase.from('training_plans').insert({ user_id: session.user.id, title: planTitle.trim(), starts_at: start.toISOString().slice(0,10), ends_at: end.toISOString().slice(0,10), status: 'draft' });
    setBusy(false); if (error) setMessage(error.message); else { setMessage('Training plan saved.'); await load(); }
  }

  async function add() {
    const mins = Number(minutes);
    if (!session || !title.trim() || !Number.isFinite(mins) || mins <= 0) { setMessage('Session title and a duration greater than zero are required.'); return; }
    setBusy(true); setMessage('');
    const { error } = await supabase.from('training_sessions').insert({ user_id: session.user.id, title: title.trim(), session_date: new Date().toISOString().slice(0, 10), minutes: mins, intensity: intensity.trim() || null, notes: notes.trim() || null });
    setBusy(false);
    if (error) setMessage(error.message); else { setTitle(''); setMinutes(''); setIntensity(''); setNotes(''); setMessage('Training session saved.'); await load(); }
  }

  async function remove(id: string) {
    setBusy(true);
    const { error } = await supabase.from('training_sessions').delete().eq('id', id).eq('user_id', session?.user.id);
    setBusy(false);
    if (error) setMessage(error.message); else await load();
  }

  return <SafeAreaView style={s.screen} edges={['top']}><ScrollView style={s.screen} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
    <View style={s.header}><View><Text style={s.kicker}>ATHLETEN PERFORMANCE</Text><Text style={s.title}>Training</Text><Text style={s.sub}>{profile?.discipline || 'Taekwondo'} training, logged properly.</Text></View><View style={s.icon}><Text style={s.iconText}>↗</Text></View></View>
    <View style={s.hero}><Text style={s.heroTitle}>Training program</Text><Text style={s.heroSub}>Set the training window you want. AthleteN does not force a fixed duration.</Text></View>
    <View style={s.card}>
      <View style={s.row}><View style={s.half}><Field label="PLAN NAME" value={planTitle} onChangeText={setPlanTitle} placeholder="Competition prep" /></View><View style={s.half}><Field label="DURATION (DAYS)" value={planDays} onChangeText={setPlanDays} keyboardType="number-pad" placeholder="30" /></View></View>
      {activePlan ? <Text style={s.planStatus}>ACTIVE PLAN • {activePlan.starts_at} → {activePlan.ends_at}</Text> : <Text style={s.meta}>Example: 30 days, 45 days, 90 days — choose what fits your goal.</Text>}
      <Pressable onPress={savePlan} disabled={busy} style={s.secondaryButton}>{busy ? <ActivityIndicator color={c.accentBright}/> : <Text style={s.secondaryButtonText}>{activePlan ? 'CREATE NEW PLAN' : 'SAVE TRAINING PLAN'}</Text>}</Pressable>
    </View>
    <View style={s.hero}><Text style={s.heroTitle}>Log today's work</Text><Text style={s.heroSub}>Keep every session in your athlete record.</Text></View>
    <View style={s.card}>
      <Field label="SESSION TITLE *" value={title} onChangeText={setTitle} placeholder={profile?.discipline === 'Poomsae' ? 'Poomsae technique' : 'Kyorugi sparring'} />
      <View style={s.row}><View style={s.half}><Field label="MINUTES *" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" placeholder="60" /></View><View style={s.half}><Field label="INTENSITY" value={intensity} onChangeText={setIntensity} placeholder="Moderate" /></View></View>
      <Field label="NOTES" value={notes} onChangeText={setNotes} placeholder="What did you work on?" />
      {message ? <Text style={s.message}>{message}</Text> : null}
      <Pressable onPress={add} disabled={busy} style={s.button}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>SAVE SESSION</Text>}</Pressable>
    </View>
    <View style={s.sectionHead}><Text style={s.section}>RECENT SESSIONS</Text><Text style={s.count}>{items.length}</Text></View>
    {!items.length ? <View style={s.empty}><Text style={s.emptyTitle}>No sessions yet</Text><Text style={s.meta}>Your first saved workout will appear here.</Text></View> : items.map(item => <View style={s.session} key={item.id}><View style={s.sessionTop}><View style={s.sessionIcon}><Text style={s.sessionIconText}>T</Text></View><View style={s.sessionCopy}><Text style={s.sessionTitle}>{item.title}</Text><Text style={s.meta}>{item.session_date}{item.intensity ? ' • ' + item.intensity : ''}</Text></View><Text style={s.minutes}>{item.minutes}m</Text></View>{item.notes ? <Text style={s.note}>{item.notes}</Text> : null}<Pressable onPress={() => remove(item.id)} disabled={busy}><Text style={s.delete}>DELETE</Text></Pressable></View>)}
  </ScrollView></SafeAreaView>;
}

function Field({ label, value, onChangeText, placeholder, keyboardType }: { label: string; value: string; onChangeText: (v: string) => void; placeholder: string; keyboardType?: any }) {
  return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={c.muted} keyboardType={keyboardType} style={s.input} /></View>;
}

const s = StyleSheet.create({
  screen:{flex:1,backgroundColor:c.background},content:{paddingHorizontal:18,paddingTop:10,paddingBottom:45,gap:12},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingBottom:3},kicker:{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:1.5},title:{color:c.text,fontSize:30,fontWeight:'900',marginTop:3},sub:{color:c.muted,fontSize:12,lineHeight:18,marginTop:3},icon:{width:44,height:44,borderRadius:14,backgroundColor:c.accentSoft,borderWidth:1,borderColor:c.accentDeep,alignItems:'center',justifyContent:'center'},iconText:{color:c.accentBright,fontSize:19,fontWeight:'900'},hero:{backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong,borderRadius:19,padding:16,gap:4},heroTitle:{color:c.text,fontSize:17,fontWeight:'900'},heroSub:{color:c.muted,fontSize:11},card:{backgroundColor:c.surfaceRaised,borderWidth:1,borderColor:c.border,borderRadius:19,padding:15,gap:11},field:{gap:5},row:{flexDirection:'row',gap:9},half:{flex:1},label:{color:c.textSecondary,fontSize:9,fontWeight:'900',letterSpacing:.7},input:{backgroundColor:c.background,borderWidth:1,borderColor:c.border,borderRadius:12,color:c.text,paddingHorizontal:12,paddingVertical:11,fontSize:13},message:{color:c.accentBright,fontSize:11},secondaryButton:{borderWidth:1,borderColor:c.borderStrong,borderRadius:12,padding:13,alignItems:'center'},secondaryButtonText:{color:c.accentBright,fontSize:10,fontWeight:'900',letterSpacing:1},planStatus:{color:c.success,fontSize:10,fontWeight:'900'},button:{backgroundColor:c.accent,borderRadius:12,padding:13,alignItems:'center'},buttonText:{color:'#fff',fontSize:10,fontWeight:'900',letterSpacing:1},sectionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:5},section:{color:c.muted,fontSize:9,fontWeight:'900',letterSpacing:1.5},count:{color:c.accentBright,fontSize:9,fontWeight:'900'},session:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:17,padding:14,gap:9},sessionTop:{flexDirection:'row',alignItems:'center',gap:10},sessionIcon:{width:36,height:36,borderRadius:11,backgroundColor:c.accentSoft,alignItems:'center',justifyContent:'center'},sessionIconText:{color:c.accentBright,fontWeight:'900'},sessionCopy:{flex:1},sessionTitle:{color:c.text,fontSize:14,fontWeight:'800'},minutes:{color:c.accentBright,fontSize:12,fontWeight:'900'},meta:{color:c.muted,fontSize:11,lineHeight:17},note:{color:'#C2CBD9',fontSize:11,lineHeight:17},delete:{color:c.danger,fontSize:8,fontWeight:'900',letterSpacing:1},empty:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:17,padding:18,gap:5},emptyTitle:{color:c.text,fontSize:15,fontWeight:'800'}
});