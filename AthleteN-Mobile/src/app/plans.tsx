import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

const c = Colors.dark;
const plans = [
  { id:'free', name:'Free Athlete', price:'₹0', audience:'Athletes', ai:0, features:['Core athlete dashboard','Training and medals','Secure documents','Taekwondo Kyorugi and Poomsae support'] },
  { id:'student', name:'Student', price:'₹49/month · ₹459/year', audience:'Verified students', ai:50, features:['Student verification','50 AI coach messages','Resume PDF readiness','Priority roadmap voting'] },
  { id:'pro', name:'Athlete', price:'₹99/month · ₹899/year', audience:'Competitive athletes', ai:100, features:['100 AI coach messages','Advanced analytics','Goal tracking','Referral rewards'] },
  { id:'champion', name:'Individual Coach', price:'₹149/month · ₹1,499/year', audience:'Independent coaches', ai:500, features:['Coach dashboard','Athlete roster and management','Training assignments and feedback','Competition, belt and weight workflows'] },
  { id:'academy', name:'Academy', price:'₹550/month · ₹5,699/year', audience:'Clubs and academies', ai:2000, features:['Academy dashboard','2 coach seats included','Athlete and coach management','Academy-wide analytics and workflows','Additional coach seats: ₹349 activation + ₹100/month'] }
];

