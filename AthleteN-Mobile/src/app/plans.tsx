import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { Icon } from '@/components/mobile-ui';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { AI_LIMITS, PLAN_NAMES, PLAN_PRICING, PlanId, getAiRemaining } from '@/lib/entitlements';

const c = Colors.dark;
const PAID_CHECKOUT_ENABLED = false;

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
  legacy?: boolean;
}> = [
  { id:'free',name:'Free',monthly:PLAN_PRICING.free.monthly,yearly:PLAN_PRICING.free.yearly,saving:0,ai:AI_LIMITS.free,audience:'For every athlete starting their record',features:['Athlete profile and sporting identity','Core training logs and competition history','Medal records, goals and milestones','Calendar and Athlete Journey','Join a verified academy'] },
  { id:'student',name:'Student · Legacy',monthly:PLAN_PRICING.student.monthly,yearly:PLAN_PRICING.student.yearly,saving:PLAN_PRICING.student.yearlySaving,ai:AI_LIMITS.student,audience:'Existing approved Student subscribers only · no new purchases',legacy:true,features:['Existing approved Student entitlement is preserved','50 AI Coach requests per month','Existing subscriptions are not repriced','No new Student subscriptions are sold'] },
  { id:'pro',name:'Pro',monthly:PLAN_PRICING.pro.monthly,yearly:PLAN_PRICING.pro.yearly,saving:PLAN_PRICING.pro.yearlySaving,ai:AI_LIMITS.pro,audience:'Athletes building consistent progress',features:['Everything in Free','50 AI Coach requests per month','Advanced analytics and training insights','Performance reports','Competition analysis'] },
  { id:'elite',name:'Elite',monthly:PLAN_PRICING.elite.monthly,yearly:PLAN_PRICING.elite.yearly,saving:PLAN_PRICING.elite.yearlySaving,ai:AI_LIMITS.elite,audience:'Competitive athletes',features:['Everything in Pro','200 AI Coach requests per month','Advanced competition analytics','Historical performance trends','Exportable reports','Priority support'] },
];

