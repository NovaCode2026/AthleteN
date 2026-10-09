import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { Icon } from '@/components/mobile-ui';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { AI_LIMITS, PLAN_NAMES, PLAN_PRICING, PlanId, getAiRemaining } from '@/lib/entitlements';

const c = Colors.dark;

type BillingCycle = 'monthly' | 'yearly';

const athletePlans: Array<{
  id: PlanId;
  name: string;
  monthly: number;
  yearly: number;
  saving: number;
  ai: number;
  audience: string;
  features: string[];
}> = [
  { id: 'free', name: 'Free', monthly: 0, yearly: 0, saving: 0, ai: 0, audience: 'Everyone', features: ['Athlete profile', 'Training log', 'Basic progress tracking', 'Tournament and medal history'] },
  { id: 'student', name: 'Student', monthly: 99, yearly: 999, saving: 189, ai: 50, audience: 'Verified students', features: ['AI training insights', 'AI performance summaries', 'Detailed progress analysis', 'Personal goals'] },
  { id: 'pro', name: 'Pro', monthly: 199, yearly: 1999, saving: 389, ai: 200, audience: 'Competitive athletes', features: ['Advanced performance analytics', 'Competition preparation insights', 'Advanced training analysis', 'Priority support'] },
  { id: 'elite', name: 'Elite', monthly: 399, yearly: 3999, saving: 789, ai: 500, audience: 'Advanced athletes', features: ['Advanced competition analysis', 'Long-term performance trends', 'Advanced training planning', 'Exportable athlete reports'] },
];

const productPlans = {
  coach: { name: 'Coach', monthly: 499, yearly: 4999, saving: 989, ai: 750, description: 'A dedicated coaching workspace with athlete management, training monitoring and coach reports.' },
  academy_admin: { name: 'Academy', monthly: 799, yearly: 7999, saving: 1589, ai: 1000, description: 'A dedicated academy workspace for athletes, coaches, attendance, analytics and operations.' },
} as const;

