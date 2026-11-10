// @ts-nocheck
import { useEffect,useMemo,useState } from 'react';
import { Alert,Pressable,ScrollView,Text,View,StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { NAV_ITEMS,KEY,getDefaultNavigation } from './(tabs)/_layout';
import { Icon } from '@/components/mobile-ui';
import { useAuth } from '@/context/AuthContext';
import { hasFeature } from '@/lib/entitlements';
import { supabase } from '@/lib/supabase';

const c=Colors.dark;
const MORE_ID='explore';
const MAX_VISIBLE=6;
function normalizeNavigation(ids:string[],eligibleIds:string[]){const valid=[...new Set(ids.filter(id=>id!==MORE_ID&&eligibleIds.includes(id)))].slice(0,MAX_VISIBLE-1);return [...valid,MORE_ID]}
export default function NavigationSettings(){
 const router=useRouter(); const {profile}=useAuth();
 const eligible=useMemo(()=>NAV_ITEMS.filter(x=>!x.feature||hasFeature(profile?.plan_id,x.feature,profile?.role)),[profile?.plan_id,profile?.role]);
 const [items,setItems]=useState<string[]>([]);
 const [message,setMessage]=useState('');
 useEffect(()=>{void(async()=>{try{const raw=await AsyncStorage.getItem(KEY);const parsed=raw?JSON.parse(raw):[];const localValid=Array.isArray(parsed)?parsed.filter((x:string)=>eligible.some(a=>a.id===x)):[];const {data}=await supabase.rpc('get_my_navigation_preferences');const remoteValid=Array.isArray(data)?data.filter((x:string)=>eligible.some(a=>a.id===x)):[];const chosen=remoteValid.length?remoteValid:localValid;const defaults=getDefaultNavigation(profile?.discipline).filter(x=>eligible.some(a=>a.id===x));setItems(normalizeNavigation(chosen.length?[...chosen,...defaults.filter(x=>!chosen.includes(x))]:defaults,eligible.map(x=>x.id)));}catch{const d=getDefaultNavigation(profile?.discipline).filter(x=>eligible.some(a=>a.id===x));setItems(normalizeNavigation(d,eligible.map(x=>x.id)))}})()},[eligible.map(x=>x.id).join('|'),profile?.discipline]);
 function toggle(id:string){if(id===MORE_ID){Alert.alert('More is required','More always stays on your navigation bar so every feature remains easy to find.');return}if(items.includes(id)){const x=eligible.find(a=>a.id===id);Alert.alert('Remove shortcut?',`${x?.label||'This feature'} will move back to All available shortcuts.`,[{text:'Cancel',style:'cancel'},{text:'Remove',style:'destructive',onPress:()=>setItems(v=>normalizeNavigation(v.filter(item=>item!==id),eligible.map(a=>a.id)))}]);}else if(items.length<MAX_VISIBLE)setItems(v=>normalizeNavigation([...v.filter(x=>x!==MORE_ID),id],eligible.map(a=>a.id)));else Alert.alert('Navigation full','Choose up to five shortcuts plus the required More button. Remove one shortcut first.')}
 function move(id:string,dir:number){if(id===MORE_ID)return;setItems(v=>{const a=[...v],i=a.indexOf(id),j=i+dir;if(i<0||j<0||j>=a.length-1)return a;[a[i],a[j]]=[a[j],a[i]];return a})}
 async function save(){const next=normalizeNavigation(items,eligible.map(x=>x.id));const {error}=await supabase.rpc('set_my_navigation_preferences',{p_item_ids:next});if(error){setMessage('Could not sync navigation. Try again.');return}await AsyncStorage.setItem(KEY,JSON.stringify(next));setMessage('Bottom navigation saved and synced across your devices.');setTimeout(()=>router.back(),500)}
 async function reset(){const d=normalizeNavigation(getDefaultNavigation(profile?.discipline),eligible.map(x=>x.id));setItems(d);await supabase.rpc('set_my_navigation_preferences',{p_item_ids:d});await AsyncStorage.setItem(KEY,JSON.stringify(d));setMessage('Default navigation restored and synced.')}
 return <ScrollView style={s.screen} contentContainerStyle={s.content}>
  <Text style={s.kicker}>ATHLETEN PERSONALIZATION</Text><Text style={s.title}>Customize bottom navigation</Text>
  <Text style={s.sub}>Choose up to five shortcuts for your bottom bar, reorder them anytime, and keep More available for everything else.</Text>
  <Text style={s.section}>ACTIVE SHORTCUTS · {Math.max(0,items.length-1)}/5</Text>
  <View style={s.card}>{items.map((id,i)=>{const x=eligible.find(a=>a.id===id);if(!x)return null;return <View key={id} style={s.row}><View style={s.icon}><Icon name={x.icon} size={18}/></View><View style={s.copy}><Text style={s.name}>{x.label}</Text><Text style={s.meta}>{id===MORE_ID?'Required · always available':`Position ${i+1}`}</Text></View><Pressable onPress={()=>move(id,-1)} style={s.small}><Text style={s.smallText}>‹</Text></Pressable><Pressable onPress={()=>move(id,1)} disabled={id===MORE_ID||i===items.length-2} style={[s.small,(id===MORE_ID||i===items.length-2)&&{opacity:.3}]}><Text style={s.smallText}>›</Text></Pressable>{id===MORE_ID?<View style={[s.small,{borderColor:c.accent}]}><Icon name="lock" size={15}/></View>:<Pressable onPress={()=>toggle(id)} style={[s.small,s.remove]}><Text style={s.removeText}>×</Text></Pressable>}</View>})}</View>
  <Text style={s.section}>ALL FEATURES AVAILABLE ON YOUR PLAN</Text>
  <View style={s.card}>{eligible.filter(x=>x.id!==MORE_ID&&!items.includes(x.id)).map(x=><Pressable key={x.id} onPress={()=>toggle(x.id)} style={s.addRow}><View style={s.icon}><Icon name={x.icon} size={18}/></View><View style={s.copy}><Text style={s.name}>{x.label}</Text><Text style={s.meta}>Available for your plan</Text></View><Text style={s.plus}>+</Text></Pressable>)}</View>
  <Pressable onPress={save} style={s.primary}><Text style={s.primaryText}>SAVE NAVIGATION</Text></Pressable><Pressable onPress={()=>void reset()} style={s.secondary}><Text style={s.secondaryText}>RESET TO DEFAULT</Text></Pressable>
  {message?<Text style={s.message}>{message}</Text>:null}
 </ScrollView>;
}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:c.background},content:{padding:20,paddingBottom:50,gap:13},kicker:{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:1.5},title:{color:c.text,fontSize:31,fontWeight:'900'},sub:{color:c.muted,fontSize:12,lineHeight:19},section:{color:c.muted,fontSize:9,fontWeight:'900',letterSpacing:1.4,marginTop:5},card:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:20,padding:9,gap:4},row:{flexDirection:'row',alignItems:'center',gap:9,padding:7},icon:{width:40,height:40,borderRadius:13,backgroundColor:c.accentDeep,alignItems:'center',justifyContent:'center'},copy:{flex:1},name:{color:c.text,fontSize:13,fontWeight:'900'},meta:{color:c.muted,fontSize:9},small:{width:34,height:34,borderRadius:10,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},smallText:{color:c.text,fontSize:20,fontWeight:'900'},remove:{borderColor:'#5E2D38'},removeText:{color:c.danger,fontSize:20,fontWeight:'900'},addRow:{flexDirection:'row',alignItems:'center',gap:10,padding:8},plus:{color:c.accentBright,fontSize:25,fontWeight:'700'},primary:{backgroundColor:c.accent,borderRadius:14,padding:15,alignItems:'center'},primaryText:{color:'#fff',fontSize:10,fontWeight:'900',letterSpacing:1},secondary:{borderWidth:1,borderColor:c.border,borderRadius:14,padding:14,alignItems:'center'},secondaryText:{color:c.text,fontSize:9,fontWeight:'900',letterSpacing:1},message:{color:c.success,fontSize:11,fontWeight:'800'}});
