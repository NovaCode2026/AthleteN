import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

const c=Colors.dark;

export default function ProfileScreen(){
 const {profile,session,signOut,refreshProfile}=useAuth();
 const [name,setName]=useState(profile?.full_name||'');
 const [dob,setDob]=useState(String(profile?.date_of_birth||''));
 const [gender,setGender]=useState(String(profile?.gender||''));
 const [sport,setSport]=useState(String(profile?.sport||'Taekwondo'));
 const [club,setClub]=useState(String(profile?.club||profile?.academy||''));
 const [coach,setCoach]=useState(String(profile?.coach||''));
 const [discipline,setDiscipline]=useState<'Kyorugi'|'Poomsae'>((profile?.discipline as any)||'Kyorugi');
 const [weight,setWeight]=useState('');
 const [target,setTarget]=useState('');
 const [weights,setWeights]=useState<any[]>([]);
 const [goals,setGoals]=useState<any[]>([]);
 const [goalTitle,setGoalTitle]=useState('');
 const [goalDate,setGoalDate]=useState('');
 const [goalProgress,setGoalProgress]=useState('0');
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);

 const load=useCallback(async()=>{
  if(!session)return;
  const [w,g]=await Promise.all([
   supabase.from('weight_logs').select('id,logged_at,weight_kg,target_weight_kg,notes').eq('user_id',session.user.id).order('logged_at',{ascending:false}).limit(30),
   supabase.from('goals').select('id,title,target_date,status,progress,notes').eq('user_id',session.user.id).order('target_date',{ascending:true}),
  ]);
  if(w.error||g.error)setMessage(w.error?.message||g.error?.message||'Could not load profile data.');
  setWeights(w.data||[]);setGoals(g.data||[]);
 },[session]);
 useEffect(()=>{void load()},[load]);

 async function saveProfile(){
  if(!session||!name.trim()||!dob.trim()||!gender.trim()||!sport.trim()||!club.trim()||!coach.trim()){setMessage('All required profile fields must be filled.');return}
  setBusy(true);
  const {error}=await supabase.from('profiles').update({full_name:name.trim(),date_of_birth:dob.trim(),gender:gender.trim(),sport:sport.trim(),club:club.trim(),coach:coach.trim(),discipline}).eq('user_id',session.user.id);
  setBusy(false);if(error)setMessage(error.message);else{setMessage('Profile saved.');await refreshProfile()}
 }
 async function addWeight(){
  const value=Number(weight); const t=target.trim()?Number(target):null;
  if(!session||!Number.isFinite(value)||value<=0){setMessage('Enter a valid weight.');return}
  setBusy(true);const {error}=await supabase.from('weight_logs').insert({user_id:session.user.id,logged_at:new Date().toISOString().slice(0,10),weight_kg:value,target_weight_kg:t});setBusy(false);
  if(error)setMessage(error.message);else{setWeight('');setTarget('');setMessage('Weight saved.');await load()}
 }
 async function addGoal(){
  if(!session||!goalTitle.trim()){setMessage('Goal title is required.');return}
  const p=Math.max(0,Math.min(100,Number(goalProgress)||0));
  setBusy(true);const {error}=await supabase.from('goals').insert({user_id:session.user.id,title:goalTitle.trim(),target_date:goalDate.trim()||null,progress:p,status:p>=100?'completed':'active'});setBusy(false);
  if(error)setMessage(error.message);else{setGoalTitle('');setGoalDate('');setGoalProgress('0');setMessage('Goal saved.');await load()}
 }
 async function updateGoal(g:any,delta:number){
  const p=Math.max(0,Math.min(100,Number(g.progress)+delta));const {error}=await supabase.from('goals').update({progress:p,status:p>=100?'completed':'active'}).eq('id',g.id).eq('user_id',session?.user.id);
  if(error)setMessage(error.message);else await load();
 }
 async function remove(table:string,id:string){setBusy(true);const {error}=await supabase.from(table).delete().eq('id',id).eq('user_id',session?.user.id);setBusy(false);if(error)setMessage(error.message);else await load()}

 return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
  <Text style={styles.eyebrow}>PROFILE & SETTINGS</Text><Text style={styles.title}>{profile?.full_name||'Athlete'}</Text><Text style={styles.sub}>{profile?.plan_id||'free'} plan • {discipline}</Text>
  <Section title="ATHLETE PROFILE">
   <Field label="Full name *" value={name} onChangeText={setName} placeholder="Full name"/>
   <Field label="Date of birth *" value={dob} onChangeText={setDob} placeholder="YYYY-MM-DD"/>
   <Field label="Gender *" value={gender} onChangeText={setGender} placeholder="Gender"/>
   <Field label="Sport *" value={sport} onChangeText={setSport} placeholder="Taekwondo"/>
   <Field label="Club / Academy *" value={club} onChangeText={setClub} placeholder="Club / Academy"/>
   <Field label="Coach *" value={coach} onChangeText={setCoach} placeholder="Coach"/>
   <Text style={styles.label}>Discipline *</Text>
   <View style={styles.row}><Choice title="Kyorugi" active={discipline==='Kyorugi'} onPress={()=>setDiscipline('Kyorugi')}/><Choice title="Poomsae" active={discipline==='Poomsae'} onPress={()=>setDiscipline('Poomsae')}/></View>
   <Button title="SAVE PROFILE" onPress={saveProfile} busy={busy}/>
  </Section>

  <Section title="WEIGHT TRACKER">
   <Field label="Current weight (kg) *" value={weight} onChangeText={setWeight} placeholder="50.0" keyboardType="decimal-pad"/>
   <Field label="Target weight (kg)" value={target} onChangeText={setTarget} placeholder="Optional" keyboardType="decimal-pad"/>
   <Button title="LOG WEIGHT" onPress={addWeight} busy={busy}/>
   {weights.map(w=><View style={styles.inner} key={w.id}><View style={styles.cardRow}><Text style={styles.cardTitle}>{Number(w.weight_kg).toFixed(1)} kg</Text><Text style={styles.meta}>{w.logged_at}</Text></View>{w.target_weight_kg?<Text style={styles.meta}>Target: {Number(w.target_weight_kg).toFixed(1)} kg</Text>:null}<Pressable onPress={()=>remove('weight_logs',w.id)}><Text style={styles.delete}>DELETE</Text></Pressable></View>)}
   {weights.length===0&&<Text style={styles.meta}>No weight measurements saved.</Text>}
  </Section>

  <Section title="GOALS">
   <Field label="Goal *" value={goalTitle} onChangeText={setGoalTitle} placeholder="e.g. Improve roundhouse speed"/>
   <Field label="Target date" value={goalDate} onChangeText={setGoalDate} placeholder="YYYY-MM-DD"/>
   <Field label="Starting progress (%)" value={goalProgress} onChangeText={setGoalProgress} placeholder="0" keyboardType="number-pad"/>
   <Button title="ADD GOAL" onPress={addGoal} busy={busy}/>
   {goals.map(g=><View style={styles.inner} key={g.id}><View style={styles.cardRow}><Text style={styles.cardTitle}>{g.title}</Text><Text style={styles.link}>{g.progress}%</Text></View><Text style={styles.meta}>{g.target_date||'No target date'} • {g.status}</Text><View style={styles.row}><Pressable onPress={()=>updateGoal(g,-10)} style={styles.small}><Text style={styles.smallText}>−10%</Text></Pressable><Pressable onPress={()=>updateGoal(g,10)} style={styles.small}><Text style={styles.smallText}>+10%</Text></Pressable><Pressable onPress={()=>remove('goals',g.id)} style={styles.small}><Text style={styles.delete}>DELETE</Text></Pressable></View></View>)}
   {goals.length===0&&<Text style={styles.meta}>No goals saved.</Text>}
  </Section>

  {!!message&&<Text style={styles.message}>{message}</Text>}
  <Pressable onPress={signOut} style={styles.signOut}><Text style={styles.signOutText}>SIGN OUT</Text></Pressable>
 </ScrollView>
}

