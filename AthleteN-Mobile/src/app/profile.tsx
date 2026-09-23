import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '@/constants/theme';
import { Icon } from '@/components/mobile-ui';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import { PerformanceLine } from '@/components/performance-chart';

const c = Colors.dark;

export default function ProfileScreen() {
  const { profile, session, signOut, refreshProfile } = useAuth();
  const router = useRouter();
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
  const [nutritionEnabled,setNutritionEnabled]=useState(profile?.role==='athlete'||!profile?.role);
  const [avatarUrl,setAvatarUrl]=useState<string|null>(null);
  const [avatarBusy,setAvatarBusy]=useState(false);

  const load=useCallback(async()=>{
    if(!session)return;
    const [w,g,n]=await Promise.all([
      supabase.from('weight_logs').select('id,logged_at,weight_kg,target_weight_kg,notes').eq('user_id',session.user.id).order('logged_at',{ascending:false}).limit(30),
      supabase.from('goals').select('id,title,target_date,status,progress,notes').eq('user_id',session.user.id).order('target_date',{ascending:true}),
      supabase.from('profiles').select('role').eq('user_id',session.user.id).maybeSingle()
    ]);
    if(w.error||g.error||n.error)setMessage(w.error?.message||g.error?.message||n.error?.message||'Could not load profile data.');
    if(profile?.profile_image_path){const signed=await supabase.storage.from('avatars').createSignedUrl(profile.profile_image_path,3600);setAvatarUrl(signed.data?.signedUrl||null)}else setAvatarUrl(null);
    setWeights(w.data||[]); setGoals(g.data||[]); setNutritionEnabled((n.data?.role||profile?.role)==='athlete');
  },[session]);
  useEffect(()=>{void load()},[load]);

  async function changePhoto(){
    if(!session)return;
    const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();
    if(!permission.granted){setMessage('Photo library permission is required to choose a profile photo.');return}
    const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsEditing:true,aspect:[1,1],quality:.85});
    if(result.canceled||!result.assets[0]?.uri)return;
    setAvatarBusy(true);setMessage('');
    try{
      const asset=result.assets[0];const response=await fetch(asset.uri);const body=await response.arrayBuffer();
      const ext=(asset.fileName?.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
      const path=session.user.id+'/'+Date.now()+'.'+ext;
      const upload=await supabase.storage.from('avatars').upload(path,body,{contentType:asset.mimeType||'image/jpeg',upsert:false,cacheControl:'3600'});
      if(upload.error)throw upload.error;
      const update=await supabase.from('profiles').update({profile_image_path:path}).eq('user_id',session.user.id);
      if(update.error)throw update.error;
      const signed=await supabase.storage.from('avatars').createSignedUrl(path,3600);setAvatarUrl(signed.data?.signedUrl||null);await refreshProfile();setMessage('Profile photo updated.');
    }catch(error){setMessage(error instanceof Error?error.message:'Could not update profile photo.')}finally{setAvatarBusy(false)}
  }

  async function saveProfile(){
    if(!session||!name.trim()||!dob.trim()||!gender.trim()||!sport.trim()||!club.trim()||!coach.trim()){setMessage('Complete every required athlete field.');return}
    setBusy(true);
    const {error}=await supabase.from('profiles').update({full_name:name.trim(),date_of_birth:dob.trim(),gender:gender.trim(),sport:sport.trim(),club:club.trim(),coach:coach.trim(),discipline}).eq('user_id',session.user.id);
    setBusy(false); if(error)setMessage(error.message); else {setMessage('Profile saved.');await refreshProfile()}
  }
  async function addWeight(){
    const value=Number(weight); const t=target.trim()?Number(target):null;
    if(!session||!Number.isFinite(value)||value<=0){setMessage('Enter a valid weight.');return}
    setBusy(true);
    const {error}=await supabase.from('weight_logs').insert({user_id:session.user.id,logged_at:new Date().toISOString().slice(0,10),weight_kg:value,target_weight_kg:t});
    setBusy(false); if(error)setMessage(error.message); else {setWeight('');setTarget('');setMessage('Weight saved.');await load()}
  }
  async function addGoal(){
    if(!session||!goalTitle.trim()){setMessage('Goal title is required.');return}
    const p=Math.max(0,Math.min(100,Number(goalProgress)||0));
    setBusy(true);
    const {error}=await supabase.from('goals').insert({user_id:session.user.id,title:goalTitle.trim(),target_date:goalDate.trim()||null,progress:p,status:p>=100?'completed':'active'});
    setBusy(false);if(error)setMessage(error.message);else{setGoalTitle('');setGoalDate('');setGoalProgress('0');setMessage('Goal saved.');await load()}
  }
  async function updateGoal(g:any,delta:number){
    const p=Math.max(0,Math.min(100,Number(g.progress)+delta));
    const {error}=await supabase.from('goals').update({progress:p,status:p>=100?'completed':'active'}).eq('id',g.id).eq('user_id',session?.user.id);
    if(error)setMessage(error.message);else await load()
  }
  async function remove(table:string,id:string){
    setBusy(true);const {error}=await supabase.from(table).delete().eq('id',id).eq('user_id',session?.user.id);setBusy(false);
    if(error)setMessage(error.message);else await load()
  }
  const isAdmin=profile?.role==='admin'||profile?.role==='super_admin';
  const weightChart=[...weights].reverse().slice(-7).map(w=>({label:String(w.logged_at).slice(5,10).replace('-','/'),value:Number(w.weight_kg)}));

  return <ScrollView style={s.screen} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
    <View style={s.brandRow}><Image source={require('@/assets/logo.png')} style={s.logo} contentFit="cover"/><View><Text style={s.brand}>ATHLETEN</Text><Text style={s.brandSub}>ATHLETE PROFILE</Text></View></View>
    <View style={s.profileHero}><Pressable onPress={()=>void changePhoto()} disabled={avatarBusy} style={s.avatarWrap}>{avatarUrl?<Image source={{uri:avatarUrl}} style={s.avatarImage} contentFit="cover"/>:<View style={s.avatar}><Text style={s.avatarText}>{(profile?.full_name||'A').slice(0,1).toUpperCase()}</Text></View>}<View style={s.photoBadge}><Text style={s.photoBadgeText}>{avatarBusy?'…':'+'}</Text></View></Pressable><View style={s.heroCopy}><Text style={s.name}>{profile?.full_name||'Athlete'}</Text><Text style={s.meta}>{discipline} • {profile?.plan_id||'free'} plan</Text><Pressable onPress={()=>void changePhoto()}><Text style={s.changePhoto}>CHANGE PROFILE PHOTO</Text></Pressable></View><View style={s.liveDot}/></View>

    <Section title="ATHLETE IDENTITY"><View style={s.card}>
      <Field label="Full name" value={name} onChangeText={setName} placeholder="Your full name"/><Field label="Date of birth" value={dob} onChangeText={setDob} placeholder="YYYY-MM-DD"/><Field label="Gender" value={gender} onChangeText={setGender} placeholder="Gender"/><Field label="Sport" value={sport} onChangeText={setSport} placeholder="Taekwondo"/><Field label="Club / Academy" value={club} onChangeText={setClub} placeholder="Club / Academy"/><Field label="Coach" value={coach} onChangeText={setCoach} placeholder="Coach"/>
      <Text style={s.label}>DISCIPLINE</Text><View style={s.choiceRow}><Choice title="Kyorugi" active={discipline==='Kyorugi'} onPress={()=>setDiscipline('Kyorugi')}/><Choice title="Poomsae" active={discipline==='Poomsae'} onPress={()=>setDiscipline('Poomsae')}/></View><Button title="SAVE PROFILE" onPress={saveProfile} busy={busy}/>
    </View></Section>

    <Section title="WEIGHT"><View style={s.card}>
      <View style={s.weightHero}><View><Text style={s.smallKicker}>LATEST</Text><Text style={s.weightValue}>{weights[0]?Number(weights[0].weight_kg).toFixed(1):'—'} <Text style={s.weightUnit}>KG</Text></Text></View><View style={s.weightBadge}><Text style={s.weightBadgeText}>{weights.length} LOGS</Text></View></View>
      <PerformanceLine title="Weight trend" subtitle="Latest saved measurements" data={weightChart} unit="kg" accent={c.success}/>
      <View style={s.inlineFields}><Field label="Current weight" value={weight} onChangeText={setWeight} placeholder="50.0" keyboardType="decimal-pad" compact/><Field label="Target" value={target} onChangeText={setTarget} placeholder="Optional" keyboardType="decimal-pad" compact/></View>
      <Button title="LOG WEIGHT" onPress={addWeight} busy={busy}/>
      {weights.slice(0,4).map(w=><View style={s.listRow} key={w.id}><View><Text style={s.listTitle}>{Number(w.weight_kg).toFixed(1)} kg</Text><Text style={s.meta}>{w.logged_at}</Text></View><Pressable onPress={()=>remove('weight_logs',w.id)}><Text style={s.delete}>DELETE</Text></Pressable></View>)}
      {!weights.length?<Text style={s.meta}>No weight measurements saved yet.</Text>:null}
    </View></Section>

    <Section title="GOALS"><View style={s.card}>
      <Field label="Goal" value={goalTitle} onChangeText={setGoalTitle} placeholder="What are you working toward?"/><Field label="Target date" value={goalDate} onChangeText={setGoalDate} placeholder="YYYY-MM-DD"/><Field label="Starting progress %" value={goalProgress} onChangeText={setGoalProgress} placeholder="0" keyboardType="number-pad"/><Button title="ADD GOAL" onPress={addGoal} busy={busy}/>
      {goals.map(g=><View style={s.goalRow} key={g.id}><View style={s.goalTop}><Text style={s.listTitle}>{g.title}</Text><Text style={s.progressText}>{g.progress}%</Text></View><View style={s.progressTrack}><View style={[s.progressFill,{width:Math.max(0,Math.min(100,Number(g.progress)))+'%'}]}/></View><Text style={s.meta}>{g.target_date||'No target date'} • {g.status}</Text><View style={s.goalActions}><Pressable style={s.smallButton} onPress={()=>updateGoal(g,-10)}><Text style={s.smallText}>−10</Text></Pressable><Pressable style={s.smallButton} onPress={()=>updateGoal(g,10)}><Text style={s.smallText}>+10</Text></Pressable><Pressable style={s.smallButton} onPress={()=>remove('goals',g.id)}><Text style={s.delete}>DELETE</Text></Pressable></View></View>)}
      {!goals.length?<Text style={s.meta}>No goals saved yet.</Text>:null}
    </View></Section>

    {message?<Text style={s.message}>{message}</Text>:null}
    <Pressable onPress={()=>router.push('/plans')} style={s.adminCard}><View><Text style={s.adminKicker}>ATHLETEN ACCOUNT</Text><Text style={s.adminTitle}>Plan & Billing</Text><Text style={s.meta}>View your current plan, features and AI usage.</Text></View><Icon name="arrow" size={16} color={c.muted}/></Pressable>
    {nutritionEnabled?<Pressable onPress={()=>router.push('/nutrition')} style={s.adminCard}><View><Text style={s.adminKicker}>ATHLETEN FUEL</Text><Text style={s.adminTitle}>Nutrition & Hydration</Text><Text style={s.meta}>Log meals, optional calories and hydration.</Text></View><Icon name="arrow" size={16} color={c.muted}/></Pressable>:null}
    <Pressable onPress={()=>router.push('/scanner')} style={s.adminCard}><View><Text style={s.adminKicker}>ATHLETEN INTELLIGENCE</Text><Text style={s.adminTitle}>Tournament Scanner</Text><Text style={s.meta}>Scan and track tournament sources.</Text></View><Text style={s.adminArrow}>›</Text></Pressable>
    <Pressable onPress={()=>router.push('/team')} style={s.adminCard}><View><Text style={s.adminKicker}>MY TEAM</Text><Text style={s.adminTitle}>Coach & Academy</Text><Text style={s.meta}>Connect with your Coach or Academy using their unique code.</Text></View><Text style={s.adminArrow}>›</Text></Pressable>
    <Pressable onPress={()=>router.push('/navigation-settings')} style={s.adminCard}><View><Text style={s.adminKicker}>PERSONALIZATION</Text><Text style={s.adminTitle}>Customize Bottom Bar</Text><Text style={s.meta}>Choose and reorder the AthleteN features you want at the bottom.</Text></View><Text style={s.adminArrow}>›</Text></Pressable>
    <Pressable onPress={()=>router.push('/explore')} style={s.adminCard}><View><Text style={s.adminKicker}>ATHLETEN COMMAND CENTER</Text><Text style={s.adminTitle}>More AthleteN Features</Text><Text style={s.meta}>Taekwondo Hub, Calendar, Medals, Documents, Messages, Roadmap and more.</Text></View><Text style={s.adminArrow}>›</Text></Pressable>{isAdmin?<Pressable onPress={()=>router.push('/admin')} style={s.adminCard}><View><Text style={s.adminKicker}>OWNER / ADMIN</Text><Text style={s.adminTitle}>Admin Command Center</Text><Text style={s.meta}>Manage AthleteN from a dedicated workspace.</Text></View><Text style={s.adminArrow}>›</Text></Pressable>:null}
    <Pressable onPress={()=>router.push('/reset-request')} style={s.settingsRow}><Icon name="refresh" size={18}/><View style={s.settingsCopy}><Text style={s.settingsTitle}>Password & account security</Text><Text style={s.meta}>Reset your password or recover access</Text></View><Text style={s.adminArrow}>›</Text></Pressable>
    <Pressable onPress={signOut} style={s.signOut}><Text style={s.signOutText}>SIGN OUT</Text></Pressable>
  </ScrollView>
}

