import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

const c=Colors.dark;
export default function AnalyticsScreen(){
  const {session}=useAuth();
  const [data,setData]=useState({training:0,minutes:0,medals:0,goals:0,weights:0});
  const [loading,setLoading]=useState(true);
  useEffect(()=>{let alive=true;(async()=>{
    if(!session){if(alive)setLoading(false);return}
    const [t,m,g,w]=await Promise.all([
      supabase.from('training_sessions').select('id,minutes').eq('user_id',session.user.id),
      supabase.from('medals').select('id').eq('user_id',session.user.id),
      supabase.from('goals').select('id').eq('user_id',session.user.id),
      supabase.from('weight_logs').select('id').eq('user_id',session.user.id)
    ]);
    if(alive)setData({training:t.data?.length||0,minutes:(t.data||[]).reduce((n,x)=>n+Number(x.minutes||0),0),medals:m.data?.length||0,goals:g.data?.length||0,weights:w.data?.length||0});
    if(alive)setLoading(false);
  })();return()=>{alive=false}},[session]);
  return <ScrollView style={s.screen} contentContainerStyle={s.content}>
    <Text style={s.kicker}>ATHLETEN PERFORMANCE</Text><Text style={s.title}>Advanced analytics</Text>
    <Text style={s.sub}>A live summary from your synced athlete records.</Text>
    {loading?<ActivityIndicator color={c.accent}/>:<View style={s.grid}>
      <Card label="TRAINING SESSIONS" value={data.training}/><Card label="TRAINING MINUTES" value={data.minutes}/><Card label="MEDALS" value={data.medals}/><Card label="ACTIVE GOALS" value={data.goals}/><Card label="WEIGHT RECORDS" value={data.weights}/>
    </View>}
  </ScrollView>;
}
function Card({label,value}:{label:string;value:number}){return <View style={s.card}><Text style={s.label}>{label}</Text><Text style={s.value}>{value.toLocaleString('en-IN')}</Text></View>}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:c.background},content:{padding:20,gap:12},kicker:{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:1.5},title:{color:c.text,fontSize:30,fontWeight:'900'},sub:{color:c.muted,fontSize:12,lineHeight:18},grid:{gap:10},card:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:18,padding:16},label:{color:c.muted,fontSize:9,fontWeight:'900',letterSpacing:1},value:{color:c.text,fontSize:28,fontWeight:'900',marginTop:5}});