function Section({title,children}:{title:string;children:React.ReactNode}){return <View style={styles.block}><Text style={styles.section}>{title}</Text><View style={styles.card}>{children}</View></View>}
function Field({label,value,onChangeText,placeholder,keyboardType}:{label:string;value:string;onChangeText:(v:string)=>void;placeholder:string;keyboardType?:any}){return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={c.muted} keyboardType={keyboardType} style={styles.input}/></View>}
function Choice({title,active,onPress}:{title:string;active:boolean;onPress:()=>void}){return <Pressable onPress={onPress} style={[styles.choice,active&&styles.choiceActive]}><Text style={styles.choiceText}>{title}</Text></Pressable>}
function Button({title,onPress,busy}:{title:string;onPress:()=>void;busy:boolean}){return <Pressable onPress={onPress} disabled={busy} style={styles.button}>{busy?<ActivityIndicator color="#fff"/>:<Text style={styles.buttonText}>{title}</Text>}</Pressable>}
const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:c.background},content:{padding:20,paddingTop:52,paddingBottom:50,gap:12},eyebrow:{color:c.accent,fontSize:10,fontWeight:'900',letterSpacing:1.5},title:{color:c.text,fontSize:29,fontWeight:'800'},sub:{color:c.muted,fontSize:13},block:{gap:8},section:{color:c.muted,fontSize:10,fontWeight:'900',letterSpacing:1.5,marginTop:7},card:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:17,padding:16,gap:10},inner:{backgroundColor:c.background,borderWidth:1,borderColor:c.border,borderRadius:13,padding:12,gap:6},field:{gap:6},label:{color:c.text,fontSize:12,fontWeight:'700'},input:{backgroundColor:c.background,borderWidth:1,borderColor:c.border,borderRadius:12,color:c.text,padding:13,fontSize:14},row:{flexDirection:'row',gap:8,alignItems:'center'},choice:{flex:1,borderWidth:1,borderColor:c.border,borderRadius:12,padding:13,alignItems:'center'},choiceActive:{backgroundColor:c.accentDeep,borderColor:c.accent},choiceText:{color:c.text,fontWeight:'700'},button:{backgroundColor:c.accent,borderRadius:13,padding:14,alignItems:'center'},buttonText:{color:'#fff',fontSize:11,fontWeight:'900',letterSpacing:1},cardRow:{flexDirection:'row',justifyContent:'space-between',gap:10,alignItems:'center'},cardTitle:{color:c.text,fontSize:14,fontWeight:'750',flex:1},meta:{color:c.muted,fontSize:12},link:{color:c.accent,fontSize:11,fontWeight:'900'},small:{borderWidth:1,borderColor:c.border,borderRadius:9,paddingVertical:7,paddingHorizontal:10},smallText:{color:c.text,fontSize:10,fontWeight:'800'},delete:{color:'#F0A8B1',fontSize:9,fontWeight:'900',letterSpacing:1},message:{color:'#B6D0FF',fontSize:12},signOut:{borderWidth:1,borderColor:'#6D3038',borderRadius:13,padding:14,alignItems:'center'},signOutText:{color:'#F0A8B1',fontSize:11,fontWeight:'900',letterSpacing:1}
});
