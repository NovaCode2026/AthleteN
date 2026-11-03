import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { Icon } from '@/components/mobile-ui';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { AI_LIMITS, PLAN_NAMES, PlanId, getAiRemaining } from '@/lib/entitlements';

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
  { id: 'student', name: 'Student', monthly: 99, yearly: 999, saving: 189, ai: 50, audience: 'Verified students', features: ['AI Match Reports', 'AI Monthly Athlete Reports', 'AI training insights', 'AI performance summaries', 'Detailed progress analysis', 'Personal goals'] },
  { id: 'pro', name: 'Pro', monthly: 199, yearly: 1999, saving: 389, ai: 200, audience: 'Competitive athletes', features: ['AI Match Reports', 'AI Monthly Athlete Reports', 'Advanced performance analytics', 'Competition preparation insights', 'Advanced training analysis', 'Priority support'] },
  { id: 'elite', name: 'Elite', monthly: 399, yearly: 3999, saving: 789, ai: 500, audience: 'Advanced athletes', features: ['AI Match Reports', 'AI Monthly Athlete Reports', 'Advanced competition analysis', 'Long-term performance trends', 'Advanced training planning', 'Exportable athlete reports'] },
];

const productPlans = {
  coach: { name: 'Coach', monthly: 499, yearly: 4999, saving: 989, ai: 750, description: 'AI Match Reports, AI Monthly Coach Reports, a dedicated coaching workspace, athlete management and training monitoring.' },
  academy_admin: { name: 'Academy', monthly: 799, yearly: 7999, saving: 1589, ai: 1000, description: 'AI Match Reports, AI Monthly Academy Reports, athlete and coach management, attendance, analytics and operations.' },
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
  const [studentStatus, setStudentStatus] = useState('not_submitted');
  const role = String(profile?.role || 'athlete');

  const current = ((profile as any)?.plan_id || 'free') as PlanId;

  useEffect(() => {
    if (!session || role !== 'athlete') return;
    let alive = true;
    const refreshStatus = async () => {
      const { data } = await supabase.from('student_verifications').select('status')
        .eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (alive) setStudentStatus(String(data?.status || 'not_submitted'));
    };
    void refreshStatus();
    const channel = supabase.channel('mobile-plan-student-verification-' + session.user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_verifications', filter: 'user_id=eq.' + session.user.id }, () => { void refreshStatus(); })
      .subscribe();
    return () => { alive = false; void supabase.removeChannel(channel); };
  }, [session, role]);

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

  async function startCheckout(planId: string) {
    if (!session) { setMessage('Please sign in before subscribing.'); return; }
    if (planId === 'student' && studentStatus !== 'approved') {
      router.push('/verification');
      return;
    }
    const requiredRole = ['student','pro','elite'].includes(planId) ? 'athlete' : planId === 'coach' ? 'coach' : 'academy_admin';
    if (role !== requiredRole) { setMessage('This plan requires the matching verified account role.'); return; }
    setBusyPlan(planId);
    setMessage('');
    try {
      const baseUrl = (process.env.EXPO_PUBLIC_ATHLETEN_API_URL || 'https://athleten.netlify.app').replace(/\/$/, '');
      const response = await fetch(baseUrl + '/.netlify/functions/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({ planId })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Checkout could not be started.');
      if (payload.checkoutUrl) await Linking.openURL(payload.checkoutUrl);
      else if (payload.paymentSessionId) setMessage('Payment session created. Complete checkout in the supported Cashfree payment flow.');
      else throw new Error('The payment provider did not return a checkout link.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Checkout could not be started.');
    } finally { setBusyPlan(null); }
  }

  const used = usage?.ai_requests_used ?? 0;
  const remaining = getAiRemaining(current, used);
  const limit = AI_LIMITS[current] ?? 0;
  const activeProducts = new Set(subscriptions.map((s) => String(s.plan_id)));

  return <ScrollView style={s.screen} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
    <View>
      <Text style={s.kicker}>ATHLETEN • SUBSCRIPTION</Text>
      <Text style={s.title}>Choose your plan.</Text>
      <Text style={s.subtitle}>Transparent monthly and yearly pricing. Student purchase requires Admin approval; Coach and Academy purchase follows existing account verification.</Text>
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

    <View style={s.billingWrap}>
      {(['monthly','yearly'] as const).map((cycle) => <Pressable key={cycle} onPress={() => setBilling(cycle)} style={[s.billingOption, billing === cycle && s.billingOptionActive]}><Text style={[s.billingText, billing === cycle && s.billingTextActive]}>{cycle === 'monthly' ? 'MONTHLY' : 'YEARLY'}</Text>{cycle === 'yearly' ? <Text style={{color:c.success,fontSize:8,fontWeight:'900',marginTop:3}}>SAVE UP TO 16%</Text> : null}</Pressable>)}
    </View>

    <View style={s.note}><Text style={s.noteTitle}>Subscription activation</Text><Text style={s.meta}>Prices are displayed below. Select a paid plan to start the secure checkout flow. Student checkout is available only after Admin approval; Coach and Academy access uses the existing verified account role.</Text></View>

    {athletePlans.filter((p) => p.id === 'free' || role === 'athlete').map((p) => {
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
            <><Text style={s.price}>₹{displayedPrice.toLocaleString('en-IN')}</Text><Text style={s.period}>/{period}</Text></>
          </View>
        </View>
        {billing === 'yearly' && p.saving > 0 ? <Text style={s.saving}>Save ₹{p.saving.toLocaleString('en-IN')}/year</Text> : null}
        <View style={s.aiPill}><Text style={s.aiText}>{p.ai === 0 ? 'No AI requests included' : p.ai + ' AI requests every month'}</Text></View>
        {p.features.map((feature) => <View key={feature} style={s.feature}><Icon name="check" size={14} color={c.accentBright}/><Text style={s.featureText}>{feature}</Text></View>)}
        {p.id === 'student' ? <Text style={s.meta}>Student verification: {studentStatus === 'approved' ? 'Approved' : studentStatus === 'pending' ? 'Pending Admin approval' : studentStatus === 'rejected' ? 'Rejected · resubmit proof' : 'Not submitted'}</Text> : null}
        <Pressable disabled={active || !!busyPlan || p.id === 'free' || (p.id === 'student' && (studentStatus === 'pending' || studentStatus === 'approved'))} style={[s.planButton, active && s.planButtonActive, busy && s.planButtonBusy]} onPress={() => p.id === 'student' && studentStatus !== 'approved' ? router.push('/verification') : void startCheckout(p.id)}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={[s.planButtonText, active && s.planButtonTextActive]}>{active ? 'CURRENT PLAN' : p.id === 'free' ? 'FREE PLAN' : p.id === 'student' && studentStatus === 'pending' ? 'AWAITING APPROVAL' : p.id === 'student' && studentStatus !== 'approved' ? 'SUBMIT STUDENT PROOF' : p.id === 'student' && studentStatus === 'approved' ? 'APPROVED · PURCHASE COMING SOON' : 'PAID CHECKOUT COMING SOON'}</Text>}
        </Pressable>
        {p.id === 'free' ? <View style={s.note}>
          <Text style={s.noteTitle}>What Free is missing</Text>
          <Text style={s.meta}>AI Match Reports and AI Monthly Reports are paid features for Athletes, Coaches and Academies. Free accounts can see the features but cannot generate or save reports.</Text>
        </View> : null}
      </View>;
    })}

    <View style={s.productSection}>
      <Text style={s.sectionKicker}>PROFESSIONAL PRODUCTS</Text>
      <Text style={s.productTitle}>Coach & Academy</Text>
      <Text style={s.meta}>Coach and Academy pricing is listed below. Purchase requires the matching existing verified account role.</Text>
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
            disabled={true}
            style={[s.planButton, isCurrent && s.planButtonActive]}
            onPress={() => void startCheckout(productRole === 'coach' ? 'coach' : 'academy')}
          >
            <Text style={s.planButtonText}>{isCurrent && owned ? 'CURRENT PLAN' : role !== (productRole === 'coach' ? 'coach' : 'academy_admin') ? (productRole === 'coach' ? 'COACH VERIFICATION REQUIRED' : 'ACADEMY VERIFICATION REQUIRED') : 'PAID CHECKOUT COMING SOON'}</Text>
          </Pressable>
        </View>;
      })}
      {subscriptions.length > 1 ? <View style={s.subscriptionList}><Text style={s.sectionKicker}>ACTIVE SUBSCRIPTIONS</Text>{subscriptions.map((sub) => <Text key={sub.plan_id} style={s.subscriptionItem}>• {String(sub.plan_id).toUpperCase()} — {sub.status}{sub.current_period_end ? ' · renews ' + String(sub.current_period_end).slice(0,10) : ''}</Text>)}</View> : null}
    </View>

    {message ? <Text style={s.message}>{message}</Text> : null}

    <View style={s.note}>
      <Text style={s.noteTitle}>Plan changes & billing</Text>
      <Text style={s.meta}>Checkout remains protected by server-side role and verification checks. Payment alone does not bypass account verification.</Text>
      <Text style={s.noteTitle}>AI usage</Text>
      <Text style={s.meta}>AI request allowances are monthly plan limits. Actual access depends on the entitlements enabled for your account.</Text>
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
