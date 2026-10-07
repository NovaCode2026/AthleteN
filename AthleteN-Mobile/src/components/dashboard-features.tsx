// @ts-nocheck
import { useEffect,useState } from 'react';
import { Pressable,Text,View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { hasFeature } from '@/lib/entitlements';
import { Colors } from '@/constants/theme';
const c=Colors.dark;
const items=[
 {key:'calendar',title:'Calendar',text:'Real schedule',route:'/calendar',feature:'calendar'},
 {key:'journey',title:'Athlete Journey',text:'Season & milestones',route:'/athlete-journey',feature:'athlete_journey'},
 {key:'weight',title:'Weight',text:'Weight trend',route:'/weight',feature:'weight_tracking'},
 {key:'messages',title:'Messages',text:'Coach & athlete chat',route:'/messages',feature:'messaging'},
 {key:'documents',title:'Documents',text:'Athlete records',route:'/documents',feature:'documents'},
 {key:'attendance',title:'Attendance',text:'Training attendance',route:'/attendance',feature:'attendance'},
 {key:'analytics',title:'Advanced Analytics',text:'Performance data',route:'/ai',feature:'advanced_analytics'},
 {key:'competition',title:'Competition Analysis',text:'Competition intelligence',route:'/compete',feature:'competition_analysis'},
 {key:'reports',title:'Export Reports',text:'Share athlete reports',route:'/reports',feature:'export_reports'},
 {key:'coach',title:'Coach Dashboard',text:'Coach workspace',route:'/coach',feature:'coach_dashboard'},
 {key:'academy',title:'Academy',text:'Academy workspace',route:'/academy',feature:'academy_management'}
];
export default function DashboardFeatures(){
 const {session,profile}=useAuth(); const router=useRouter(); const [selected,setSelected]=useState<string[]>([]);
 useEffect(()=>{if(!session)return;supabase.from('dashboard_widgets').select('widget_key').eq('user_id',session.user.id).order('position').then(({data})=>setSelected((data||[]).map(x=>x.widget_key)))},[session]);
 const toggle=async(item:any)=>{if(!session)return;const has=selected.includes(item.key);if(has)await supabase.from('dashboard_widgets').delete().eq('user_id',session.user.id).eq('widget_key',item.key);else await supabase.from('dashboard_widgets').insert({user_id:session.user.id,widget_key:item.key,position:selected.length});setSelected(has?selected.filter(x=>x!==item.key):[...selected,item.key])};
 const eligible=items.filter(x=>hasFeature(profile?.plan_id,x.feature,profile?.role));
 return <View style={{gap:9,marginTop:4}}><View style={{flexDirection:'row',justifyContent:'space-between'}}><Text style={{color:c.muted,fontSize:9,fontWeight:'900',letterSpacing:1.5}}>MY DASHBOARD</Text><Text style={{color:c.accentBright,fontSize:9,fontWeight:'900'}}>{String(profile?.plan_id||'free').toUpperCase()}</Text></View><View style={{flexDirection:'row',flexWrap:'wrap',gap:9}}>{eligible.map(item=>{const active=selected.includes(item.key);return <Pressable key={item.key} onPress={()=>active?router.push(item.route):void toggle(item)} onLongPress={()=>active?void toggle(item):undefined} style={{width:'48%',minHeight:76,backgroundColor:c.surface,borderWidth:1,borderColor:active?c.accent:c.border,borderRadius:17,padding:12,flexDirection:'row',alignItems:'center',gap:8}}><View style={{flex:1}}><Text style={{color:c.text,fontSize:12,fontWeight:'900'}}>{item.title}</Text><Text style={{color:c.muted,fontSize:9,marginTop:3}}>{item.text}</Text></View><Text style={{color:c.accentBright,fontSize:16,fontWeight:'900'}}>{active?'OPEN':'+'}</Text></Pressable>})}</View><Text style={{color:c.muted,fontSize:9,lineHeight:14}}>Tap + to add a feature to your dashboard. Tap OPEN to use it. Long-press an added feature to remove it.</Text></View>;
}