function Section({title,children}:{title:string;children:React.ReactNode}){return <View style={s.sectionBlock}><Text style={s.section}>{title}</Text>{children}</View>}
function Field({label,value,onChangeText,placeholder,keyboardType,compact}:{label:string;value:string;onChangeText:(v:string)=>void;placeholder:string;keyboardType?:any;compact?:boolean}){return <View style={[s.field,compact&&s.compactField]}><Text style={s.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={c.muted} keyboardType={keyboardType} style={s.input}/></View>}
function Choice({title,active,onPress}:{title:string;active:boolean;onPress:()=>void}){return <Pressable onPress={onPress} style={[s.choice,active&&s.choiceActive]}><Text style={[s.choiceText,active&&s.choiceTextActive]}>{title}</Text></Pressable>}
function Button({title,onPress,busy}:{title:string;onPress:()=>void;busy:boolean}){return <Pressable onPress={onPress} disabled={busy} style={s.button}>{busy?<ActivityIndicator color="#fff"/>:<Text style={s.buttonText}>{title}</Text>}</Pressable>}

const s=StyleSheet.create({
 screen:{flex:1,backgroundColor:c.background},content:{padding:18,paddingBottom:50,gap:12},brandRow:{flexDirection:'row',alignItems:'center',gap:10},logo:{width:43,height:43,borderRadius:13},brand:{color:c.text,fontSize:15,fontWeight:'900',letterSpacing:3.4},brandSub:{color:c.muted,fontSize:7,fontWeight:'800',letterSpacing:1.1},profileHero:{flexDirection:'row',alignItems:'center',backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong,borderRadius:22,padding:16,gap:12},avatar:{width:56,height:56,borderRadius:18,backgroundColor:c.accentDeep,borderWidth:1,borderColor:c.accent,alignItems:'center',justifyContent:'center'},avatarText:{color:c.accentBright,fontSize:22,fontWeight:'900'},heroCopy:{flex:1},name:{color:c.text,fontSize:20,fontWeight:'900'},liveDot:{width:9,height:9,borderRadius:5,backgroundColor:c.success},sectionBlock:{gap:7},section:{color:c.muted,fontSize:9,fontWeight:'900',letterSpacing:1.5},card:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:19,padding:15,gap:11},field:{gap:5},compactField:{flex:1},label:{color:c.textSecondary,fontSize:10,fontWeight:'800'},input:{backgroundColor:c.background,borderWidth:1,borderColor:c.border,borderRadius:12,color:c.text,padding:11,fontSize:13},choiceRow:{flexDirection:'row',gap:8},choice:{flex:1,borderWidth:1,borderColor:c.border,borderRadius:12,padding:12,alignItems:'center'},choiceActive:{backgroundColor:c.accentSoft,borderColor:c.accent},choiceText:{color:c.textSecondary,fontSize:12,fontWeight:'800'},choiceTextActive:{color:c.accentBright},button:{backgroundColor:c.accent,borderRadius:12,padding:13,alignItems:'center'},buttonText:{color:'#fff',fontSize:10,fontWeight:'900',letterSpacing:1},weightHero:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},smallKicker:{color:c.muted,fontSize:8,fontWeight:'900',letterSpacing:1.3},weightValue:{color:c.text,fontSize:30,fontWeight:'900'},weightUnit:{color:c.muted,fontSize:10},weightBadge:{backgroundColor:c.accentSoft,borderRadius:999,paddingHorizontal:10,paddingVertical:6},weightBadgeText:{color:c.accentBright,fontSize:8,fontWeight:'900'},inlineFields:{flexDirection:'row',gap:9},listRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderTopWidth:1,borderTopColor:c.border,paddingTop:10},listTitle:{color:c.text,fontSize:13,fontWeight:'800'},meta:{color:c.muted,fontSize:11,lineHeight:17},delete:{color:c.danger,fontSize:8,fontWeight:'900'},goalRow:{backgroundColor:c.background,borderWidth:1,borderColor:c.border,borderRadius:13,padding:12,gap:8},goalTop:{flexDirection:'row',justifyContent:'space-between',gap:8},progressText:{color:c.accentBright,fontSize:10,fontWeight:'900'},progressTrack:{height:6,borderRadius:4,backgroundColor:c.border,overflow:'hidden'},progressFill:{height:'100%',backgroundColor:c.accent,borderRadius:4},goalActions:{flexDirection:'row',gap:7},smallButton:{borderWidth:1,borderColor:c.border,borderRadius:9,paddingHorizontal:10,paddingVertical:7},smallText:{color:c.text,fontSize:9,fontWeight:'800'},message:{color:c.accentBright,fontSize:11},adminCard:{flexDirection:'row',alignItems:'center',backgroundColor:c.accentSoft,borderWidth:1,borderColor:c.accentDeep,borderRadius:18,padding:15,gap:10},adminKicker:{color:c.accentBright,fontSize:8,fontWeight:'900',letterSpacing:1.2},adminTitle:{color:c.text,fontSize:15,fontWeight:'900'},adminArrow:{color:c.muted,fontSize:28},settingsRow:{flexDirection:'row',alignItems:'center',gap:11,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:17,padding:14},settingsIcon:{color:c.accentBright,fontSize:18},settingsCopy:{flex:1},settingsTitle:{color:c.text,fontSize:13,fontWeight:'800'},signOut:{borderWidth:1,borderColor:'#61303A',borderRadius:13,padding:13,alignItems:'center'},signOutText:{color:c.danger,fontSize:10,fontWeight:'900',letterSpacing:1}
});