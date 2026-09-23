import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { AI_LIMITS, PLAN_NAMES, PLAN_PRICING, PlanId } from '@/lib/entitlements';
import { Card, c } from '@/components/mobile-ui';

export default function PlanSection() {
  const { session, profile } = useAuth();
  const router = useRouter();
  const [plan, setPlan] = useState<PlanId>(((profile as any)?.plan_id || 'free') as PlanId);
  const [status, setStatus] = useState('active');

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!session) return;
      const { data } = await supabase
        .from('subscriptions')
        .select('plan_id,status')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!alive) return;
      const next = (data?.plan_id || (profile as any)?.plan_id || 'free') as PlanId;
      setPlan(next);
      setStatus(data?.status || 'active');
    })();
    return () => { alive = false; };
  }, [session, (profile as any)?.plan_id]);

  const price = PLAN_PRICING[plan] || PLAN_PRICING.free;
  const ai = AI_LIMITS[plan] ?? 0;

  return (
    <Card style={{ gap: 11, borderColor: plan === 'free' ? c.border : c.accent }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1.4 }}>YOUR PLAN</Text>
          <Text style={{ color: c.text, fontSize: 20, fontWeight: '900', marginTop: 3 }}>{PLAN_NAMES[plan]}</Text>
          <Text style={{ color: c.muted, fontSize: 10, marginTop: 2 }}>
            {status === 'active' ? 'Active subscription' : status}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: c.accentBright, fontSize: 14, fontWeight: '900' }}>
            {price.monthly === 0 ? '₹0' : '₹' + price.monthly.toLocaleString('en-IN')}
          </Text>
          <Text style={{ color: c.muted, fontSize: 8 }}>/month</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1, backgroundColor: c.background, borderRadius: 11, padding: 10 }}>
          <Text style={{ color: c.muted, fontSize: 8, fontWeight: '900' }}>AI ALLOWANCE</Text>
          <Text style={{ color: c.text, fontSize: 13, fontWeight: '900', marginTop: 3 }}>
            {ai === 0 ? 'No AI' : ai.toLocaleString('en-IN') + '/month'}
          </Text>
        </View>
        <View style={{ flex: 1, backgroundColor: c.background, borderRadius: 11, padding: 10 }}>
          <Text style={{ color: c.muted, fontSize: 8, fontWeight: '900' }}>YEARLY</Text>
          <Text style={{ color: c.text, fontSize: 13, fontWeight: '900', marginTop: 3 }}>
            {price.yearly === 0 ? 'Free' : '₹' + price.yearly.toLocaleString('en-IN')}
          </Text>
        </View>
      </View>

      <Pressable
        onPress={() => router.push('/plans')}
        style={{ borderWidth: 1, borderColor: c.accent, borderRadius: 11, paddingVertical: 11, alignItems: 'center' }}
      >
        <Text style={{ color: c.accentBright, fontSize: 9, fontWeight: '900', letterSpacing: 1 }}>
          {plan === 'free' ? 'VIEW PLANS' : 'MANAGE / CHANGE PLAN'}
        </Text>
      </Pressable>
    </Card>
  );
}
