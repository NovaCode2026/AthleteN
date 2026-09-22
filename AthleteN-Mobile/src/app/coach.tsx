import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
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

type Tx = {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  description?: string | null;
  transaction_date: string;
};

type Approval = {
  id: string;
  athlete_user_id: string;
  request_type: string;
  requested_value: string;
  current_value?: string | null;
  athlete_weight_kg?: number | null;
  status: string;
  created_at: string;
};

const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

function MiniBar({ value, max, label, suffix = '' }: { value: number; max: number; label: string; suffix?: string }) {
  const width = max > 0 ? Math.max(4, Math.min(100, (value / max) * 100)) : 4;
  return (
    <View style={{ gap: 5 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: c.muted, fontSize: 9, fontWeight: '800' }}>{label}</Text>
        <Text style={{ color: c.text, fontSize: 9, fontWeight: '900' }}>{value}{suffix}</Text>
      </View>
      <View style={{ height: 7, borderRadius: 99, backgroundColor: c.background, overflow: 'hidden' }}>
        <View style={{ width: `${width}%`, height: 7, borderRadius: 99, backgroundColor: c.accent }} />
      </View>
    </View>
  );
}

export default function Coach() {
  const { profile } = useAuth();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [saved, setSaved] = useState('');
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [academyId, setAcademyId] = useState<string | null>(null);
  const [academyRole, setAcademyRole] = useState<string | null>(null);
  const [academyName, setAcademyName] = useState('');
  const [academyCode, setAcademyCode] = useState('');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showFinance, setShowFinance] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(true);
  const [showApprovals, setShowApprovals] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedAthlete, setSelectedAthlete] = useState<string | null>(null);
  const [txType, setTxType] = useState<'income' | 'expense'>('income');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');

  const load = async () => {
    if (!profile?.user_id) return;

    const codeResult = await supabase.rpc('get_my_connection_code');
    setSaved(codeResult.data?.code || '');

    const links = await supabase
      .from('coach_athlete_links')
      .select('athlete_user_id,status')
      .eq('coach_user_id', profile.user_id)
      .eq('status', 'active');

    const ids = (links.data || []).map((x: any) => x.athlete_user_id);
    if (ids.length) {
      const p = await supabase
        .from('profiles')
        .select('user_id,full_name,belt,discipline,weight_kg,competition_weight_category')
        .in('user_id', ids);
      const byId = new Map((p.data || []).map((x: any) => [x.user_id, x]));
      setAthletes(ids.map((id: string) => ({ athlete_user_id: id, status: 'active', ...(byId.get(id) || {}) })));
    } else {
      setAthletes([]);
    }

    const approvalResult = await supabase
      .from('coach_approval_requests')
      .select('id,athlete_user_id,request_type,requested_value,current_value,athlete_weight_kg,status,created_at')
      .eq('coach_user_id', profile.user_id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(20);
    setApprovals((approvalResult.data || []) as Approval[]);

    const membership = await supabase
      .from('academy_memberships')
      .select('academy_id,role,status')
      .eq('user_id', profile.user_id)
      .eq('status', 'active')
      .eq('role', 'coach')
      .maybeSingle();

    if (membership.data?.academy_id) {
      setAcademyId(membership.data.academy_id);
      setAcademyRole(membership.data.role);
      const academy = await supabase
        .from('academies')
        .select('name')
        .eq('id', membership.data.academy_id)
        .maybeSingle();
      setAcademyName(academy.data?.name || 'Academy');
    } else {
      setAcademyId(null);
      setAcademyRole(null);
      setAcademyName('');
    }

    const account = await supabase
      .from('finance_accounts')
      .select('id')
      .eq('owner_user_id', profile.user_id)
      .eq('owner_type', 'coach')
      .maybeSingle();

    if (account.data?.id) {
      setAccountId(account.data.id);
      const tx = await supabase
        .from('finance_transactions')
        .select('id,type,amount,category,description,transaction_date')
        .eq('account_id', account.data.id)
        .order('transaction_date', { ascending: false })
        .limit(100);
      setTransactions((tx.data || []) as Tx[]);
    } else {
      setAccountId(null);
      setTransactions([]);
    }
  };

  useEffect(() => {
    void load();
  }, [profile?.user_id]);

  const totals = useMemo(() => transactions.reduce((a, x) => {
    if (x.type === 'income') a.income += Number(x.amount);
    else a.expense += Number(x.amount);
    return a;
  }, { income: 0, expense: 0 }), [transactions]);

  const filteredAthletes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return athletes;
    return athletes.filter(a =>
      [a.full_name, a.discipline, a.belt, a.competition_weight_category]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q))
    );
  }, [athletes, search]);

  const disciplineCounts = useMemo(() => ({
    kyorugi: athletes.filter(a => String(a.discipline || '').toLowerCase() === 'kyorugi').length,
    poomsae: athletes.filter(a => String(a.discipline || '').toLowerCase() === 'poomsae').length,
  }), [athletes]);

  const rosterInsights = useMemo(() => {
    const weights = athletes.map(a => Number(a.weight_kg)).filter(Number.isFinite);
    const complete = athletes.filter(a => a.belt && a.discipline && Number.isFinite(Number(a.weight_kg)) && a.competition_weight_category).length;
    return {
      avgWeight: weights.length ? weights.reduce((a, b) => a + b, 0) / weights.length : 0,
      minWeight: weights.length ? Math.min(...weights) : 0,
      maxWeight: weights.length ? Math.max(...weights) : 0,
      complete,
      completeness: athletes.length ? Math.round((complete / athletes.length) * 100) : 0,
    };
  }, [athletes]);

  const monthlyFinance = useMemo(() => {
    const rows: { label: string; income: number; expense: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('en-IN', { month: 'short' });
      const month = transactions.filter(t => String(t.transaction_date).slice(0, 7) === key);
      rows.push({
        label,
        income: month.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0),
        expense: month.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0),
      });
    }
    return rows;
  }, [transactions]);

  const maxFinance = Math.max(1, ...monthlyFinance.flatMap(x => [x.income, x.expense]));

  async function saveCode() {
    if (!code.trim()) return;
    setBusy(true);
    const { error } = await supabase.rpc('set_connection_code', { p_code: code.trim() });
    setBusy(false);
    if (error) Alert.alert('Could not save code', error.message);
    else {
      setCode('');
      await load();
    }
  }

  async function reviewApproval(request: Approval, status: 'approved' | 'rejected') {
    setBusy(true);
    const { error } = await supabase.rpc('review_coach_approval', {
      p_request_id: request.id,
      p_status: status,
      p_notes: status === 'approved' ? 'Approved from Coach Workspace.' : 'Rejected from Coach Workspace.',
    });
    setBusy(false);
    if (error) Alert.alert('Approval failed', error.message);
    else await load();
  }

  async function addTransaction() {
    if (!profile?.user_id || !amount || !category.trim() || Number(amount) <= 0) return;
    setBusy(true);
    let id = accountId;
    if (!id) {
      const created = await supabase.rpc('get_or_create_my_coach_finance_account');
      if (created.error) {
        setBusy(false);
        Alert.alert('Finance unavailable', created.error.message);
        return;
      }
      id = created.data || null;
    }
    if (!id) {
      setBusy(false);
      Alert.alert('Finance unavailable', 'The finance account could not be created.');
      return;
    }
    const { error } = await supabase.from('finance_transactions').insert({
      account_id: id,
      user_id: profile.user_id,
      type: txType,
      amount: Number(amount),
      category: category.trim(),
      description: description.trim() || null,
      transaction_date: new Date().toISOString().slice(0, 10),
    });
    setBusy(false);
    if (error) Alert.alert('Could not save transaction', error.message);
    else {
      setAmount('');
      setCategory('');
      setDescription('');
      await load();
    }
  }

  return (
    <Screen>
      <Header
        eyebrow="COACH COMMAND CENTER"
        title="Coach Workspace"
        subtitle="Run your roster, performance oversight, approvals, competitions and coaching finances from one place."
      />

      <Section title="TEAM SNAPSHOT">
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Card><Text style={{ color: c.accentBright, fontSize: 25, fontWeight: '900' }}>{athletes.length}</Text><Text style={{ color: c.muted, fontSize: 9 }}>Athletes</Text></Card>
          <Card><Text style={{ color: c.text, fontSize: 25, fontWeight: '900' }}>{disciplineCounts.kyorugi}</Text><Text style={{ color: c.muted, fontSize: 9 }}>Kyorugi</Text></Card>
          <Card><Text style={{ color: c.text, fontSize: 25, fontWeight: '900' }}>{disciplineCounts.poomsae}</Text><Text style={{ color: c.muted, fontSize: 9 }}>Poomsae</Text></Card>
          <Card><Text style={{ color: approvals.length ? c.warning : c.success, fontSize: 25, fontWeight: '900' }}>{approvals.length}</Text><Text style={{ color: c.muted, fontSize: 9 }}>Pending</Text></Card>
        </View>
      </Section>

      <Section title="TEAM ANALYTICS" action={<Pressable onPress={() => setShowAnalytics(v => !v)}><Text style={{ color: c.accentBright, fontWeight: '900', fontSize: 10 }}>{showAnalytics ? 'HIDE' : 'OPEN'}</Text></Pressable>}>
        {showAnalytics ? <Card>
          <Text style={{ color: c.text, fontSize: 15, fontWeight: '900' }}>Roster health</Text>
          <Text style={{ color: c.muted, fontSize: 10, lineHeight: 16 }}>Live insights calculated from the athlete records you can currently access.</Text>
          <MiniBar label="Kyorugi" value={disciplineCounts.kyorugi} max={Math.max(1, athletes.length)} />
          <MiniBar label="Poomsae" value={disciplineCounts.poomsae} max={Math.max(1, athletes.length)} />
          <MiniBar label="Profile completeness" value={rosterInsights.completeness} max={100} suffix="%" />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Card><Text style={{ color: c.muted, fontSize: 8 }}>AVG WEIGHT</Text><Text style={{ color: c.text, fontWeight: '900' }}>{rosterInsights.avgWeight ? rosterInsights.avgWeight.toFixed(1) : '—'} kg</Text></Card>
            <Card><Text style={{ color: c.muted, fontSize: 8 }}>LOWEST</Text><Text style={{ color: c.text, fontWeight: '900' }}>{rosterInsights.minWeight || '—'} kg</Text></Card>
            <Card><Text style={{ color: c.muted, fontSize: 8 }}>HIGHEST</Text><Text style={{ color: c.text, fontWeight: '900' }}>{rosterInsights.maxWeight || '—'} kg</Text></Card>
          </View>
          <Text style={{ color: c.textSecondary, fontSize: 9, fontWeight: '800' }}>WEIGHT DISTRIBUTION</Text>
          {athletes.length ? [...athletes].sort((a, b) => Number(b.weight_kg || 0) - Number(a.weight_kg || 0)).slice(0, 8).map(a =>
            <MiniBar key={a.athlete_user_id} label={a.full_name || 'Athlete'} value={Number(a.weight_kg || 0)} max={Math.max(1, ...athletes.map(x => Number(x.weight_kg || 0)))} suffix=" kg" />
          ) : <Text style={{ color: c.muted, fontSize: 10 }}>Connect athletes to populate analytics.</Text>}
        </Card> : null}
      </Section>

      <Section title="ATHLETE CONNECTION">
        <Card accent>
          <Text style={{ color: c.text, fontSize: 15, fontWeight: '900' }}>Your coach code</Text>
          <Text style={{ color: c.muted, fontSize: 10, lineHeight: 16 }}>Athletes enter this code from My Team to connect to you.</Text>
          <Text style={{ color: c.accentBright, fontSize: 25, fontWeight: '900' }}>{saved || 'Not set'}</Text>
          <Field label="NEW CODE" value={code} onChangeText={setCode} placeholder="e.g. COACH-PRATYAKSH" />
          <Button title="SAVE CONNECTION CODE" onPress={() => void saveCode()} busy={busy} />
        </Card>
      </Section>

      <Section title="ACADEMY CONNECTION">
        <Card>
          {academyId ? <>
            <Text style={{ color: c.success, fontSize: 10, fontWeight: '900' }}>CONNECTED TO ACADEMY</Text>
            <Text style={{ color: c.text, fontSize: 17, fontWeight: '900' }}>{academyName}</Text>
            <Text style={{ color: c.muted, fontSize: 10, lineHeight: 16 }}>Academy affiliation is optional. Your independent Coach Workspace remains fully active.</Text>
            <Text style={{ color: c.accentBright, fontSize: 10, fontWeight: '900' }}>ROLE: {academyRole?.toUpperCase()}</Text>
          </> : <>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '900' }}>Independent coach</Text>
            <Text style={{ color: c.muted, fontSize: 10, lineHeight: 16 }}>No Academy is connected. You can run your entire coaching workspace independently.</Text>
            <Field label="ACADEMY CODE" value={academyCode} onChangeText={setAcademyCode} placeholder="Enter an Academy connection code" />
            <Button title="CONNECT TO ACADEMY" onPress={async()=>{if(!academyCode.trim())return;setBusy(true);const {error}=await supabase.rpc('connect_coach_to_academy_by_code',{p_code:academyCode.trim()});setBusy(false);if(error)Alert.alert('Academy connection failed',error.message);else{setAcademyCode('');await load();}}} busy={busy} />
          </>}
        </Card>
      </Section>

      <Section title="PENDING COACH APPROVALS" action={<Pressable onPress={() => setShowApprovals(v => !v)}><Text style={{ color: c.accentBright, fontWeight: '900', fontSize: 10 }}>{showApprovals ? 'HIDE' : 'OPEN'}</Text></Pressable>}>
        {showApprovals ? approvals.length ? approvals.map(request => {
          const athlete = athletes.find(a => a.athlete_user_id === request.athlete_user_id);
          return <Card key={request.id}>
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '900' }}>{athlete?.full_name || 'Athlete'}</Text>
            <Text style={{ color: c.muted, fontSize: 10 }}>{request.request_type === 'belt_change' ? 'Belt change' : 'Competition weight category'} · Requested: {request.requested_value}</Text>
            {request.current_value ? <Text style={{ color: c.muted, fontSize: 9 }}>Current: {request.current_value}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => void reviewApproval(request, 'approved')} style={{ flex: 1, backgroundColor: c.accentSoft, borderWidth: 1, borderColor: c.accentDeep, borderRadius: 12, padding: 12, alignItems: 'center' }}><Text style={{ color: c.accentBright, fontWeight: '900', fontSize: 9 }}>APPROVE</Text></Pressable>
              <Pressable onPress={() => void reviewApproval(request, 'rejected')} style={{ flex: 1, backgroundColor: c.background, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 12, alignItems: 'center' }}><Text style={{ color: c.danger, fontWeight: '900', fontSize: 9 }}>REJECT</Text></Pressable>
            </View>
          </Card>;
        }) : <Card><Text style={{ color: c.text, fontWeight: '800' }}>No approvals waiting</Text><Text style={{ color: c.muted, fontSize: 10 }}>Belt and competition-category requests will appear here.</Text></Card> : null}
      </Section>

      <Section title="MY ATHLETES">
        <Card>
          <TextInput value={search} onChangeText={setSearch} placeholder="Search athletes, belt, discipline or category..." placeholderTextColor={c.muted} style={{ backgroundColor: c.background, borderWidth: 1, borderColor: c.border, borderRadius: 12, color: c.text, paddingHorizontal: 12, paddingVertical: 11, fontSize: 12 }} />
          <Text style={{ color: c.muted, fontSize: 9 }}>{filteredAthletes.length} of {athletes.length} athletes</Text>
        </Card>
        {!filteredAthletes.length ? <Card><Text style={{ color: c.text, fontWeight: '800' }}>No connected athletes yet</Text><Text style={{ color: c.muted, fontSize: 10, lineHeight: 16 }}>Athletes can enter your connection code from My Team.</Text></Card> :
          filteredAthletes.map(a => {
            const open = selectedAthlete === a.athlete_user_id;
            return <Card key={a.athlete_user_id}>
              <Pressable onPress={() => setSelectedAthlete(open ? null : a.athlete_user_id)}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontSize: 15, fontWeight: '900' }}>{a.full_name || 'Athlete'}</Text>
                    <Text style={{ color: c.muted, fontSize: 10 }}>{a.discipline || 'Taekwondo'} · {a.belt || 'Belt not set'}</Text>
                  </View>
                  <Text style={{ color: c.accentBright, fontWeight: '900', fontSize: 10 }}>{a.competition_weight_category || 'Category —'}</Text>
                </View>
                <Text style={{ color: c.muted, fontSize: 10 }}>Current profile weight: {a.weight_kg ?? '—'} kg</Text>
              </Pressable>
              {open ? <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10, gap: 6 }}>
                <Text style={{ color: c.textSecondary, fontSize: 9, fontWeight: '900' }}>COACH VIEW</Text>
                <Text style={{ color: c.muted, fontSize: 10 }}>Discipline: {a.discipline || 'Not set'}</Text>
                <Text style={{ color: c.muted, fontSize: 10 }}>Belt: {a.belt || 'Not set'}</Text>
                <Text style={{ color: c.muted, fontSize: 10 }}>Weight: {a.weight_kg ?? '—'} kg</Text>
                <Text style={{ color: c.muted, fontSize: 10 }}>Competition category: {a.competition_weight_category || 'Not set'}</Text>
              </View> : null}
            </Card>;
          })}
      </Section>

      <Section title="FINANCE" action={<Pressable onPress={() => setShowFinance(v => !v)}><Text style={{ color: c.accentBright, fontWeight: '900', fontSize: 10 }}>{showFinance ? 'HIDE' : 'OPEN'}</Text></Pressable>}>
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View><Text style={{ color: c.muted, fontSize: 9 }}>EARNINGS</Text><Text style={{ color: c.text, fontSize: 19, fontWeight: '900' }}>{money(totals.income)}</Text></View>
            <View><Text style={{ color: c.muted, fontSize: 9 }}>EXPENSES</Text><Text style={{ color: c.text, fontSize: 19, fontWeight: '900' }}>{money(totals.expense)}</Text></View>
            <View><Text style={{ color: c.muted, fontSize: 9 }}>BALANCE</Text><Text style={{ color: c.accentBright, fontSize: 19, fontWeight: '900' }}>{money(totals.income - totals.expense)}</Text></View>
          </View>
          {showFinance ? <>
            <Text style={{ color: c.textSecondary, fontSize: 9, fontWeight: '900' }}>6-MONTH CASH FLOW</Text>
            {monthlyFinance.map(m => <View key={m.label} style={{ gap: 4 }}>
              <Text style={{ color: c.muted, fontSize: 9, fontWeight: '800' }}>{m.label} · {money(m.income - m.expense)}</Text>
              <MiniBar label="Income" value={m.income} max={maxFinance} />
              <MiniBar label="Expense" value={m.expense} max={maxFinance} />
            </View>)}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => setTxType('income')} style={{ flex: 1, padding: 11, borderRadius: 12, backgroundColor: txType === 'income' ? c.accentSoft : c.background, borderWidth: 1, borderColor: c.border }}><Text style={{ color: c.text, textAlign: 'center', fontWeight: '900' }}>INCOME</Text></Pressable>
              <Pressable onPress={() => setTxType('expense')} style={{ flex: 1, padding: 11, borderRadius: 12, backgroundColor: txType === 'expense' ? c.accentSoft : c.background, borderWidth: 1, borderColor: c.border }}><Text style={{ color: c.text, textAlign: 'center', fontWeight: '900' }}>EXPENSE</Text></Pressable>
            </View>
            <Field label="AMOUNT (INR)" value={amount} onChangeText={setAmount} placeholder="0" keyboardType="numeric" />
            <Field label="CATEGORY" value={category} onChangeText={setCategory} placeholder="Tournament, coaching, travel..." />
            <Field label="NOTE" value={description} onChangeText={setDescription} placeholder="Optional" />
            <Button title="ADD TRANSACTION" onPress={() => void addTransaction()} busy={busy} />
            {transactions.slice(0, 8).map(t => <View key={t.id} style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: c.border, paddingTop: 9 }}><View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: '800', fontSize: 11 }}>{t.category}</Text><Text style={{ color: c.muted, fontSize: 9 }}>{t.description || t.transaction_date}</Text></View><Text style={{ color: c.text, fontWeight: '900' }}>{t.type === 'income' ? '+' : '-'}{money(Number(t.amount))}</Text></View>)}
          </> : null}
        </Card>
      </Section>

      <Section title="COACH CONTROL CENTER">
        <View style={{ gap: 9 }}>
          <Pressable onPress={()=>router.push('/coach-training')}>
            <Card accent><Text style={{ color: c.accentBright, fontSize: 9, fontWeight: '900', letterSpacing: 1 }}>TRAINING CONTROL</Text><Text style={{ color: c.text, fontSize: 14, fontWeight: '900' }}>Plans, workload & athlete training</Text><Text style={{ color: c.muted, fontSize: 10 }}>Create managed training plans and review live session history.</Text></Card>
          </Pressable>
          <Pressable onPress={()=>router.push('/coach-competition')}>
            <Card><Text style={{ color: c.accentBright, fontSize: 9, fontWeight: '900', letterSpacing: 1 }}>COMPETITION CENTER</Text><Text style={{ color: c.text, fontSize: 14, fontWeight: '900' }}>Tournament & performance overview</Text><Text style={{ color: c.muted, fontSize: 10 }}>Review upcoming competitions, match records and medals for connected athletes.</Text></Card>
          </Pressable>
          <Pressable onPress={()=>router.push('/messages')}>
            <Card><Text style={{ color: c.accentBright, fontSize: 9, fontWeight: '900', letterSpacing: 1 }}>COMMUNICATION</Text><Text style={{ color: c.text, fontSize: 14, fontWeight: '900' }}>Private coach messaging</Text><Text style={{ color: c.muted, fontSize: 10 }}>Open private conversations and coaching communication.</Text></Card>
          </Pressable>
        </View>
      </Section>
    </Screen>
  );
}
