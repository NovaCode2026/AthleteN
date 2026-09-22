import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Screen, Header, Section, Card, Button, Field, c } from '@/components/mobile-ui';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

type Member = { user_id: string; role: string; status: string; full_name?: string | null; belt?: string | null; discipline?: string | null };
type Tx = { id: string; type: 'income' | 'expense'; amount: number; category: string; description?: string | null; transaction_date: string };

export default function Academy() {
  const { profile } = useAuth();
  const [code, setCode] = useState('');
  const [saved, setSaved] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showFinance, setShowFinance] = useState(false);
  const [txType, setTxType] = useState<'income' | 'expense'>('income');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');

  const load = async () => {
    if (!profile?.academy_id) return;
    const codeResult = await supabase.rpc('get_my_connection_code');
    setSaved(codeResult.data?.code || '');
    const m = await supabase.from('academy_memberships').select('user_id,role,status').eq('academy_id', profile.academy_id).eq('status', 'active');
    const ids = (m.data || []).map((x: any) => x.user_id);
    if (ids.length) {
      const p = await supabase.from('profiles').select('user_id,full_name,belt,discipline').in('user_id', ids);
      const byId = new Map((p.data || []).map((x: any) => [x.user_id, x]));
      setMembers(ids.map((id: string) => ({ ...(m.data || []).find((x: any) => x.user_id === id), ...(byId.get(id) || {}) })));
    } else setMembers([]);

    const account = await supabase.from('finance_accounts').select('id').eq('academy_id', profile.academy_id).eq('owner_type', 'academy').maybeSingle();
    if (account.data?.id) {
      setAccountId(account.data.id);
      const tx = await supabase.from('finance_transactions').select('id,type,amount,category,description,transaction_date').eq('account_id', account.data.id).order('transaction_date', { ascending: false }).limit(30);
      setTransactions((tx.data || []) as Tx[]);
    } else { setAccountId(null); setTransactions([]); }
  };

  useEffect(() => { void load(); }, [profile?.academy_id]);

  const totals = useMemo(() => transactions.reduce((a, x) => {
    if (x.type === 'income') a.income += Number(x.amount); else a.expense += Number(x.amount);
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
    if (!profile?.academy_id || !profile?.user_id || !amount || !category.trim()) return;
    setBusy(true);
    let id = accountId;
    if (!id) {
      const created = await supabase.from('finance_accounts').insert({ academy_id: profile.academy_id, owner_type: 'academy', name: 'Academy Finance', currency: 'INR' }).select('id').single();
      id = created.data?.id || null;
    }
    if (!id) { setBusy(false); Alert.alert('Finance unavailable', 'The academy finance account could not be created.'); return; }
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
      <Header eyebrow="ACADEMY" title="Academy Workspace" subtitle="Run your academy, athletes, coaches and finances from one place." />

      <Section title="ACADEMY OVERVIEW">
        <View style={{ flexDirection: 'row', gap: 9 }}>
          <Card><Text style={{ color: c.accentBright, fontSize: 25, fontWeight: '900' }}>{members.filter(m => m.role === 'athlete').length}</Text><Text style={{ color: c.muted, fontSize: 10 }}>Athletes</Text></Card>
          <Card><Text style={{ color: c.text, fontSize: 25, fontWeight: '900' }}>{members.filter(m => m.role === 'coach').length}</Text><Text style={{ color: c.muted, fontSize: 10 }}>Coaches</Text></Card>
          <Card><Text style={{ color: c.text, fontSize: 25, fontWeight: '900' }}>{members.length}</Text><Text style={{ color: c.muted, fontSize: 10 }}>Members</Text></Card>
        </View>
      </Section>

      <Section title="ACADEMY CONNECTION">
        <Card accent>
          <Text style={{ color: c.text, fontSize: 15, fontWeight: '900' }}>Academy join code</Text>
          <Text style={{ color: c.muted, fontSize: 10, lineHeight: 16 }}>Athletes use this code to connect their AthleteN account to this academy.</Text>
          <Text style={{ color: c.accentBright, fontSize: 25, fontWeight: '900' }}>{saved || 'Not set'}</Text>
          <Field label="NEW CODE" value={code} onChangeText={setCode} placeholder="e.g. ATN-ACADEMY-01" />
          <Button title="SAVE ACADEMY CODE" onPress={() => void saveCode()} busy={busy} />
        </Card>
      </Section>

      <Section title="MEMBERS">
        {members.length === 0 ? <Card><Text style={{ color: c.text, fontWeight: '800' }}>No active members yet</Text><Text style={{ color: c.muted, fontSize: 10 }}>Athletes and coaches can join using your academy connection code or academy-managed access.</Text></Card> :
          members.map(m => <Card key={m.user_id}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><View><Text style={{ color: c.text, fontSize: 14, fontWeight: '900' }}>{m.full_name || 'Member'}</Text><Text style={{ color: c.muted, fontSize: 10 }}>{m.role} · {m.discipline || 'Taekwondo'} · {m.belt || 'Belt not set'}</Text></View><Text style={{ color: c.accentBright, fontSize: 9, fontWeight: '900' }}>{m.status.toUpperCase()}</Text></View></Card>)
        }
      </Section>

      <Section title="FINANCE" action={<Pressable onPress={() => setShowFinance(v => !v)}><Text style={{ color: c.accentBright, fontWeight: '900', fontSize: 10 }}>{showFinance ? 'HIDE' : 'OPEN'}</Text></Pressable>}>
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View><Text style={{ color: c.muted, fontSize: 9 }}>REVENUE</Text><Text style={{ color: c.text, fontSize: 19, fontWeight: '900' }}>₹{totals.income.toLocaleString('en-IN')}</Text></View>
            <View><Text style={{ color: c.muted, fontSize: 9 }}>EXPENSES</Text><Text style={{ color: c.text, fontSize: 19, fontWeight: '900' }}>₹{totals.expense.toLocaleString('en-IN')}</Text></View>
            <View><Text style={{ color: c.muted, fontSize: 9 }}>BALANCE</Text><Text style={{ color: c.accentBright, fontSize: 19, fontWeight: '900' }}>₹{(totals.income - totals.expense).toLocaleString('en-IN')}</Text></View>
          </View>
          {showFinance ? <>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => setTxType('income')} style={{ flex: 1, padding: 11, borderRadius: 12, backgroundColor: txType === 'income' ? c.accentSoft : c.background, borderWidth: 1, borderColor: c.border }}><Text style={{ color: c.text, textAlign: 'center', fontWeight: '900' }}>INCOME</Text></Pressable>
              <Pressable onPress={() => setTxType('expense')} style={{ flex: 1, padding: 11, borderRadius: 12, backgroundColor: txType === 'expense' ? c.accentSoft : c.background, borderWidth: 1, borderColor: c.border }}><Text style={{ color: c.text, textAlign: 'center', fontWeight: '900' }}>EXPENSE</Text></Pressable>
            </View>
            <Field label="AMOUNT (INR)" value={amount} onChangeText={setAmount} placeholder="0" keyboardType="numeric" />
            <Field label="CATEGORY" value={category} onChangeText={setCategory} placeholder="Fees, rent, equipment..." />
            <Field label="NOTE" value={description} onChangeText={setDescription} placeholder="Optional" />
            <Button title="ADD TRANSACTION" onPress={() => void addTransaction()} busy={busy} />
            {transactions.slice(0, 8).map(t => <View key={t.id} style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: c.border, paddingTop: 9 }}><View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: '800', fontSize: 11 }}>{t.category}</Text><Text style={{ color: c.muted, fontSize: 9 }}>{t.description || t.transaction_date}</Text></View><Text style={{ color: c.text, fontWeight: '900' }}>{t.type === 'income' ? '+' : '-'}₹{Number(t.amount).toLocaleString('en-IN')}</Text></View>)}
          </> : null}
        </Card>
      </Section>

      <Section title="ACADEMY CONTROL">
        <Card><Text style={{ color: c.text, fontWeight: '900' }}>Operations</Text><Text style={{ color: c.muted, fontSize: 10, lineHeight: 16 }}>This workspace is separate from the athlete app. Training plans, attendance, coach seats, academy groups and athlete oversight can be added here without exposing the normal athlete navigation.</Text></Card>
      </Section>
    </Screen>
  );
}
