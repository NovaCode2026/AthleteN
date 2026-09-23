import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { AI_LIMITS, PLAN_NAMES, PlanId, getAiRemaining } from '@/lib/entitlements';

const c = Colors.dark;

const plans: Array<{ id: PlanId; name: string; price: string; ai: number; audience: string; features: string[] }> = [
  { id: 'free', name: 'Free', price: '₹0/month', ai: 0, audience: 'Everyone', features: ['Athlete profile', 'Training log', 'Basic progress tracking', 'Tournament and medal history'] },
  { id: 'student', name: 'Student', price: '₹99/month', ai: 50, audience: 'Individual athletes', features: ['AI training insights', 'AI performance summaries', 'Detailed progress analysis', 'Personal goals'] },
  { id: 'pro', name: 'Pro', price: '₹199/month', ai: 200, audience: 'Competitive athletes', features: ['Advanced performance analytics', 'Competition preparation insights', 'Advanced training analysis', 'Priority support'] },
  { id: 'elite', name: 'Elite', price: '₹399/month', ai: 500, audience: 'Advanced athletes', features: ['Advanced competition analysis', 'Long-term performance trends', 'Advanced training planning', 'Exportable athlete reports'] },
  { id: 'coach', name: 'Coach', price: '₹599/month', ai: 750, audience: 'Coaches', features: ['Coach dashboard', 'Athlete management', 'Training monitoring', 'AI athlete summaries and reports'] },
  { id: 'academy', name: 'Academy', price: '₹1,499/month', ai: 2000, audience: 'Academies', features: ['Multiple coaches', 'Large athlete roster', 'Academy-wide analytics', 'Admin controls and reports'] },
];

export default function PlansScreen() {
  const { profile, session } = useAuth();
  const router = useRouter();
  const [usage, setUsage] = useState<{ ai_requests_used: number; ai_requests_limit: number } | null>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const current = ((profile as any)?.plan_id || subscription?.plan_id || 'free') as PlanId;

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!session) { if (alive) setLoading(false); return; }
      const [u, s] = await Promise.all([
        supabase.from('subscription_usage').select('ai_requests_used,ai_requests_limit').eq('user_id', session.user.id).order('usage_month', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('subscriptions').select('plan_id,status,current_period_end,provider').eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (!alive) return;
      setUsage(u.data || null);
      setSubscription(s.data || null);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [session]);

  async function handleUpgrade(planId: PlanId) {
    if (!session || planId === 'free' || planId === current) return;
    setBusyPlan(planId);
    setMessage('');
    try {
      const { data, error } = await supabase.rpc('can_start_paid_checkout', { p_user_id: session.user.id, p_plan_id: planId });
      if (error) throw error;
      if (!data) {
        throw new Error(
          planId === 'student' ? 'Student requires an approved student verification.' :
          planId === 'coach' ? 'Coach access requires a Coach account.' :
          planId === 'academy' ? 'Academy access requires an Academy administrator account.' :
          'This plan is not available for the current account.'
        );
      }
      setMessage('Payment checkout is not connected yet. No subscription was changed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Upgrade could not be started.');
    } finally {
      setBusyPlan(null);
    }
  }

  const used = usage?.ai_requests_used ?? 0;
  const remaining = getAiRemaining(current, used);
  const limit = AI_LIMITS[current] ?? 0;

  return <ScrollView style={s.screen} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
    <View>
      <Text style={s.kicker}>ATHLETEN • SUBSCRIPTION</Text>
      <Text style={s.title}>Choose your plan.</Text>
      <Text style={s.subtitle}>Simple pricing, clear AI allowances, and role-specific access.</Text>
    </View>
    <View style={s.current}>
      <View style={{ flex: 1 }}>
        <Text style={s.currentKicker}>CURRENT PLAN</Text>
        <Text style={s.currentName}>{PLAN_NAMES[current] || 'Free'}</Text>
        <Text style={s.meta}>{subscription?.status || 'active'}{subscription?.current_period_end ? ' • renews ' + String(subscription.current_period_end).slice(0, 10) : ''}</Text>
      </View>
      <Text style={s.currentBadge}>ACTIVE</Text>
    </View>
    <View style={s.usage}>
      <View><Text style={s.label}>AI REQUESTS</Text><Text style={s.usageValue}>{loading ? '…' : remaining + ' / ' + limit + ' remaining'}</Text></View>
      <Text style={s.meta}>Monthly</Text>
    </View>
    {loading ? <View style={s.loading}><ActivityIndicator color={c.accent} /></View> : null}
    {plans.map((p) => {
      const active = p.id === current;
      const busy = busyPlan === p.id;
      return <View key={p.id} style={[s.plan, active && s.planActive]}>
        <View style={s.planTop}>
          <View style={{ flex: 1 }}><Text style={s.planName}>{p.name}</Text><Text style={s.audience}>{p.audience}</Text></View>
          <Text style={s.price}>{p.price}</Text>
        </View>
        <View style={s.aiPill}><Text style={s.aiText}>{p.ai === 0 ? 'No AI requests' : p.ai + ' AI requests/month'}</Text></View>
        {p.features.map((feature) => <View key={feature} style={s.feature}><Text style={s.check}>✓</Text><Text style={s.featureText}>{feature}</Text></View>)}
        <Pressable disabled={active || !!busyPlan || p.id === 'free'} style={[s.planButton, active && s.planButtonActive, busy && s.planButtonBusy]} onPress={() => void handleUpgrade(p.id)}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={[s.planButtonText, active && s.planButtonTextActive]}>{active ? 'CURRENT PLAN' : p.id === 'free' ? 'FREE PLAN' : 'UPGRADE'}</Text>}
        </Pressable>
      </View>;
    })}
    {message ? <Text style={s.message}>{message}</Text> : null}
    <View style={s.note}>
      <Text style={s.noteTitle}>AI usage</Text>
      <Text style={s.meta}>An AI request is one user-facing AI operation. Token usage and API cost remain backend metrics. The allowance is enforced server-side and resets by the backend usage period.</Text>
    </View>
    <Pressable style={s.back} onPress={() => router.back()}><Text style={s.backText}>GO BACK</Text></Pressable>
  </ScrollView>;
}

