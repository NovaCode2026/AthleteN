// @ts-nocheck
import { Tabs } from 'expo-router';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/theme';
import { Icon } from '@/components/mobile-ui';
import { useAuth } from '@/context/AuthContext';
import { hasFeature } from '@/lib/entitlements';
import { supabase } from '@/lib/supabase';

const c = Colors.dark;
export const KEY = 'athleten.bottom-navigation.v2';
export const DEFAULT = ['index','training','ai','compete','profile','explore'] as const;

export const NAV_ITEMS = [
 {id:'index',label:'Home',icon:'dashboard',feature:null},
 {id:'training',label:'Train',icon:'training',feature:null},
 {id:'ai',label:'AI Coach',icon:'ai',feature:null},
 {id:'compete',label:'Compete',icon:'event',feature:null},
 {id:'profile',label:'Profile',icon:'person',feature:null},
 {id:'explore',label:'More',icon:'more',feature:null},
 {id:'calendar',label:'Calendar',icon:'calendar',feature:'calendar'},
 {id:'journey',label:'Journey',icon:'chart-timeline',feature:'athlete_journey'},
 {id:'weight',label:'Weight',icon:'chart',feature:'weight_tracking'},
 {id:'messages',label:'Messages',icon:'message',feature:'messaging'},
 {id:'documents',label:'Documents',icon:'file-document-outline',feature:'documents'},
 {id:'attendance',label:'Attendance',icon:'check',feature:'attendance'},
 {id:'analytics',label:'Analytics',icon:'chart',feature:'advanced_analytics'},
 {id:'reports',label:'Reports',icon:'file-document-outline',feature:'export_reports'},
 {id:'coach',label:'Coach',icon:'people',feature:'coach_dashboard'},
 {id:'verification-review',label:'Verify',icon:'check',feature:'weight_verification'},
 {id:'academy',label:'Academy',icon:'school-outline',feature:'academy_management'},
] as const;

export const AVAILABLE = NAV_ITEMS;

function DashboardGlyph({color,size=19}:{color:string;size?:number}) {
 const cell=Math.max(4,Math.round(size*.34)); const gap=Math.max(2,Math.round(size*.1));
 return <View style={{width:size,height:size,flexDirection:'row',flexWrap:'wrap',gap,alignContent:'center',justifyContent:'center'}}>
  {[0,1,2,3].map(i=><View key={i} style={{width:cell,height:cell,borderRadius:2,backgroundColor:color}}/>)} 
 </View>;
}

function Bar({state,navigation}:{state:any;navigation:any}) {
 const {profile}=useAuth(); const insets=useSafeAreaInsets();
 const eligible=useMemo(()=>NAV_ITEMS.filter(x=>!x.feature||hasFeature(profile?.plan_id,x.feature,profile?.role)),[profile?.plan_id,profile?.role]);
 const defaults=useMemo(()=>DEFAULT.filter(id=>eligible.some(x=>x.id===id)),[eligible]);
 const [order,setOrder]=useState<string[]>([...defaults]);
 useEffect(()=>{let alive=true;const load=async()=>{try{const local=await AsyncStorage.getItem(KEY);const localParsed=local?JSON.parse(local):[];const localValid=Array.isArray(localParsed)?localParsed.filter((x:string)=>eligible.some(a=>a.id===x)):[];const {data}=await supabase.rpc('get_my_navigation_preferences');if(!alive)return;const remoteValid=Array.isArray(data)?data.filter((x:string)=>eligible.some(a=>a.id===x)):[];const chosen=remoteValid.length?remoteValid:localValid;const next=[...chosen,...defaults.filter(x=>!chosen.includes(x))].slice(0,6);setOrder(next);await AsyncStorage.setItem(KEY,JSON.stringify(next));}catch{if(alive)setOrder([...defaults])}};void load();const sub=AppState.addEventListener('change',(state)=>{if(state==='active')void load()});return()=>{alive=false;sub.remove()}},[eligible.map(x=>x.id).join('|'),defaults.join('|')]);
 useEffect(()=>{if(!profile?.user_id)return;const channel=supabase.channel('athleten-nav-'+profile.user_id).on('postgres_changes',{event:'*',schema:'public',table:'user_navigation_preferences',filter:`user_id=eq.${profile.user_id}`},async()=>{try{const {data}=await supabase.rpc('get_my_navigation_preferences');if(Array.isArray(data)){const next=data.filter((x:string)=>eligible.some(a=>a.id===x)).slice(0,6);if(next.length){setOrder(next);await AsyncStorage.setItem(KEY,JSON.stringify(next));}}}catch{}}).subscribe();return()=>{void supabase.removeChannel(channel)}},[profile?.user_id,eligible.map(x=>x.id).join('|')]);
 const visible=order.filter(id=>eligible.some(x=>x.id===id)).slice(0,6);
 return <View style={[s.outer,{paddingBottom:Math.max(insets.bottom,6)}]}><View style={s.bar}>
  {visible.map(id=>{const meta=eligible.find(x=>x.id===id)!;const routeIndex=state.routes.findIndex((r:any)=>r.name===id);const active=state.index===routeIndex;return <Pressable key={id} onPress={()=>navigation.navigate(id)} accessibilityRole="button" accessibilityState={active?{selected:true}:{}} style={s.item}><View style={[s.icon,active&&s.active]}>{id==='index'?<DashboardGlyph color={active?c.accentBright:c.muted}/>:<Icon name={meta.icon} size={19} color={active?c.accentBright:c.muted}/>}</View><Text style={[s.label,active&&s.activeLabel]} numberOfLines={1}>{meta.label}</Text></Pressable>})}
 </View></View>;
}

export default function TabLayout(){
 const {profile}=useAuth();
 const eligible=NAV_ITEMS.filter(x=>!x.feature||hasFeature(profile?.plan_id,x.feature,profile?.role));
 return <Tabs tabBar={(p:any)=><Bar {...p}/>} screenOptions={{headerShown:false,sceneStyle:{backgroundColor:c.background}}}>
  {eligible.map(x=><Tabs.Screen key={x.id} name={x.id}/>)}
 </Tabs>;
}
const s=StyleSheet.create({outer:{backgroundColor:c.surface,borderTopWidth:1,borderTopColor:c.borderStrong},bar:{height:62,flexDirection:'row',paddingHorizontal:5,paddingTop:5},item:{flex:1,alignItems:'center',gap:2},icon:{width:38,height:30,borderRadius:13,alignItems:'center',justifyContent:'center'},active:{backgroundColor:c.accentSoft},label:{color:c.muted,fontSize:9,fontWeight:'800'},activeLabel:{color:c.text}});
