import {Tabs} from 'expo-router';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {useEffect,useState} from 'react';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import {Colors} from '@/constants/theme';
import {Icon} from '@/components/mobile-ui';

const c=Colors.dark;
export const KEY='athleten.bottom-navigation.v1';
export const DEFAULT=['index','training','ai','compete','profile','explore'] as const;
export const AVAILABLE=[
 {id:'index',label:'Home',icon:'dashboard'},
 {id:'training',label:'Train',icon:'training'},
 {id:'ai',label:'AI Coach',icon:'ai'},
 {id:'compete',label:'Compete',icon:'event'},
 {id:'profile',label:'Profile',icon:'person'},
 {id:'explore',label:'More',icon:'more'},
] as const;

function DashboardGlyph({color,size=19}:{color:string;size?:number}){const cell=Math.max(4,Math.round(size*.34));const gap=Math.max(2,Math.round(size*.1));return <View style={{width:size,height:size,flexDirection:'row',flexWrap:'wrap',gap,alignContent:'center',justifyContent:'center'}}><View style={{width:cell,height:cell,borderRadius:2,backgroundColor:color}}/><View style={{width:cell,height:cell,borderRadius:2,backgroundColor:color}}/><View style={{width:cell,height:cell,borderRadius:2,backgroundColor:color}}/><View style={{width:cell,height:cell,borderRadius:2,backgroundColor:color}}/></View>}
function Bar({state,navigation}:BottomTabBarProps){
 const insets=useSafeAreaInsets();
 const [order,setOrder]=useState<string[]>([...DEFAULT]);
 useEffect(()=>{let alive=true;(async()=>{try{const raw=await AsyncStorage.getItem(KEY);if(!alive||!raw)return;const parsed=JSON.parse(raw);if(Array.isArray(parsed)){const valid=parsed.filter((x:string)=>AVAILABLE.some(a=>a.id===x));const merged=[...valid,...DEFAULT.filter(x=>!valid.includes(x))];setOrder(merged.slice(0,6));}}catch{}})();return()=>{alive=false}},[]);
 return <View style={[s.outer,{paddingBottom:Math.max(insets.bottom,6)}]}><View style={s.bar}>
  {order.map(id=>{const meta=AVAILABLE.find(x=>x.id===id)!;const routeIndex=state.routes.findIndex(r=>r.name===id);const active=state.index===routeIndex;return <Pressable key={id} onPress={()=>navigation.navigate(id)} accessibilityRole="button" accessibilityState={active?{selected:true}:{}} style={s.item}><View style={[s.icon,active&&s.active]}>{id==='index'?<DashboardGlyph color={active?c.accentBright:c.muted} size={19}/>:<Icon name={meta.icon} size={19} color={active?c.accentBright:c.muted} />}</View><Text style={[s.label,active&&s.activeLabel]} numberOfLines={1}>{meta.label}</Text></Pressable>})}
 </View></View>
}

export default function TabLayout(){
 return <Tabs tabBar={p=><Bar {...p}/>} screenOptions={{headerShown:false,sceneStyle:{backgroundColor:c.background}}}>
  {AVAILABLE.map(x=><Tabs.Screen key={x.id} name={x.id}/>)}
 </Tabs>
}
const s=StyleSheet.create({outer:{backgroundColor:c.surface,borderTopWidth:1,borderTopColor:c.borderStrong},bar:{height:62,flexDirection:'row',paddingHorizontal:5,paddingTop:5},item:{flex:1,alignItems:'center',gap:2},icon:{width:38,height:30,borderRadius:13,alignItems:'center',justifyContent:'center'},active:{backgroundColor:c.accentSoft},iconText:{color:c.muted,fontSize:20,fontWeight:'700'},activeText:{color:c.accentBright},label:{color:c.muted,fontSize:9,fontWeight:'800'},activeLabel:{color:c.text}});
