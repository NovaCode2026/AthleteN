import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Screen, Header, Section, Card, Button, Field, c } from '@/components/mobile-ui';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

type Athlete = {
  athlete_user_id: string;
  status: string;
  full_name?: string | null;
  belt?: string | null;
  discipline?: string | null;
  weight_kg?: number | null;
  competition_weight_category?: string | null;
};

type Tx = { id: string; type: 'income' | 'expense'; amount: number; category: string; description?: string | null; transaction_date: string };

export default function Coach() {
  const { profile } = useAuth();
  const [code, setCode] = useState('');
  const [saved, setSaved] = useState('');
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showFinance, setShowFinance] = useState(false);
  const [txType, setTxType] = useState<'income' | 'expense'>('income');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');

  const load = async () => {
    if (!profile?.user_id) return;
    const codeResult = await supabase.rpc('get_my_connection_code');
    setSaved(codeResult.data?.code || '');

    const links = await supabase.from('coach_athlete_links').select('athlete_user_id,status').eq('coach_user_id', profile.user_id).eq('status', 'active');
    const ids = (links.data || []).map((x: any) => x.athlete_user_id);
    if (ids.length) {
      const p = await supabase.from('profiles').select('user_id,full_name,belt,discipline,weight_kg,competition_weight_category').in('user_id', ids);
      const byId = new Map((p.data || []).map((x: any) => [x.user_id, x]));
      setAthletes(ids.map((id: string) => ({ athlete_user_id: id, status: 'active', ...(byId.get(id) || {}) })));
    } else setAthletes([]);

    const account = await supabase.from('finance_accounts').select('id').eq('owner_user_id', profile.user_id).eq('owner_type', 'coach').maybeSingle();
    if (account.data?.id) {
      setAccountId(account.data.id);
      const tx = await supabase.from('finance_transactions').select('id,type,amount,category,description,transaction_date').eq('account_id', account.data.id).order('transaction_date', { ascending: false }).limit(30);
      setTransactions((tx.data || []) as Tx[]);
    } else {
      setAccountId(null);
      setTransactions([]);
    }
  };

  useEffect(() => { void load(); }, [profile?.user_id]);

  const totals = useMemo(() => transactions.reduce((a, x) => {
    if (x.type === 'income') a.income += Number(x.amount);
    else a.expense += Number(x.amount);
    return a;
  }, { income: 0, expense: 0 }), [transactions]);

  async function saveCode() {
    if (!code.trim()) return;
    setBusy(true);
    const { error } = await supabase.rpc('set_connection_code', { p_code: code.trim() });
    setBusy(false);
    if (error) Alert.alert('Could not save code', error.message);
    else { setCode(''); await load(); }
  }

  async function addTransaction() {
    if (!profile?.user_id || !amount || !category.trim()) return;
    setBusy(true);
    let id = accountId;
    if (!id) {
      const created = await supabase.from('finance_accounts').insert({ owner_user_id: profile.user_id, owner_type: 'coach', name: 'Coach Finance', currency: 'INR' }).select('id').single();
      id = created.data?.id || null;
    }
    if (!id) {
      setBusy(false);
      Alert.alert('Finance unavailable', 'The finance account could not be created.');
      return;
    }
    const { error } = await supabase.from('finance_transactions').insert({
      account_id: id, user_id: profile.user_id, type: txType, amount: Number(amount), category: category.trim(),
      description: description.trim() || null, transaction_date: new Date().toISOString().slice(0, 10),
    });
    setBusy(false);
    if (error) Alert.alert('Could not save transaction', error.message);
    else { setAmount(''); setCategory(''); setDescription(''); await load(); }
  }

  return (
    <Screen>
      <Header eyebrow="COACH" title="Coach Workspace" subtitle="Manage your athletes, training oversight and coaching finances." />

      <Section title="OVERVIEW">
        <View style={{ flexDirection: 'row', gap: 9 }}>
          <Card><Text style={{ color: c.accentBright, fontSize: 25, fontWeight: '900' }}>{athletes.length}</Text><Text style={{ color: c.muted, fontSize: 10 }}>Active athletes</Text></Card>
          <Card><Text style={{ color: c.text, fontSize: 25, fontWeight: '900' }}>{athletes.filter(a => a.discipline === 'kyorugi').length}</Text><Text style={{ color: c.muted, fontSize: 10 }}>Kyorugi</Text></Card>
          <Card><Text style={{ color: c.text, fontSize: 25, fontWeight: '900' }}>{athletes.filter(a => a.discipline === 'poomsae').length}</Text><Text style={{ color: c.muted, fontSize: 10 }}>Poomsae</Text></Card>
        </View>
      </Section>

      <Section title="ATHLETE CONNECTION">
        <Card accent>
          <Text style={{ color: c.text, fontSize: 15, fontWeight: '900' }}>Your coach code</Text>
          <Text style={{ color: c.muted, fontSize: 10, lineHeight: 16 }}>Give this code to athletes so they can connect their AthleteN account to you.</Text>
          <Text style={{ color: c.accentBright, fontSize: 25, fontWeight: '900' }}>{saved || 'Not set'}</Text>
          <Field label="NEW CODE" value={code} onChangeText={setCode} placeholder="e.g. COACH-PRATYAKSH" />
          <Button title="SAVE CONNECTION CODE" onPress={() => void saveCode()} busy={busy} />
        </Card>
      </Section>

      <Section title="MY ATHLETES">
        {athletes.length === 0 ? <Card><Text style={{ color: c.text, fontWeight: '800' }}>No connected athletes yet</Text><Text style={{ color: c.muted, fontSize: 10 }}>Athletes can enter your connection code from My Team.</Text></Card> :
          athletes.map(a => <Card key={a.athlete_user_id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
              <View style={{ flex: 1 }}><Text style={{ color: c.text, fontSize: 15, fontWeight: '900' }}>{a.full_name || 'Athlete'}</Text><Text style={{ color: c.muted, fontSize: 10 }}>{a.discipline || 'Taekwondo'} · {a.belt || 'Belt not set'}</Text></View>
              <Text style={{ color: c.accentBright, fontWeight: '900', fontSize: 11 }}>{a.competition_weight_category || 'Category —'}</Text>
            </View>
            <Text style={{ color: c.muted, fontSize: 10 }}>Current profile weight: {a.weight_kg ?? '—'} kg</Text>
          </Card>)
        }
      </Section>

      <Section title="FINANCE" action={<Pressable onPress={() => setShowFinance(v => !v)}><Text style={{ color: c.accentBright, fontWeight: '900', fontSize: 10 }}>{showFinance ? 'HIDE' : 'OPEN'}</Text></Pressable>}>
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View><Text style={{ color: c.muted, fontSize: 9 }}>EARNINGS</Text><Text style={{ color: c.text, fontSize: 19, fontWeight: '900' }}>₹{totals.income.toLocaleString('en-IN')}</Text></View>
            <View><Text style={{ color: c.muted, fontSize: 9 }}>EXPENSES</Text><Text style={{ color: c.text, fontSize: 19, fontWeight: '900' }}>₹{totals.expense.toLocaleString('en-IN')}</Text></View>
            <View><Text style={{ color: c.muted, fontSize: 9 }}>BALANCE</Text><Text style={{ color: c.accentBright, fontSize: 19, fontWeight: '900' }}>₹{(totals.income - totals.expense).toLocaleString('en-IN')}</Text></View>
          </View>
          {showFinance ? <>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => setTxType('income')} style={{ flex: 1, padding: 11, borderRadius: 12, backgroundColor: txType === 'income' ? c.accentSoft : c.background, borderWidth: 1, borderColor: c.border }}><Text style={{ color: c.text, textAlign: 'center', fontWeight: '900' }}>INCOME</Text></Pressable>
              <Pressable onPress={() => setTxType('expense')} style={{ flex: 1, padding: 11, borderRadius: 12, backgroundColor: txType === 'expense' ? c.accentSoft : c.background, borderWidth: 1, borderColor: c.border }}><Text style={{ color: c.text, textAlign: 'center', fontWeight: '900' }}>EXPENSE</Text></Pressable>
            </View>
            <Field label="AMOUNT (INR)" value={amount} onChangeText={setAmount} placeholder="0" keyboardType="numeric" />
            <Field label="CATEGORY" value={category} onChangeText={setCategory} placeholder="Tournament, coaching, travel..." />
            <Field label="NOTE" value={description} onChangeText={setDescription} placeholder="Optional" />
            <Button title="ADD TRANSACTION" onPress={() => void addTransaction()} busy={busy} />
            {transactions.slice(0, 8).map(t => <View key={t.id} style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: c.border, paddingTop: 9 }}><View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: '800', fontSize: 11 }}>{t.category}</Text><Text style={{ color: c.muted, fontSize: 9 }}>{t.description || t.transaction_date}</Text></View><Text style={{ color: c.text, fontWeight: '900' }}>{t.type === 'income' ? '+' : '-'}₹{Number(t.amount).toLocaleString('en-IN')}</Text></View>)}
          </> : null}
        </Card>
      </Section>

      <Section title="QUICK ACTIONS">
        <Card>
          <Text style={{ color: c.text, fontWeight: '900' }}>AthleteN Coach tools</Text>
          <Text style={{ color: c.muted, fontSize: 10, lineHeight: 16 }}>Training plans, attendance, competition preparation, belt approvals and weight-category decisions should live behind this workspace as the coach-control modules are enabled.</Text>
        </Card>
      </Section>
    </Screen>
  );
}