const productPlans = {
  coach: { name:'Coach',monthly:PLAN_PRICING.coach.monthly,yearly:PLAN_PRICING.coach.yearly,saving:PLAN_PRICING.coach.yearlySaving,ai:AI_LIMITS.coach,description:'A workspace for verified coaches managing athlete development.',features:['Dedicated Coach workspace','Athlete roster and progress monitoring','Training-plan and attendance management','Coach reports and feedback','750 AI Coach requests per month'] },
  academy_admin: { name:'Academy',monthly:PLAN_PRICING.academy.monthly,yearly:PLAN_PRICING.academy.yearly,saving:PLAN_PRICING.academy.yearlySaving,ai:AI_LIMITS.academy,description:'A workspace for verified Academy administrators managing a club or academy.',features:['Dedicated Academy workspace','Athlete and Coach management','Two included Coach seats','Attendance and academy analytics','Competition and operational reports','1,000 shared AI Coach requests per month'] },
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
        supabase.from('subscriptions').select('plan_id,status,current_period_end,provider').eq('user_id', session.user.id).in('status', ['active','trialing','past_due']).order('created_at', { ascending: false }),
      ]);
      if (!alive) return;
      setUsage(u.data || null);
      setSubscriptions(s.data || []);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [session]);

  async function startCheckout(planId: string) {
    if (!PAID_CHECKOUT_ENABLED) { setMessage('Paid checkout and the seven-day no-charge trial are not enabled yet. The Free plan remains available.'); return; }
    if (planId === 'student') { setMessage('Student is a legacy plan and is not available for new purchases.'); return; }
    if (!session) { setMessage('Please sign in before subscribing.'); return; }
    const requiredRole = ['pro','elite'].includes(planId) ? 'athlete' : planId === 'coach' ? 'coach' : 'academy_admin';
    if (role !== requiredRole) {
      setMessage(planId === 'coach'
        ? 'Coach plan requires an existing verified Coach account. Ask AthleteN Admin to verify or assign your Coach account.'
        : planId === 'academy'
          ? 'Academy plan requires an existing verified Academy Admin account.'
          : 'This plan is available only to Athlete accounts.');
      return;
    }
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { setMessage('Your sign-in could not be verified. Please sign in again.'); return; }
    if ((planId === 'coach' || planId === 'academy') && !authData.user.email_confirmed_at) {
      setMessage('Verify your AthleteN account email before continuing.');
      return;
    }
    if (planId === 'academy') {
      let academyQuery = supabase.from('academies')
        .select('id,status,setup_completed,contact_email_verified_at')
        .eq('owner_user_id', session.user.id)
        .eq('status', 'active')
        .eq('setup_completed', true)
        .not('contact_email_verified_at', 'is', null);
      if ((profile as any)?.academy_id) academyQuery = academyQuery.eq('id', String((profile as any).academy_id));
      const { data: academy, error: academyError } = await academyQuery.limit(1).maybeSingle();
      if (academyError) { setMessage('Academy verification could not be checked. Please try again.'); return; }
      if (!academy) {
        setMessage('Complete the existing Academy setup and contact-email verification first.');
        router.push('/academy-setup');
        return;
      }
    }
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
      <Text style={s.subtitle}>Budget-friendly pricing for athletes, coaches and academies. Displayed prices include applicable GST; no additional GST is added on top. Existing Student subscriptions remain supported as a legacy plan. Paid checkout and the new no-charge trial are not active yet.</Text>
    </View>

    <View style={s.current}>
      <View style={{ flex: 1 }}>
        <Text style={s.currentKicker}>CURRENT PLAN</Text>
        <Text style={s.currentName}>{PLAN_NAMES[current] || 'Free'}</Text>
        <Text style={s.meta}>{subscriptions.length ? subscriptions.map((s) => `${s.plan_id} • ${s.status}`).join('  ·  ') : 'free'}</Text>
      </View>
      <Text style={s.currentBadge}>ACTIVE</Text>
    </View>

    {current === 'student' ? <View style={s.note}><Text style={s.noteTitle}>STUDENT PLAN · LEGACY</Text><Text style={s.meta}>Your existing Student entitlement is preserved. The legacy catalogue reference is ₹{PLAN_PRICING.student.monthly}/month or ₹{PLAN_PRICING.student.yearly.toLocaleString('en-IN')}/year; existing subscription terms remain unchanged. Student is not available for new purchases.</Text></View> : null}

    <View style={s.usage}>
      <View><Text style={s.label}>AI REQUESTS</Text><Text style={s.usageValue}>{loading ? '…' : remaining + ' / ' + limit + ' remaining'}</Text></View>
      <Text style={s.meta}>Every month</Text>
    </View>

    {loading ? <View style={s.loading}><ActivityIndicator color={c.accent} /></View> : null}

    <View style={s.billingWrap}>
      {(['monthly','yearly'] as const).map((cycle) => <Pressable key={cycle} onPress={() => setBilling(cycle)} style={[s.billingOption, billing === cycle && s.billingOptionActive]}><Text style={[s.billingText, billing === cycle && s.billingTextActive]}>{cycle === 'monthly' ? 'MONTHLY' : 'YEARLY'}</Text>{cycle === 'yearly' ? <Text style={{color:c.success,fontSize:8,fontWeight:'900',marginTop:3}}>SAVE UP TO 16%</Text> : null}</Pressable>)}
    </View>

    <View style={s.note}><Text style={s.noteTitle}>Launch status</Text><Text style={s.meta}>Paid checkout is disabled while monthly/yearly billing, recurring provider subscriptions, webhook reconciliation, refunds and financial controls are verified. The planned seven-day no-charge trial is not active; the old ₹9 trial endpoint remains server-gated.</Text></View>

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
            <><Text style={s.price}>₹{displayedPrice.toLocaleString('en-IN')}</Text><Text style={s.period}>/{period}</Text><Text style={s.priceAlt}>₹{p.monthly.toLocaleString('en-IN')}/month · ₹{p.yearly.toLocaleString('en-IN')}/year</Text></>
          </View>
        </View>
        {billing === 'yearly' && p.saving > 0 ? <Text style={s.saving}>Save ₹{p.saving.toLocaleString('en-IN')}/year</Text> : null}
        <View style={s.aiPill}><Text style={s.aiText}>{p.ai === 0 ? 'No AI requests included' : p.ai + ' AI requests every month'}</Text></View>
        {p.features.map((feature) => <View key={feature} style={s.feature}><Icon name="check" size={14} color={c.accentBright}/><Text style={s.featureText}>{feature}</Text></View>)}
        <Pressable disabled={active || !!busyPlan || p.id === 'free' || !!p.legacy || !PAID_CHECKOUT_ENABLED} style={[s.planButton, active && s.planButtonActive, busy && s.planButtonBusy]} onPress={() => void startCheckout(p.id)}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={[s.planButtonText, active && s.planButtonTextActive]}>{active ? (p.legacy ? 'CURRENT LEGACY PLAN' : 'CURRENT PLAN') : p.id === 'free' ? 'FREE PLAN' : p.legacy ? 'LEGACY · NO NEW SALES' : !PAID_CHECKOUT_ENABLED ? 'PAID LAUNCH PENDING' : 'CONTINUE TO CHECKOUT'}</Text>}
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
            <View style={{alignItems:'flex-end'}}>
              <Text style={s.price}>₹{(billing === 'yearly' ? p.yearly : p.monthly).toLocaleString('en-IN')}<Text style={s.period}>/{billing === 'yearly' ? 'year' : 'month'}</Text></Text>
              <Text style={s.priceAlt}>₹{p.monthly.toLocaleString('en-IN')}/month · ₹{p.yearly.toLocaleString('en-IN')}/year</Text>
            </View>
          </View>
          <Text style={s.meta}>{p.description}</Text>
          {billing === 'yearly' ? <Text style={s.saving}>Save ₹{p.saving.toLocaleString('en-IN')}/year</Text> : null}
          <View style={s.aiPill}><Text style={s.aiText}>{p.ai.toLocaleString('en-IN')} AI Coach requests per month</Text></View>
          {p.features.map((feature)=><View key={feature} style={s.feature}><Icon name="check" size={14} color={c.accentBright}/><Text style={s.featureText}>{feature}</Text></View>)}
          <Pressable
            disabled={!!busyPlan || (isCurrent && owned) || !PAID_CHECKOUT_ENABLED}
            style={[s.planButton, isCurrent && owned && s.planButtonActive, busyPlan ? s.planButtonBusy : null]}
            onPress={() => void startCheckout(productRole === 'coach' ? 'coach' : 'academy')}
          >
            <Text style={s.planButtonText}>{busyPlan === (productRole === 'coach' ? 'coach' : 'academy') ? 'VERIFYING…' : isCurrent && owned ? 'CURRENT PLAN' : !PAID_CHECKOUT_ENABLED ? 'PAID LAUNCH PENDING' : productRole === 'coach' ? 'VERIFY COACH & CONTINUE' : 'VERIFY ACADEMY & CONTINUE'}</Text>
          </Pressable>
        </View>;
      })}
      {subscriptions.length > 1 ? <View style={s.subscriptionList}><Text style={s.sectionKicker}>ACTIVE SUBSCRIPTIONS</Text>{subscriptions.map((sub) => <Text key={sub.plan_id} style={s.subscriptionItem}>• {String(sub.plan_id).toUpperCase()} — {sub.status}{sub.current_period_end ? ' · renews ' + String(sub.current_period_end).slice(0,10) : ''}</Text>)}</View> : null}
    </View>

    <View style={s.accountGuide}>
      <Text style={s.sectionKicker}>ACCOUNT TYPES & CLOSURE</Text>
      <Text style={s.productTitle}>How Coach and Academy accounts work</Text>
      <Text style={s.guideHeading}>Coach account</Text>
      <Text style={s.meta}>Create a normal AthleteN login first, then open a private Support Center ticket to request a Coach role review. AthleteN Admin must verify and assign the Coach role. After assignment, confirm the account email; the Coach plan can then be selected when paid checkout is enabled.</Text>
      <Text style={s.guideHeading}>Academy account</Text>
      <Text style={s.meta}>Create a normal login and request an Academy Admin role through Support Center. After the role is assigned, complete Academy Setup with the academy name, city, state, country, contact email and phone. Verify the contact email and finish setup before Academy plan access is enabled.</Text>
      <Pressable style={s.guideButton} onPress={()=>router.push('/support')}><Text style={s.guideButtonText}>REQUEST A COACH / ACADEMY ROLE REVIEW</Text></Pressable>
      <Text style={s.guideHeading}>Close or delete an account</Text>
      <Text style={s.meta}>Account closure is a verified request, not an instant delete button. The account holder should use the registered email and request account closure, personal-data deletion, or both. For Coach and Academy workspaces, ask Support to plan the transfer or closure of active athlete links and academy memberships first. Some records may need lawful retention.</Text>
      <Pressable style={s.guideButtonSecondary} onPress={()=>void Linking.openURL('https://athleten.netlify.app/data-deletion.html').catch(()=>setMessage('Could not open the account deletion instructions. Open https://athleten.netlify.app/data-deletion.html in your browser.'))}><Text style={s.guideButtonText}>VIEW ACCOUNT DELETION INSTRUCTIONS</Text></Pressable>
      <Text style={s.meta}>The deletion page gives the request email, subject line and identity-verification steps. Never send your password, government ID number or payment-card details by email.</Text>
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
  priceAlt:{color:c.muted,fontSize:8,fontWeight:'800',textAlign:'right',marginTop:3},
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
  productSection:{gap:10,marginTop:4},accountGuide:{gap:10,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:18,padding:15},guideHeading:{color:c.text,fontSize:12,fontWeight:'900',marginTop:3},guideButton:{backgroundColor:c.accent,borderRadius:11,padding:12,alignItems:'center'},guideButtonSecondary:{borderWidth:1,borderColor:c.borderStrong,borderRadius:11,padding:12,alignItems:'center'},guideButtonText:{color:'#fff',fontSize:9,fontWeight:'900',letterSpacing:.7,textAlign:'center'},sectionKicker:{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:1.4},productTitle:{color:c.text,fontSize:18,fontWeight:'900'},productCard:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:18,padding:15,gap:9},productActive:{borderColor:c.accent},productTop:{flexDirection:'row',justifyContent:'space-between',gap:8},subscriptionList:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:15,padding:14,gap:5},subscriptionItem:{color:c.textSecondary,fontSize:10,fontWeight:'800'},note:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:15,padding:14,gap:4},
  noteTitle:{color:c.text,fontSize:12,fontWeight:'900'},
  back:{borderWidth:1,borderColor:c.border,borderRadius:12,padding:13,alignItems:'center'},
  backText:{color:c.text,fontSize:9,fontWeight:'900',letterSpacing:1},
  message:{color:c.accentBright,fontSize:11,lineHeight:17},
});