export default function PlansScreen() {
  const { profile, session } = useAuth();
  const router = useRouter();
  const [billing, setBilling] = useState<BillingCycle>('yearly');
  const [usage, setUsage] = useState<{ ai_requests_used: number; ai_requests_limit: number } | null>(null);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const role = String(profile?.role || 'athlete');

  const current = ((profile as any)?.plan_id || 'free') as PlanId;

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!session) { if (alive) setLoading(false); return; }
      const [u, s] = await Promise.all([
        supabase.from('subscription_usage').select('ai_requests_used,ai_requests_limit').eq('user_id', session.user.id).order('usage_month', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('subscriptions').select('plan_id,status,current_period_end,provider,billing_cycle').eq('user_id', session.user.id).in('status', ['active','trialing','past_due']).order('created_at', { ascending: false }),
      ]);
      if (!alive) return;
      setUsage(u.data || null);
      setSubscriptions(s.data || []);
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
      setMessage('Checkout is ready for the selected product, but the payment provider must be configured on the server before a real charge can be created. No subscription was changed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Upgrade could not be started.');
    } finally {
      setBusyPlan(null);
    }
  }

  const used = usage?.ai_requests_used ?? 0;
  const remaining = getAiRemaining(current, used);
  const limit = AI_LIMITS[current] ?? 0;
  const activeProducts = new Set(subscriptions.map((s) => String(s.plan_id)));

  return <ScrollView style={s.screen} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
    <View>
      <Text style={s.kicker}>ATHLETEN • SUBSCRIPTION</Text>
      <Text style={s.title}>Choose your plan.</Text>
      <Text style={s.subtitle}>Yearly is selected by default. Monthly stays available, and AI allowances reset every month.</Text>
    </View>

    <View style={s.billingWrap}>
      <Pressable style={[s.billingOption, billing === 'monthly' && s.billingOptionActive]} onPress={() => setBilling('monthly')}>
        <Text style={[s.billingText, billing === 'monthly' && s.billingTextActive]}>Monthly</Text>
      </Pressable>
      <Pressable style={[s.billingOption, billing === 'yearly' && s.billingOptionActive]} onPress={() => setBilling('yearly')}>
        <Text style={[s.billingText, billing === 'yearly' && s.billingTextActive]}>Yearly</Text>
        <View style={s.recommended}><Text style={s.recommendedText}>RECOMMENDED</Text></View>
      </Pressable>
    </View>

    <View style={s.current}>
      <View style={{ flex: 1 }}>
        <Text style={s.currentKicker}>CURRENT PLAN</Text>
        <Text style={s.currentName}>{PLAN_NAMES[current] || 'Free'}</Text>
        <Text style={s.meta}>{subscriptions.length ? subscriptions.map((s) => `${s.plan_id} • ${s.status}`).join('  ·  ') : 'free'}</Text>
      </View>
      <Text style={s.currentBadge}>ACTIVE</Text>
    </View>

    <View style={s.usage}>
      <View><Text style={s.label}>AI REQUESTS</Text><Text style={s.usageValue}>{loading ? '…' : remaining + ' / ' + limit + ' remaining'}</Text></View>
      <Text style={s.meta}>Every month</Text>
    </View>

    {loading ? <View style={s.loading}><ActivityIndicator color={c.accent} /></View> : null}

    {athletePlans.map((p) => {
      const active = p.id === current && role === 'athlete';
      const busy = busyPlan === p.id;
      const displayedPrice = billing === 'yearly' ? p.yearly : p.monthly;
      const period = billing === 'yearly' ? 'year' : 'month';
      return <View key={p.id} style={[s.plan, active && s.planActive]}>
        <View style={s.planTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.planName}>{p.name}</Text>
            <Text style={s.audience}>{p.audience}</Text>
          </View>
          <View style={s.priceBox}>
            <Text style={s.price}>₹{displayedPrice.toLocaleString('en-IN')}</Text>
            <Text style={s.period}>/{period}</Text>
          </View>
        </View>
        {billing === 'yearly' && p.saving > 0 ? <Text style={s.saving}>Save ₹{p.saving.toLocaleString('en-IN')}/year</Text> : null}
        <View style={s.aiPill}><Text style={s.aiText}>{p.ai === 0 ? 'No AI requests' : p.ai + ' AI requests every month'}</Text></View>
        {p.features.map((feature) => <View key={feature} style={s.feature}><Icon name="check" size={14} color={c.accentBright}/><Text style={s.featureText}>{feature}</Text></View>)}
        <Pressable disabled={active || !!busyPlan || p.id === 'free'} style={[s.planButton, active && s.planButtonActive, busy && s.planButtonBusy]} onPress={() => void handleUpgrade(p.id)}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={[s.planButtonText, active && s.planButtonTextActive]}>{active ? 'CURRENT PLAN' : p.id === 'free' ? 'FREE PLAN' : 'CHANGE PLAN'}</Text>}
        </Pressable>
      </View>;
    })}

    <View style={s.productSection}>
      <Text style={s.sectionKicker}>PROFESSIONAL PRODUCTS</Text>
      <Text style={s.productTitle}>Coach & Academy are separate subscriptions.</Text>
      <Text style={s.meta}>You can own both. Buying one never replaces the other. Workspace switching only changes which product is active in the app.</Text>
      {(['coach','academy_admin'] as const).map((productRole) => {
        const p = productPlans[productRole];
        const owned = activeProducts.has(productRole === 'coach' ? 'coach' : 'academy');
        const isCurrent = role === productRole;
        return <View key={productRole} style={[s.productCard, owned && s.productActive]}>
          <View style={s.productTop}>
            <View style={{flex:1}}>
              <Text style={s.planName}>{p.name}</Text>
              <Text style={s.audience}>{isCurrent ? 'Current workspace' : owned ? 'Active subscription' : 'Separate product'}</Text>
            </View>
            <Text style={s.price}>₹{(billing === 'yearly' ? p.yearly : p.monthly).toLocaleString('en-IN')}<Text style={s.period}>/{billing === 'yearly' ? 'year' : 'month'}</Text></Text>
          </View>
          <Text style={s.meta}>{p.description}</Text>
          {billing === 'yearly' ? <Text style={s.saving}>Save ₹{p.saving.toLocaleString('en-IN')}/year</Text> : null}
          <Pressable
            disabled={!!busyPlan}
            style={[s.planButton, isCurrent && s.planButtonActive]}
            onPress={async () => {
              if (!session) return;
              if (isCurrent) { await handleUpgrade(productRole === 'coach' ? 'coach' as PlanId : 'academy' as PlanId); return; }
              setBusyPlan(productRole);
              setMessage('');
              const { error } = await supabase.rpc('switch_my_product_role', { p_target_role: productRole });
              setBusyPlan(null);
              if (error) { setMessage(error.message === 'COACH_HAS_ACTIVE_ATHLETES' ? 'Transfer or end your active athletes before leaving the Coach workspace.' : error.message === 'ACADEMY_HAS_ACTIVE_MEMBERS' ? 'Transfer academy responsibility before leaving the Academy workspace.' : error.message); return; }
              setMessage(productRole === 'coach' ? 'Coach workspace created. Buy the Coach subscription to unlock Coach features.' : 'Academy workspace created. Buy the Academy subscription to unlock Academy features.');
            }}
          >
            <Text style={s.planButtonText}>{owned ? (isCurrent ? 'MANAGE COACH' : 'OPEN WORKSPACE') : productRole === 'coach' ? 'BECOME A COACH' : 'CREATE AN ACADEMY'}</Text>
          </Pressable>
        </View>;
      })}
      {subscriptions.length > 1 ? <View style={s.subscriptionList}><Text style={s.sectionKicker}>ACTIVE SUBSCRIPTIONS</Text>{subscriptions.map((sub) => <Text key={sub.plan_id} style={s.subscriptionItem}>• {String(sub.plan_id).toUpperCase()} — {sub.status}{sub.current_period_end ? ' · renews ' + String(sub.current_period_end).slice(0,10) : ''}</Text>)}</View> : null}
    </View>

    {message ? <Text style={s.message}>{message}</Text> : null}

    <View style={s.note}>
      <Text style={s.noteTitle}>Plan changes & billing</Text>
      <Text style={s.meta}>Paid plan changes are completed only after successful payment. The dashboard Plan section always shows the current server subscription and opens this screen to manage or change it.</Text>
      <Text style={s.noteTitle}>AI usage</Text>
      <Text style={s.meta}>AI requests are monthly allowances. A yearly subscription does not receive the full year's requests upfront. For example, Student yearly still provides 50 AI requests each month. Token usage and API cost remain backend metrics, and the allowance is enforced server-side.</Text>
    </View>

    <Pressable style={s.back} onPress={() => router.back()}><Text style={s.backText}>GO BACK</Text></Pressable>
  </ScrollView>;
}

