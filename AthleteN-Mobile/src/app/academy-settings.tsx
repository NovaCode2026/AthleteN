import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon as AppIcon, c } from '@/components/mobile-ui';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

function Row({icon,title,subtitle,onPress,danger=false}:{icon:string;title:string;subtitle:string;onPress:()=>void;danger?:boolean}){
 return <Pressable onPress={onPress} style={({pressed})=>({backgroundColor:c.surface,borderWidth:1,borderColor:danger?'#5E2D38':c.borderStrong,borderRadius:18,padding:14,flexDirection:'row',alignItems:'center',gap:12,opacity:pressed?.72:1})}>
  <View style={{width:42,height:42,borderRadius:13,backgroundColor:danger?'#5E2D3828':c.accentSoft,alignItems:'center',justifyContent:'center'}}><AppIcon name={icon} size={20} color={danger?c.danger:c.accentBright}/></View>
  <View style={{flex:1}}><Text style={{color:danger?c.danger:c.text,fontSize:13,fontWeight:'900'}}>{title}</Text><Text style={{color:c.muted,fontSize:9,marginTop:3,lineHeight:14}}>{subtitle}</Text></View>
  {!danger?<AppIcon name="arrow" size={16} color={c.muted}/>:null}
 </Pressable>
}

export default function AcademySettings(){
 const router=useRouter(); const {profile}=useAuth(); const [academy,setAcademy]=useState<any>(null);
 useEffect(()=>{void (async()=>{if(!profile?.academy_id)return;const {data}=await supabase.from('academies').select('id,name,city,state,country,status').eq('id',profile.academy_id).maybeSingle();setAcademy(data)})()},[profile?.academy_id]);
 async function signOut(){const {error}=await supabase.auth.signOut();if(error)Alert.alert('Sign out failed',error.message);}
 return <ScrollView style={{flex:1,backgroundColor:c.background}} contentContainerStyle={{padding:20,paddingBottom:50,gap:12}}>
  <Pressable onPress={()=>router.back()} style={{width:40,height:40,borderRadius:12,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'}}><AppIcon name="back" size={20}/></Pressable>
  <View><Text style={{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:1.5}}>ACADEMY</Text><Text style={{color:c.text,fontSize:31,fontWeight:'900',marginTop:4}}>Settings</Text><Text style={{color:c.muted,fontSize:12,lineHeight:18,marginTop:5}}>Manage your academy workspace and AthleteN account.</Text></View>
  <View style={{backgroundColor:c.accentSoft,borderWidth:1,borderColor:c.accentDeep,borderRadius:18,padding:15}}>
   <Text style={{color:c.muted,fontSize:8,fontWeight:'900',letterSpacing:1}}>ACADEMY PROFILE</Text>
   <Text style={{color:c.text,fontSize:18,fontWeight:'900',marginTop:4}}>{academy?.name||'Academy'}</Text>
   <Text style={{color:c.muted,fontSize:9,marginTop:4}}>{[academy?.city,academy?.state,academy?.country].filter(Boolean).join(', ')||'Academy workspace'}</Text>
   <Text style={{color:c.accentBright,fontSize:8,fontWeight:'900',marginTop:7}}>{academy?.status?.toUpperCase()||'ACTIVE'}</Text>
  </View>
  <Text style={{color:c.muted,fontSize:9,fontWeight:'900',letterSpacing:1.4,marginTop:5}}>WORKSPACE</Text>
  <Row icon="settings" title="Customize bottom bar" subtitle="Choose and reorder the Academy sections shown in your bottom navigation." onPress={()=>router.push({pathname:'/navigation-settings',params:{mode:'academy'}})}/>
  <Row icon="people" title="Manage people" subtitle="Manage academy athletes and coaches." onPress={()=>router.replace('/academy')}/>
  <Row icon="chart" title="Academy plan & billing" subtitle="View your current plan, AI allowance and available plan changes." onPress={()=>router.push('/plans')}/>
  <Text style={{color:c.muted,fontSize:9,fontWeight:'900',letterSpacing:1.4,marginTop:7}}>ACCOUNT</Text>
  <Row icon="bell" title="Notifications" subtitle="Open your AthleteN notifications." onPress={()=>router.push('/notifications')}/>
  <Row icon="lock" title="Security & account" subtitle="Manage your account through the standard AthleteN account controls." onPress={()=>router.push('/profile')}/>
  <Row icon="close" title="Sign out" subtitle="Sign out of this AthleteN account." onPress={()=>void signOut()} danger/>
 </ScrollView>
}
