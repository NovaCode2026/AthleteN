import { useEffect,useState } from 'react';
import { Pressable,ScrollView,Text,View,StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { AVAILABLE,DEFAULT,KEY } from './(tabs)/_layout';

const c=Colors.dark;
export default function NavigationSettings(){
 const router=useRouter();const [items,setItems]=useState(DEFAULT);const [message,setMessage]=useState('');
 useEffect(()=>{void (async()=>{const raw=await AsyncStorage.getItem(KEY);if(raw){try{const p=JSON.parse(raw);if(Array.isArray(p))setItems(p)}catch{}}})()},[]);
 function toggle(id:string){setItems(v=>v.includes(id)?v.filter(x=>x!==id):v.length<6?[...v,id]:v)}
 function move(id:string,dir:number){setItems(v=>{const a=[...v],i=a.indexOf(id),j=i+dir;if(i<0||j<0||j>=a.length)return a;[a[i],a[j]]=[a[j],a[i]];return a})}
 async function save(){await AsyncStorage.setItem(KEY,JSON.stringify(items));setMessage('Bottom navigation saved.');setTimeout(()=>router.back(),500)}
 async function reset(){setItems(DEFAULT);await AsyncStorage.setItem(KEY,JSON.stringify(DEFAULT));setMessage('Default navigation restored.')}
 return <ScrollView style={s.screen} contentContainerStyle={s.content}>
  <Text style={s.kicker}>ATHLETEN PERSONALIZATION</Text><Text style={s.title}>Customize navigation</Text><Text style={s.sub}>Choose the AthleteN features you want directly on your bottom bar. Pick up to 6 and reorder them.</Text>
  <Text style={s.section}>ACTIVE BOTTOM BAR · {items.length}/6</Text>
  <View style={s.card}>{items.map((id,i)=>{const x=AVAILABLE.find(a=>a.id===id)!;return <View key={id} style={s.row}><View style={s.icon}><Text style={s.iconText}>{x.icon}</Text></View><View style={s.copy}><Text style={s.name}>{x.label}</Text><Text style={s.meta}>Position {i+1}</Text></View><Pressable onPress={()=>move(id,-1)} style={s.small}><Text style={s.smallText}>‹</Text></Pressable><Pressable onPress={()=>move(id,1)} style={s.small}><Text style={s.smallText}>›</Text></Pressable><Pressable onPress={()=>toggle(id)} style={[s.small,s.remove]}><Text style={s.removeText}>×</Text></Pressable></View>})}</View>
  <Text style={s.section}>ADD FEATURES</Text>
  <View style={s.card}>{AVAILABLE.filter(x=>!items.includes(x.id)).map(x=><Pressable key={x.id} onPress={()=>toggle(x.id)} style={s.addRow}><View style={s.icon}><Text style={s.iconText}>{x.icon}</Text></View><View style={s.copy}><Text style={s.name}>{x.label}</Text><Text style={s.meta}>Add to bottom bar</Text></View><Text style={s.plus}>+</Text></Pressable>)}</View>
  <Pressable onPress={save} style={s.primary}><Text style={s.primaryText}>SAVE NAVIGATION</Text></Pressable>
  <Pressable onPress={()=>void reset()} style={s.secondary}><Text style={s.secondaryText}>RESET TO ATHLETEN DEFAULT</Text></Pressable>
  {message?<Text style={s.message}>{message}</Text>:null}
 </ScrollView>
}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:c.background},content:{padding:20,paddingBottom:50,gap:13},kicker:{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:1.5},title:{color:c.text,fontSize:31,fontWeight:'900'},sub:{color:c.muted,fontSize:12,lineHeight:19},section:{color:c.muted,fontSize:9,fontWeight:'900',letterSpacing:1.4,marginTop:5},card:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:20,padding:9,gap:4},row:{flexDirection:'row',alignItems:'center',gap:9,padding:7},icon:{width:40,height:40,borderRadius:13,backgroundColor:c.accentDeep,alignItems:'center',justifyContent:'center'},iconText:{color:c.accentBright,fontSize:17,fontWeight:'900'},copy:{flex:1},name:{color:c.text,fontSize:13,fontWeight:'900'},meta:{color:c.muted,fontSize:9},small:{width:34,height:34,borderRadius:10,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},smallText:{color:c.text,fontSize:20,fontWeight:'900'},remove:{borderColor:'#5E2D38'},removeText:{color:c.danger,fontSize:20,fontWeight:'900'},addRow:{flexDirection:'row',alignItems:'center',gap:10,padding:8},plus:{color:c.accentBright,fontSize:25,fontWeight:'700'},primary:{backgroundColor:c.accent,borderRadius:14,padding:15,alignItems:'center'},primaryText:{color:'#fff',fontSize:10,fontWeight:'900',letterSpacing:1},secondary:{borderWidth:1,borderColor:c.border,borderRadius:14,padding:14,alignItems:'center'},secondaryText:{color:c.text,fontSize:9,fontWeight:'900',letterSpacing:1},message:{color:c.success,fontSize:11,fontWeight:'800'}});
