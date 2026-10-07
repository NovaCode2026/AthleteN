// @ts-nocheck
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

const c = Colors.dark;

export default function BadgesScreen(){
  const { session } = useAuth();
  const [badges,setBadges]=useState<any[]>([]);
  const [defs,setDefs]=useState<Record<string,any>>({});
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [message,setMessage]=useState('');

  const load=useCallback(async()=>{
    if(!session)return;
    setMessage('');
    const [b,d]=await Promise.all([
      supabase.from('athlete_badges').select('id,badge_key,badge_label,awarded_at,metadata,permanent').eq('user_id',session.user.id).order('awarded_at',{ascending:false}),
      supabase.from('badge_definitions').select('badge_key,badge_label,description,category,rarity,icon')
    ]);
    if(b.error||d.error)setMessage(b.error?.message||d.error?.message||'Could not load badges.');
    setBadges(b.data||[]);
    setDefs(Object.fromEntries((d.data||[]).map((x:any)=>[x.badge_key,x])));
    setLoading(false);setRefreshing(false);
  },[session]);

  useEffect(()=>{void load()},[load]);

  if(loading)return <View style={s.center}><ActivityIndicator color={c.accentBright}/><Text style={s.muted}>Loading badges…</Text></View>;

  return <ScrollView style={s.screen} contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);void load()}} tintColor={c.accentBright}/>}>
    <View style={s.hero}>
      <Text style={s.kicker}>ATHLETEN RECOGNITION</Text>
      <Text style={s.title}>Your Badges</Text>
      <Text style={s.subtitle}>Milestones, founding status and achievements earned through your AthleteN journey.</Text>
      <View style={s.count}><Text style={s.countBig}>{badges.length}</Text><Text style={s.countLabel}>BADGES EARNED</Text></View>
    </View>
    {message?<Text style={s.error}>{message}</Text>:null}
    {badges.length===0?<View style={s.empty}><Text style={s.emptyTitle}>Your journey starts here.</Text><Text style={s.muted}>Complete training, competition and AthleteN milestones to earn recognition.</Text></View>:badges.map((b:any)=>{
      const d=defs[b.badge_key]||{};
      return <View key={b.id} style={s.card}>
        <View style={s.icon}><Text style={s.iconText}>{d.icon||'🏅'}</Text></View>
        <View style={s.copy}><View style={s.row}><Text style={s.badge}>{b.badge_label||d.badge_label||b.badge_key}</Text>{b.permanent?<Text style={s.permanent}>PERMANENT</Text>:null}</View>
          <Text style={s.desc}>{d.description||'AthleteN achievement badge.'}</Text>
          <Text style={s.meta}>{d.rarity?String(d.rarity).toUpperCase()+' • ':''}{new Date(b.awarded_at).toLocaleDateString()}</Text>
        </View>
      </View>
    })}
    <View style={s.note}><Text style={s.noteTitle}>Founder & founding badges</Text><Text style={s.muted}>Special system badges are permanent and cannot be purchased. Early members keep their founding status.</Text></View>
  </ScrollView>
}

const s=StyleSheet.create({
 screen:{flex:1,backgroundColor:c.background},content:{padding:18,paddingBottom:120},
 center:{flex:1,backgroundColor:c.background,alignItems:'center',justifyContent:'center',gap:10},muted:{color:c.muted,fontSize:12,lineHeight:18},
 hero:{padding:20,borderRadius:22,backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong,marginBottom:14},
 kicker:{color:c.accentBright,fontSize:10,fontWeight:'900',letterSpacing:1.5},title:{color:c.text,fontSize:30,fontWeight:'900',marginTop:5},subtitle:{color:c.muted,fontSize:13,lineHeight:19,marginTop:7},count:{marginTop:18,alignSelf:'flex-start',paddingHorizontal:16,paddingVertical:10,borderRadius:14,backgroundColor:c.accentSoft},countBig:{color:c.text,fontSize:24,fontWeight:'900'},countLabel:{color:c.muted,fontSize:9,fontWeight:'900'},
 card:{flexDirection:'row',gap:14,padding:16,borderRadius:18,backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong,marginBottom:10},icon:{width:52,height:52,borderRadius:16,backgroundColor:c.accentSoft,alignItems:'center',justifyContent:'center'},iconText:{fontSize:27},copy:{flex:1},row:{flexDirection:'row',alignItems:'center',gap:8,flexWrap:'wrap'},badge:{color:c.text,fontSize:15,fontWeight:'900'},permanent:{color:c.accentBright,fontSize:8,fontWeight:'900',letterSpacing:1},desc:{color:c.muted,fontSize:11,lineHeight:16,marginTop:4},meta:{color:c.muted,fontSize:9,fontWeight:'800',marginTop:7},
 empty:{padding:22,borderRadius:18,backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong},emptyTitle:{color:c.text,fontSize:16,fontWeight:'900',marginBottom:5},error:{color:c.danger,fontSize:11,marginBottom:10},note:{marginTop:8,padding:16,borderRadius:18,backgroundColor:c.surface},noteTitle:{color:c.text,fontSize:13,fontWeight:'900',marginBottom:4}
});