const s = StyleSheet.create({
  screen:{flex:1,backgroundColor:c.background},
  content:{padding:18,paddingBottom:50,gap:12},
  kicker:{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:1.5},
  title:{color:c.text,fontSize:28,fontWeight:'900',marginTop:4},
  subtitle:{color:c.muted,fontSize:12,lineHeight:18},
  billingWrap:{flexDirection:'row',backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:14,padding:4,gap:4},
  billingOption:{flex:1,minHeight:48,borderRadius:10,paddingHorizontal:8,alignItems:'center',justifyContent:'center',position:'relative'},
  billingOptionActive:{backgroundColor:c.accentSoft,borderWidth:1,borderColor:c.accent},
  billingText:{color:c.muted,fontSize:11,fontWeight:'900'},
  billingTextActive:{color:c.text},
  recommended:{position:'absolute',right:5,top:4,borderRadius:999,paddingHorizontal:5,paddingVertical:2,backgroundColor:c.accent},
  recommendedText:{color:c.background,fontSize:6,fontWeight:'900',letterSpacing:.5},
  current:{flexDirection:'row',alignItems:'center',backgroundColor:c.accentSoft,borderWidth:1,borderColor:c.accentDeep,borderRadius:18,padding:15},
  currentKicker:{color:c.accentBright,fontSize:8,fontWeight:'900',letterSpacing:1},
  currentName:{color:c.text,fontSize:18,fontWeight:'900',marginTop:3},
  currentBadge:{color:c.accentBright,fontSize:8,fontWeight:'900',borderWidth:1,borderColor:c.accent,paddingHorizontal:9,paddingVertical:6,borderRadius:999},
  meta:{color:c.muted,fontSize:11,lineHeight:17},
  loading:{alignItems:'center',padding:8},
  usage:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:15,padding:13},
  label:{color:c.textSecondary,fontSize:8,fontWeight:'900',letterSpacing:1},
  usageValue:{color:c.text,fontSize:18,fontWeight:'900',marginTop:3},
  plan:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:18,padding:15,gap:9},
  planActive:{borderColor:c.accent,backgroundColor:c.accentSoft},
  planTop:{flexDirection:'row',justifyContent:'space-between',gap:8},
  planName:{color:c.text,fontSize:17,fontWeight:'900'},
  audience:{color:c.muted,fontSize:10,marginTop:2},
  priceBox:{alignItems:'flex-end'},
  price:{color:c.accentBright,fontSize:15,fontWeight:'900',textAlign:'right'},
  period:{color:c.muted,fontSize:9,marginTop:1},
  saving:{color:c.success,fontSize:10,fontWeight:'900'},
  aiPill:{alignSelf:'flex-start',backgroundColor:c.background,borderRadius:999,paddingHorizontal:9,paddingVertical:6},
  aiText:{color:c.textSecondary,fontSize:8,fontWeight:'800'},
  feature:{flexDirection:'row',gap:8,alignItems:'flex-start'},
  check:{color:c.success,fontSize:13,fontWeight:'900'},
  featureText:{color:c.textSecondary,fontSize:11,flex:1,lineHeight:16},
  planButton:{borderWidth:1,borderColor:c.border,borderRadius:11,padding:11,alignItems:'center',marginTop:2},
  planButtonActive:{borderColor:c.accent},
  planButtonBusy:{backgroundColor:c.accent},
  planButtonText:{color:c.text,fontSize:9,fontWeight:'900',letterSpacing:1},
  planButtonTextActive:{color:c.accentBright},
  productSection:{gap:10,marginTop:4},sectionKicker:{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:1.4},productTitle:{color:c.text,fontSize:18,fontWeight:'900'},productCard:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:18,padding:15,gap:9},productActive:{borderColor:c.accent},productTop:{flexDirection:'row',justifyContent:'space-between',gap:8},subscriptionList:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:15,padding:14,gap:5},subscriptionItem:{color:c.textSecondary,fontSize:10,fontWeight:'800'},note:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:15,padding:14,gap:4},
  noteTitle:{color:c.text,fontSize:12,fontWeight:'900'},
  back:{borderWidth:1,borderColor:c.border,borderRadius:12,padding:13,alignItems:'center'},
  backText:{color:c.text,fontSize:9,fontWeight:'900',letterSpacing:1},
  message:{color:c.accentBright,fontSize:11,lineHeight:17},
});
