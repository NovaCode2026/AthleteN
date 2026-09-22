import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text, Pressable, View, StyleSheet } from 'react-native';
import { Tabs, TabList, TabSlot, TabTrigger } from 'expo-router/ui';
import { useFocusEffect, usePathname } from 'expo-router';
import { Colors } from '@/constants/theme';

const c=Colors.dark;
const KEY='athleten.mobile.nav.v1';
const DEFAULT=['index','training','ai','compete','profile','explore'];
const AVAILABLE=[
 {id:'index',label:'Home',icon:'⌂'}, {id:'training',label:'Train',icon:'✦'}, {id:'ai',label:'AI Coach',icon:'✧'},
 {id:'compete',label:'Compete',icon:'🏆'}, {id:'profile',label:'Profile',icon:'○'}, {id:'explore',label:'More',icon:'⊞'},
 {id:'messages',label:'Messages',icon:'M'}, {id:'calendar',label:'Calendar',icon:'C'}, {id:'weight',label:'Weight',icon:'W'},
 {id:'scanner',label:'Scanner',icon:'S'}, {id:'taekwondo',label:'Taekwondo',icon:'T'}, {id:'checklist',label:'Checklist',icon:'✓'},
 {id:'medals',label:'Medals',icon:'M'}, {id:'documents',label:'Documents',icon:'D'}, {id:'notifications',label:'Alerts',icon:'N'}
];

export default function TabLayout(){
 const pathname=usePathname(); const [items,setItems]=useState(DEFAULT);
 const load=useCallback(async()=>{try{const raw=await AsyncStorage.getItem(KEY);if(raw){const parsed=JSON.parse(raw);if(Array.isArray(parsed)&&parsed.length>=3&&parsed.every(x=>AVAILABLE.some(a=>a.id===x)))setItems(parsed)}}catch{}},[]);
 useEffect(()=>{void load()},[load]); useFocusEffect(useCallback(()=>{void load()},[load]));
 const active=pathname.split('/').filter(Boolean).at(-1)||'index';
 return <Tabs>
  <TabSlot />
  <TabList style={{display:'none'}}>
   {AVAILABLE.map(x=><TabTrigger key={x.id} name={x.id} href={x.id==='index'?'/(tabs)':'/(tabs)/'+x.id} />)}
  </TabList>
  <View style={s.bar}>
   {items.map(id=>{const x=AVAILABLE.find(a=>a.id===id)!;const focused=active===id;return <TabTrigger key={id} name={id} asChild><Pressable accessibilityRole="tab" accessibilityState={{selected:focused}} style={[s.item,focused&&s.active]}><Text style={[s.icon,focused&&s.iconActive]}>{x.icon}</Text><Text numberOfLines={1} style={[s.label,focused&&s.labelActive]}>{x.label}</Text></Pressable></TabTrigger>})}
  </View>
 </Tabs>;
}
export { AVAILABLE, DEFAULT, KEY };
const s=StyleSheet.create({
 bar:{position:'absolute',left:10,right:10,bottom:10,minHeight:70,backgroundColor:'#F8F9FF',borderRadius:25,borderWidth:1,borderColor:'#DCE3F0',padding:6,flexDirection:'row',alignItems:'center',shadowColor:'#000',shadowOpacity:.16,shadowRadius:18,shadowOffset:{width:0,height:8},elevation:12},
 item:{flex:1,minWidth:0,height:58,borderRadius:20,alignItems:'center',justifyContent:'center',gap:2},
 active:{backgroundColor:'#DCD9FF'},icon:{fontSize:21,color:'#4D5361',fontWeight:'800'},iconActive:{color:'#172A66'},label:{fontSize:9,color:'#4D5361',fontWeight:'700'},labelActive:{color:'#171C31',fontWeight:'900'}
});