const s = StyleSheet.create({
  screen:{flex:1,backgroundColor:c.background},content:{padding:18,paddingBottom:50,gap:12},kicker:{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:1.5},title:{color:c.text,fontSize:28,fontWeight:'900',marginTop:4},subtitle:{color:c.muted,fontSize:12,lineHeight:18},current:{flexDirection:'row',alignItems:'center',backgroundColor:c.accentSoft,borderWidth:1,borderColor:c.accentDeep,borderRadius:18,padding:15},currentKicker:{color:c.accentBright,fontSize:8,fontWeight:'900',letterSpacing:1},currentName:{color:c.text,fontSize:18,fontWeight:'900',marginTop:3},currentBadge:{color:c.accentBright,fontSize:8,fontWeight:'900',borderWidth:1,borderColor:c.accent,paddingHorizontal:9,paddingVertical:6,borderRadius:999},meta:{color:c.muted,fontSize:11,lineHeight:17},loading:{alignItems:'center',padding:8},usage:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:15,padding:13},label:{color:c.textSecondary,fontSize:8,fontWeight:'900',letterSpacing:1},usageValue:{color:c.text,fontSize:18,fontWeight:'900',marginTop:3},plan:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:18,padding:15,gap:9},planActive:{borderColor:c.accent,backgroundColor:c.accentSoft},planTop:{flexDirection:'row',justifyContent:'space-between',gap:8},planName:{color:c.text,fontSize:17,fontWeight:'900'},audience:{color:c.muted,fontSize:10,marginTop:2},price:{color:c.accentBright,fontSize:12,fontWeight:'900',textAlign:'right'},aiPill:{alignSelf:'flex-start',backgroundColor:c.background,borderRadius:999,paddingHorizontal:9,paddingVertical:6},aiText:{color:c.textSecondary,fontSize:8,fontWeight:'800'},feature:{flexDirection:'row',gap:8,alignItems:'flex-start'},check:{color:c.success,fontSize:13,fontWeight:'900'},featureText:{color:c.textSecondary,fontSize:11,flex:1,lineHeight:16},planButton:{borderWidth:1,borderColor:c.border,borderRadius:11,padding:11,alignItems:'center',marginTop:2},planButtonActive:{borderColor:c.accent},planButtonBusy:{backgroundColor:c.accent},planButtonText:{color:c.text,fontSize:9,fontWeight:'900',letterSpacing:1},planButtonTextActive:{color:c.accentBright},note:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:15,padding:14,gap:4},noteTitle:{color:c.text,fontSize:12,fontWeight:'900'},back:{borderWidth:1,borderColor:c.border,borderRadius:12,padding:13,alignItems:'center'},backText:{color:c.text,fontSize:9,fontWeight:'900',letterSpacing:1},message:{color:c.accentBright,fontSize:11,lineHeight:17},
});
