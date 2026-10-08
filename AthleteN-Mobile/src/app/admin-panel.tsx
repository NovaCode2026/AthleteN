import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

const c = Colors.dark;
const ADMIN_ROLES = ['support_admin', 'admin', 'super_admin'];
const ROLES = ['athlete', 'coach', 'academy', 'academy_admin', 'support_admin', 'admin', 'super_admin'];
const PLANS = ['free', 'student', 'pro', 'elite', 'coach', 'academy'];

type ProfileRow = {
  user_id: string;
  full_name: string | null;
  username: string | null;
  role: string | null;
  plan_id: string | null;
  founder_badge: boolean | null;
  verified_athlete: boolean | null;
  account_code: string | null;
  created_at: string;
};

type AuditRow = {
  id: string;
  action: string;
  entity_table: string;
  entity_id: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

type FlagRow = {
  id: string;
  flag_key: string;
  description: string | null;
  enabled: boolean;
  audience: string | null;
};

export default function AdminPanelScreen() {
  const router = useRouter();
  const { profile, session } = useAuth();
  const role = String(profile?.role || '');
  const allowed = ADMIN_ROLES.includes(role);
  const superAdmin = role === 'super_admin';

  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [selected, setSelected] = useState<ProfileRow | null>(null);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!allowed || !session) return;
    setMessage('');
    const [u, a, f] = await Promise.all([
      supabase.from('profiles').select('user_id,full_name,username,role,plan_id,founder_badge,verified_athlete,account_code,created_at').order('created_at', { ascending: false }).limit(250),
      supabase.from('audit_logs').select('id,action,entity_table,entity_id,created_at,metadata').order('created_at', { ascending: false }).limit(40),
      supabase.from('feature_flags').select('id,flag_key,description,enabled,audience').order('flag_key'),
    ]);
    const error = u.error || a.error || f.error;
    if (error) setMessage(error.message);
    setUsers((u.data || []) as ProfileRow[]);
    setAudits((a.data || []) as AuditRow[]);
    setFlags((f.data || []) as FlagRow[]);
  }, [allowed, session]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      [u.full_name, u.username, u.user_id, u.account_code, u.role, u.plan_id]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
    );
  }, [users, query]);

  const counts = useMemo(() => ({
    total: users.length,
    athletes: users.filter((u) => u.role === 'athlete').length,
    coaches: users.filter((u) => u.role === 'coach').length,
    academies: users.filter((u) => u.role === 'academy' || u.role === 'academy_admin').length,
    admins: users.filter((u) => ADMIN_ROLES.includes(String(u.role))).length,
    verified: users.filter((u) => Boolean(u.verified_athlete)).length,
  }), [users]);

  async function setRole(target: ProfileRow, nextRole: string) {
    if (!superAdmin || !target.user_id) return;
    if (target.user_id === session?.user.id && nextRole !== 'super_admin') {
      setMessage('Super Admin cannot demote itself.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('admin_set_user_role', { p_user_id: target.user_id, p_role: nextRole });
    setBusy(false);
    if (error) { setMessage(error.message); return; }
    setMessage('Role updated securely.');
    await load();
  }

  async function setPlan(target: ProfileRow, planId: string) {
    if (!allowed || !target.user_id) return;
    setBusy(true);
    const { error } = await supabase.rpc('admin_set_user_plan', { p_user_id: target.user_id, p_plan_id: planId });
    setBusy(false);
    if (error) { setMessage(error.message); return; }
    setMessage('Plan updated securely.');
    await load();
  }

  async function toggleFlag(flag: FlagRow) {
    if (!superAdmin) return;
    setBusy(true);
    const { error } = await supabase.from('feature_flags').update({ enabled: !flag.enabled }).eq('id', flag.id);
    setBusy(false);
    if (error) { setMessage(error.message); return; }
    setMessage('Feature flag updated.');
    await load();
  }

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (!allowed) {
    return <SafeAreaView style={s.screen}><View style={s.denied}><Text style={s.kicker}>ATHLETEN SECURITY</Text><Text style={s.title}>Admin access required</Text><Text style={s.meta}>This area is protected by the account role returned by Supabase.</Text></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.accentBright} />}
      >
        <Pressable onPress={() => router.back()}><Text style={s.back}>‹ BACK</Text></Pressable>
        <Text style={s.kicker}>{superAdmin ? 'SUPER ADMIN CONTROL CENTER' : 'ADMIN CONTROL CENTER'}</Text>
        <Text style={s.title}>AthleteN Command</Text>
        <Text style={s.meta}>Secure mobile administration. Sensitive mutations go through protected Supabase RPCs.</Text>

        <View style={s.grid}>
          <Stat label="USERS" value={counts.total} />
          <Stat label="ATHLETES" value={counts.athletes} />
          <Stat label="COACHES" value={counts.coaches} />
          <Stat label="ACADEMIES" value={counts.academies} />
          <Stat label="ADMINS" value={counts.admins} />
          <Stat label="VERIFIED" value={counts.verified} />
        </View>

        <View style={s.panel}>
          <Text style={s.section}>ADMIN SHORTCUTS</Text>
          <Action title="Badge Control" text="Award/revoke non-system badges using protected RPCs." onPress={() => router.push('/admin-badges')} />
          <Action title="Audit & Security" text="Review recent privileged mutations and security events." onPress={() => setMessage('Audit events are shown below.')} />
          <Action title="Refresh Control Center" text="Reload users, audit events and feature flags." onPress={() => void refresh()} />
        </View>

        <View style={s.panel}>
          <Text style={s.section}>USER MANAGEMENT</Text>
          <TextInput value={query} onChangeText={setQuery} placeholder="Search name, username, account code or UUID" placeholderTextColor={c.muted} style={s.input} />
          {filtered.map((u) => (
            <Pressable key={u.user_id} onPress={() => setSelected(selected?.user_id === u.user_id ? null : u)} style={[s.userRow, selected?.user_id === u.user_id && s.selected]}>
              <View style={{ flex: 1 }}>
                <Text style={s.userName}>{u.full_name || 'Unnamed athlete'}</Text>
                <Text style={s.userMeta}>@{u.username || 'no username'} · {u.role || 'athlete'} · {u.plan_id || 'free'}</Text>
                <Text style={s.userCode}>{u.account_code || u.user_id}</Text>
              </View>
              <Text style={s.chevron}>{selected?.user_id === u.user_id ? '−' : '+'}</Text>
            </Pressable>
          ))}
          {!filtered.length ? <Text style={s.meta}>No matching users.</Text> : null}
        </View>

        {selected ? (
          <View style={s.panel}>
            <Text style={s.section}>SELECTED USER</Text>
            <Text style={s.userName}>{selected.full_name || 'Unnamed athlete'}</Text>
            <Text style={s.userMeta}>{selected.user_id}</Text>
            <Text style={s.userMeta}>Founder: {selected.founder_badge ? 'YES' : 'NO'} · Verified: {selected.verified_athlete ? 'YES' : 'NO'}</Text>

            <Text style={s.controlLabel}>PLAN</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
              {PLANS.map((plan) => <Pressable key={plan} disabled={busy} onPress={() => void setPlan(selected, plan)} style={[s.chip, selected.plan_id === plan && s.chipActive]}><Text style={s.chipText}>{plan.toUpperCase()}</Text></Pressable>)}
            </ScrollView>

            <Text style={s.controlLabel}>ROLE {superAdmin ? '' : '(SUPER ADMIN ONLY)'}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
              {ROLES.map((nextRole) => <Pressable key={nextRole} disabled={busy || !superAdmin} onPress={() => void setRole(selected, nextRole)} style={[s.chip, selected.role === nextRole && s.chipActive, !superAdmin && s.disabled]}><Text style={s.chipText}>{nextRole.toUpperCase()}</Text></Pressable>)}
            </ScrollView>

            {busy ? <ActivityIndicator color={c.accentBright} /> : null}
          </View>
        ) : null}

        {superAdmin ? (
          <View style={s.panel}>
            <Text style={s.section}>FEATURE FLAGS</Text>
            {flags.map((flag) => (
              <View key={flag.id} style={s.flagRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.userName}>{flag.flag_key}</Text>
                  <Text style={s.userMeta}>{flag.description || flag.audience || 'Platform feature'}</Text>
                </View>
                <Pressable onPress={() => void toggleFlag(flag)} disabled={busy} style={[s.toggle, flag.enabled && s.toggleOn]}>
                  <Text style={s.toggleText}>{flag.enabled ? 'ON' : 'OFF'}</Text>
                </Pressable>
              </View>
            ))}
            {!flags.length ? <Text style={s.meta}>No feature flags available.</Text> : null}
          </View>
        ) : null}

        <View style={s.panel}>
          <Text style={s.section}>RECENT AUDIT</Text>
          {audits.map((a) => (
            <View key={a.id} style={s.auditRow}>
              <Text style={s.auditAction}>{a.action}</Text>
              <Text style={s.userMeta}>{a.entity_table} · {new Date(a.created_at).toLocaleString()}</Text>
            </View>
          ))}
          {!audits.length ? <Text style={s.meta}>No audit events visible.</Text> : null}
        </View>

        {message ? <Text style={s.message}>{message}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <View style={s.stat}><Text style={s.statValue}>{value}</Text><Text style={s.statLabel}>{label}</Text></View>;
}
function Action({ title, text, onPress }: { title: string; text: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={s.action}><View style={{ flex: 1 }}><Text style={s.actionTitle}>{title}</Text><Text style={s.userMeta}>{text}</Text></View><Text style={s.chevron}>›</Text></Pressable>;
}

const s = StyleSheet.create({
  screen:{flex:1,backgroundColor:c.background},content:{padding:18,paddingBottom:60,gap:12},back:{color:c.accentBright,fontSize:11,fontWeight:'900',letterSpacing:1},kicker:{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:1.7},title:{color:c.text,fontSize:30,fontWeight:'900',marginTop:2},meta:{color:c.muted,fontSize:11,lineHeight:17},grid:{flexDirection:'row',flexWrap:'wrap',gap:8},stat:{width:'31%',minWidth:100,backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong,borderRadius:16,padding:12},statValue:{color:c.text,fontSize:22,fontWeight:'900'},statLabel:{color:c.muted,fontSize:7,fontWeight:'900',letterSpacing:1,marginTop:3},panel:{backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong,borderRadius:20,padding:14,gap:10},section:{color:c.muted,fontSize:9,fontWeight:'900',letterSpacing:1.5},input:{backgroundColor:c.background,borderWidth:1,borderColor:c.border,borderRadius:12,color:c.text,padding:12,fontSize:12},userRow:{flexDirection:'row',alignItems:'center',gap:10,borderTopWidth:1,borderTopColor:c.border,paddingVertical:12},selected:{backgroundColor:c.accentSoft,borderRadius:12,paddingHorizontal:10},userName:{color:c.text,fontSize:13,fontWeight:'900'},userMeta:{color:c.muted,fontSize:9,lineHeight:14},userCode:{color:c.accentBright,fontSize:8,fontWeight:'800',marginTop:2},chevron:{color:c.accentBright,fontSize:22,fontWeight:'900'},chips:{gap:7},chip:{borderWidth:1,borderColor:c.border,borderRadius:10,paddingHorizontal:11,paddingVertical:9,backgroundColor:c.background},chipActive:{borderColor:c.accent,backgroundColor:c.accentSoft},disabled:{opacity:.45},chipText:{color:c.text,fontSize:8,fontWeight:'900'},controlLabel:{color:c.textSecondary,fontSize:9,fontWeight:'900',letterSpacing:1,marginTop:4},action:{flexDirection:'row',alignItems:'center',gap:10,borderTopWidth:1,borderTopColor:c.border,paddingVertical:10},actionTitle:{color:c.text,fontSize:12,fontWeight:'900'},flagRow:{flexDirection:'row',alignItems:'center',gap:10,borderTopWidth:1,borderTopColor:c.border,paddingVertical:10},toggle:{borderWidth:1,borderColor:c.border,borderRadius:999,paddingHorizontal:10,paddingVertical:6},toggleOn:{backgroundColor:c.accentSoft,borderColor:c.accent},toggleText:{color:c.accentBright,fontSize:8,fontWeight:'900'},auditRow:{borderTopWidth:1,borderTopColor:c.border,paddingVertical:9},auditAction:{color:c.text,fontSize:10,fontWeight:'900'},message:{color:c.accentBright,fontSize:10},denied:{flex:1,backgroundColor:c.background,alignItems:'center',justifyContent:'center',padding:25}}
);