export default function PlansScreen() {
  const { profile, session, refreshProfile } = useAuth();
  const router = useRouter();
  const [usage,setUsage]=useState<any>(null);
  const [subscription,setSubscription]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [trialBusy,setTrialBusy]=useState(false);
  const [message,setMessage]=useState('');
  const trialUsed=Boolean((profile as any)?.trial_used);
  const current=(profile as any)?.plan_id || subscription?.plan_id || 'free';

  useEffect(()=>{(async()=>{if(!session){setLoading(false);return}
    const [u,s]=await Promise.all([
      supabase.from('subscription_usage').select('ai_requests_used,ai_requests_limit,usage_month').eq('user_id',session.user.id).order('usage_month',{ascending:false}).limit(1).maybeSingle(),
      supabase.from('subscriptions').select('plan_id,status,current_period_end,provider').eq('user_id',session.user.id).order('created_at',{ascending:false}).limit(1).maybeSingle()
    ]);
    setUsage(u.data||null); setSubscription(s.data||null); setLoading(false);
  })()},[session]);

  async function startTrial(planId:string){
    if(!session||planId==='free'||trialUsed)return;
    setTrialBusy(true); setMessage('');
    try{
      const {data,error}=await supabase.rpc('choose_account_plan',{p_plan_id:planId,p_start_trial:true});
      if(error)throw error;
      const result=Array.isArray(data)?data[0]:data;
      if(result?.error)throw new Error(result.error);
      await refreshProfile();
      setMessage('7-day trial started.');
      router.replace('/');
    }catch(e){setMessage(e instanceof Error?e.message:'Trial could not be started.')}
    finally{setTrialBusy(false)}
  }

  return <ScrollView style={s.screen} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
    <View><Text style={s.kicker}>ATHLETEN • PLANS</Text><Text style={s.title}>Your plan</Text><Text style={s.subtitle}>Simple plan overview matching the AthleteN web experience.</Text></View>
    <View style={s.current}><View style={{flex:1}}><Text style={s.currentKicker}>CURRENT PLAN</Text><Text style={s.currentName}>{plans.find(p=>p.id===current)?.name||'Free Athlete'}</Text><Text style={s.meta}>{subscription?.status||'active'}{subscription?.current_period_end?' • renews '+String(subscription.current_period_end).slice(0,10):''}</Text></View><Text style={s.currentBadge}>ACTIVE</Text></View>
    {loading?<View style={s.loading}><ActivityIndicator color={c.accent}/></View>:null}
    {usage?<View style={s.usage}><View><Text style={s.label}>AI COACH USAGE</Text><Text style={s.usageValue}>{usage.ai_requests_used} / {usage.ai_requests_limit}</Text></View><Text style={s.meta}>{String(usage.usage_month).slice(0,7)}</Text></View>:null}
    {plans.map(p=>{const active=p.id===current;return <View key={p.id} style={[s.plan,active&&s.planActive]}>
      <View style={s.planTop}><View><Text style={s.planName}>{p.name}</Text><Text style={s.audience}>{p.audience}</Text></View><Text style={s.price}>{p.price}</Text></View>
      <View style={s.aiPill}><Text style={s.aiText}>{p.ai?p.ai+' AI coach messages/month':'No AI Coach allowance'}</Text></View>
      {p.features.map(f=><View key={f} style={s.feature}><Text style={s.check}>✓</Text><Text style={s.featureText}>{f}</Text></View>)}
      <Pressable disabled={active||trialBusy||p.id==='free'||trialUsed} style={[s.planButton,active&&s.planButtonActive]} onPress={()=>void startTrial(p.id)}><Text style={[s.planButtonText,active&&s.planButtonTextActive]}>{active?'CURRENT PLAN':p.id==='free'?'FREE PLAN':trialUsed?'TRIAL USED':'START 7-DAY TRIAL'}</Text></Pressable>
    </View>})}
    {message?<Text style={s.message}>{message}</Text>:null}
    <View style={s.note}><Text style={s.noteTitle}>Billing</Text><Text style={s.meta}>Online checkout is not active yet. Paid trials use the existing AthleteN subscription record until server-side billing is enabled.</Text></View>
    <Pressable style={s.back} onPress={()=>router.back()}><Text style={s.backText}>GO BACK</Text></Pressable>
  </ScrollView>
}
const s=StyleSheet.create({
screen:{flex:1,backgroundColor:c.background},content:{padding:18,paddingBottom:50,gap:12},kicker:{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:1.5},title:{color:c.text,fontSize:28,fontWeight:'900'},subtitle:{color:c.muted,fontSize:12,lineHeight:18},current:{flexDirection:'row',alignItems:'center',backgroundColor:c.accentSoft,borderWidth:1,borderColor:c.accentDeep,borderRadius:18,padding:15},currentKicker:{color:c.accentBright,fontSize:8,fontWeight:'900',letterSpacing:1},currentName:{color:c.text,fontSize:18,fontWeight:'900',marginTop:3},currentBadge:{color:c.accentBright,fontSize:8,fontWeight:'900',borderWidth:1,borderColor:c.accent,paddingHorizontal:9,paddingVertical:6,borderRadius:999},meta:{color:c.muted,fontSize:11,lineHeight:17},loading:{alignItems:'center',padding:8},usage:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:15,padding:13},label:{color:c.textSecondary,fontSize:8,fontWeight:'900',letterSpacing:1},usageValue:{color:c.text,fontSize:18,fontWeight:'900',marginTop:3},plan:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:18,padding:15,gap:9},planActive:{borderColor:c.accent,backgroundColor:c.accentSoft},planTop:{flexDirection:'row',justifyContent:'space-between',gap:8},planName:{color:c.text,fontSize:17,fontWeight:'900'},audience:{color:c.muted,fontSize:10,marginTop:2},price:{color:c.accentBright,fontSize:11,fontWeight:'900',textAlign:'right'},aiPill:{alignSelf:'flex-start',backgroundColor:c.background,borderRadius:999,paddingHorizontal:9,paddingVertical:6},aiText:{color:c.textSecondary,fontSize:8,fontWeight:'800'},feature:{flexDirection:'row',gap:8,alignItems:'flex-start'},check:{color:c.success,fontSize:13,fontWeight:'900'},featureText:{color:c.textSecondary,fontSize:11,flex:1,lineHeight:16},planButton:{borderWidth:1,borderColor:c.border,borderRadius:11,padding:11,alignItems:'center',marginTop:2},planButtonActive:{borderColor:c.accent},planButtonText:{color:c.text,fontSize:9,fontWeight:'900',letterSpacing:1},planButtonTextActive:{color:c.accentBright},note:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:15,padding:14,gap:4},noteTitle:{color:c.text,fontSize:12,fontWeight:'900'},back:{borderWidth:1,borderColor:c.border,borderRadius:12,padding:13,alignItems:'center'},backText:{color:c.text,fontSize:9,fontWeight:'900',letterSpacing:1},message:{color:c.accentBright,fontSize:11,lineHeight:17}});
