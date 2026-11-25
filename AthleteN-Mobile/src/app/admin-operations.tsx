import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

const c = Colors.dark;
const ADMIN_ROLES = ['support_admin', 'admin', 'super_admin'];
type Overview = {
  users: number | null; athletes: number | null; coaches: number | null; academies: number | null; admins: number | null;
  pending_student_verifications: number | null; active_subscriptions: number | null; open_support_tickets: number | null;
  restricted_accounts: number | null; verified_athletes: number | null; verified_coaches: number | null; verified_academies: number | null;
};
type PermissionPayload = { base_role: string; permission_role: string; permissions: string[] };
type AthleteVerificationReview = { user_id:string; full_name:string|null; username:string|null; verified_athlete:boolean; created_at:string };
type VerificationRequest = {
  id: string; user_id: string; full_name: string | null; username: string | null;
  document_type: string; file_path: string | null; status: string; created_at: string;
};
type AccountResult = { user_id: string; full_name: string | null; username: string | null; role: string; plan_id: string; created_at: string };
type AccessRow = { user_id: string; full_name: string | null; username: string | null; status: string; reason: string; expires_at: string | null; updated_at: string };
type AuditRow = { id: string; actor_user_id: string | null; target_user_id: string | null; action: string; reason: string | null; created_at: string };
type AssignmentRow = { admin_user_id: string; full_name: string | null; username: string | null; base_role: string; permission_role: string | null; updated_at: string };

export default function AdminOperationsScreen() {
  const router = useRouter();
  const { profile, session } = useAuth();
  const role = String(profile?.role || '');
  const allowed = ADMIN_ROLES.includes(role);
  const [permission, setPermission] = useState<PermissionPayload | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [queue, setQueue] = useState<VerificationRequest[]>([]);
  const [athleteQuery, setAthleteQuery] = useState('');
  const [athleteReviews, setAthleteReviews] = useState<AthleteVerificationReview[]>([]);
  const [athleteReasons, setAthleteReasons] = useState<Record<string,string>>({});
  const [accounts, setAccounts] = useState<AccountResult[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<AccountResult | null>(null);
  const [accessRows, setAccessRows] = useState<AccessRow[]>([]);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [assignmentRows, setAssignmentRows] = useState<AssignmentRow[]>([]);
  const [query, setQuery] = useState('');
  const [accountReason, setAccountReason] = useState('');
  const [accountStatus, setAccountStatus] = useState('restricted');
  const [accountExpiry, setAccountExpiry] = useState('');
  const [reviewReasons, setReviewReasons] = useState<Record<string,string>>({});
  const [assignmentUserId, setAssignmentUserId] = useState('');
  const [assignmentScope, setAssignmentScope] = useState('support');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const permissions = permission?.permissions || [];
  const has = (key: string) => role === 'super_admin' || permissions.includes('*') || permissions.includes(key);
  const canReadOverview = ['platform.read','analytics.read','billing.read','verification.read','support.read'].some(has);
  const canVerify = has('verification.read');
  const canManageAthleteVerification = has('verification.athlete.manage');
  const canManageAccounts = has('account.manage');
  const canAssign = role === 'super_admin' && has('platform.roles.manage');
  const canReadAudit = has('audit.read');

  const load = useCallback(async () => {
    if (!allowed || !session) return;
    setMessage('');
    const permissionResult = await supabase.rpc('get_my_platform_admin_permissions');
    if (permissionResult.error) { setMessage(permissionResult.error.message); return; }
    const loadedPermission = permissionResult.data as PermissionPayload;
    setPermission(loadedPermission);
    const keys = loadedPermission.permissions || [];
    const allowedTo = (key: string) => loadedPermission.base_role === 'super_admin' || keys.includes('*') || keys.includes(key);
    const tasks: Promise<void>[] = [];
    if (['platform.read','analytics.read','billing.read','verification.read','support.read'].some(allowedTo)) {
      tasks.push((async () => {
        const r = await supabase.rpc('get_platform_admin_overview');
        if (r.error) throw r.error;
        setOverview(r.data as Overview);
      })());
    } else setOverview(null);
    if (allowedTo('verification.read')) {
      tasks.push((async () => {
        const r = await supabase.rpc('get_student_verification_queue');
        if (r.error) throw r.error;
        setQueue((r.data || []) as VerificationRequest[]);
      })());
    } else setQueue([]);
    if (allowedTo('account.manage')) {
      tasks.push((async () => {
        const r = await supabase.rpc('get_platform_account_access_controls');
        if (r.error) throw r.error;
        setAccessRows((r.data || []) as AccessRow[]);
      })());
    } else setAccessRows([]);
    if (allowedTo('audit.read')) {
      tasks.push((async () => {
        const r = await supabase.rpc('get_platform_admin_audit', { p_limit: 30 });
        if (r.error) throw r.error;
        setAuditRows((r.data || []) as AuditRow[]);
      })());
    } else setAuditRows([]);
    if (allowedTo('platform.roles.manage')) {
      tasks.push((async () => {
        const r = await supabase.rpc('get_platform_admin_assignments');
        if (r.error) throw r.error;
        setAssignmentRows((r.data || []) as AssignmentRow[]);
      })());
    } else setAssignmentRows([]);
    try { await Promise.all(tasks); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Some admin operations could not be loaded.'); }
  }, [allowed, session]);

  useEffect(() => { void load(); }, [load]);

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  async function openProof(row: VerificationRequest) {
    if (!row.file_path || !canVerify) return;
    setBusy(true); setMessage('');
    const { data, error } = await supabase.storage.from('verification-proofs').createSignedUrl(row.file_path, 120);
    setBusy(false);
    if (error || !data?.signedUrl) { setMessage(error?.message || 'Proof preview is unavailable.'); return; }
    await Linking.openURL(data.signedUrl);
  }

  async function review(row: VerificationRequest, status: 'approved' | 'rejected') {
    const reason = (reviewReasons[row.id] || '').trim();
    if (reason.length < 5 || reason.length > 500) { setMessage('Enter a decision reason between 5 and 500 characters.'); return; }
    setBusy(true); setMessage('');
    const { error } = await supabase.rpc('admin_review_student_verification', {
      p_request_id: row.id, p_status: status, p_reason: reason,
    });
    setBusy(false);
    if (error) { setMessage(error.message); return; }
    setReviewReasons((v) => ({ ...v, [row.id]: '' }));
    setMessage(status === 'approved' ? 'Student proof approved and audited.' : 'Student proof rejected and feedback recorded.');
    await load();
  }

  async function searchAthleteReviews() {
    if (athleteQuery.trim().length < 2) { setMessage('Enter at least two characters to search Athlete accounts.'); return; }
    setBusy(true); setMessage('');
    const { data, error } = await supabase.rpc('search_athlete_verification_reviews', {
      p_query: athleteQuery.trim(), p_limit: 20,
    });
    setBusy(false);
    if (error) { setMessage(error.message); return; }
    setAthleteReviews((data || []) as AthleteVerificationReview[]);
  }

  async function setAthleteVerified(row: AthleteVerificationReview, verified: boolean) {
    if (!canManageAthleteVerification) return;
    const reason = (athleteReasons[row.user_id] || '').trim();
    if (reason.length < 5 || reason.length > 500) { setMessage('Record the evidence reviewed and decision reason (5–500 characters).'); return; }
    setBusy(true); setMessage('');
    const { error } = await supabase.rpc('admin_set_athlete_verified', {
      p_user_id: row.user_id, p_verified: verified, p_reason: reason,
    });
    setBusy(false);
    if (error) { setMessage(error.message); return; }
    setAthleteReasons((values)=>({...values,[row.user_id]:''}));
    setMessage(verified ? 'Athlete verification granted and audited.' : 'Athlete verification revoked and audited.');
    await searchAthleteReviews();
  }

  async function searchAccounts() {
    if (query.trim().length < 2) { setMessage('Enter at least two characters to search.'); return; }
    setBusy(true); setMessage('');
    const { data, error } = await supabase.rpc('search_platform_accounts', { p_query: query.trim(), p_limit: 20 });
    setBusy(false);
    if (error) { setMessage(error.message); return; }
    setAccounts((data || []) as AccountResult[]);
  }

  async function changeAccess() {
    if (!selectedAccount) { setMessage('Select an account first.'); return; }
    const reason = accountReason.trim();
    if (reason.length < 5 || reason.length > 500) { setMessage('Enter an account-access reason between 5 and 500 characters.'); return; }
    let expiresAt: string | null = null;
    if (accountExpiry.trim()) {
      const parsed = new Date(accountExpiry);
      if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) { setMessage('Expiry must be a valid future date and time.'); return; }
      expiresAt = parsed.toISOString();
    }
    if (accountStatus === 'restricted' && !expiresAt) { setMessage('A temporary restriction requires a future expiry.'); return; }
    setBusy(true); setMessage('');
    const { error } = await supabase.rpc('admin_set_platform_account_access', {
      p_user_id: selectedAccount.user_id, p_status: accountStatus, p_reason: reason, p_expires_at: expiresAt,
    });
    setBusy(false);
    if (error) { setMessage(error.message); return; }
    setMessage('Account access updated and audited.');
    setSelectedAccount(null); setAccountReason(''); setAccountExpiry(''); setAccounts([]);
    await load();
  }

  async function assignScope() {
    if (!assignmentUserId.trim()) { setMessage('Enter an Admin or Support Admin user ID.'); return; }
    setBusy(true); setMessage('');
    const { error } = await supabase.rpc('admin_assign_platform_role', {
      p_admin_user_id: assignmentUserId.trim(), p_permission_role: assignmentScope === 'full' ? null : assignmentScope,
    });
    setBusy(false);
    if (error) { setMessage(error.message); return; }
    setMessage('Administrator permission scope updated and audited.');
    setAssignmentUserId('');
    await load();
  }

  if (!allowed) {
    return <SafeAreaView style={s.screen}><View style={s.denied}><Text style={s.kicker}>ATHLETEN SECURITY</Text><Text style={s.title}>Admin access required</Text><Text style={s.meta}>This workspace requires an authorised platform administrator account.</Text></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.accentBright} />}>
        <Pressable onPress={() => router.back()}><Text style={s.back}>‹ BACK</Text></Pressable>
        <Text style={s.kicker}>PLATFORM GOVERNANCE</Text>
        <Text style={s.title}>Admin Operations</Text>
        <Text style={s.meta}>Server-authorised administration, verification reviews, account access controls and audit.</Text>
        {!permission ? <ActivityIndicator color={c.accentBright}/> : <View style={s.scope}><Text style={s.scopeText}>{permission.permission_role.toUpperCase()} · {permission.base_role.toUpperCase()}</Text></View>}
        {overview ? <View style={s.grid}>{[
          ['USERS',overview.users],['ATHLETES',overview.athletes],['COACHES',overview.coaches],['ACADEMIES',overview.academies],
          ['VERIFIED ATHLETES',overview.verified_athletes],['PENDING PROOFS',overview.pending_student_verifications],['ACTIVE PLANS',overview.active_subscriptions],
          ['OPEN SUPPORT',overview.open_support_tickets],['RESTRICTED',overview.restricted_accounts],
          ['COACH EMAIL VERIFIED',overview.verified_coaches],['ACADEMY VERIFIED',overview.verified_academies],
        ].filter(([,value])=>value!==null&&value!==undefined).map(([label,value])=><Stat key={String(label)} label={String(label)} value={Number(value)}/>)}</View> : null}

        {canVerify ? <View style={s.panel}>
          <Text style={s.section}>ATHLETE PROFILE VERIFICATION</Text>
          <Text style={s.meta}>Search individual Athlete accounts. Grant or revoke the verified badge only after reviewing credible supporting records. Every decision requires a reason and is audited. Student-plan proof review is a separate workflow below.</Text>
          <TextInput value={athleteQuery} onChangeText={setAthleteQuery} placeholder="Athlete name, username or user ID prefix" placeholderTextColor={c.muted} style={s.input}/>
          <Pressable style={s.secondaryButton} disabled={busy} onPress={()=>void searchAthleteReviews()}><Text style={s.buttonText}>SEARCH ATHLETES</Text></Pressable>
          {athleteReviews.map((row)=><View key={row.user_id} style={s.request}>
            <Text style={s.userName}>{row.full_name || 'Athlete account'} · {row.verified_athlete ? 'VERIFIED' : 'NOT VERIFIED'}</Text>
            <Text style={s.meta}>@{row.username || 'username not set'} · Joined {new Date(row.created_at).toLocaleDateString()}</Text>
            <Text style={s.code}>{row.user_id}</Text>
            {canManageAthleteVerification ? <>
              <TextInput value={athleteReasons[row.user_id] || ''} onChangeText={(value)=>setAthleteReasons((values)=>({...values,[row.user_id]:value}))} placeholder="Evidence reviewed / reason (5–500 characters)" placeholderTextColor={c.muted} style={[s.input,s.multiline]} multiline maxLength={500}/>
              <View style={s.actions}>
                <Pressable style={[s.primaryButton,row.verified_athlete&&s.disabled]} disabled={busy||row.verified_athlete} onPress={()=>void setAthleteVerified(row,true)}><Text style={s.buttonText}>VERIFY</Text></Pressable>
                <Pressable style={[s.dangerButton,!row.verified_athlete&&s.disabled]} disabled={busy||!row.verified_athlete} onPress={()=>void setAthleteVerified(row,false)}><Text style={s.buttonText}>REVOKE</Text></Pressable>
              </View>
            </> : <Text style={s.meta}>Read-only review scope. A Verification Admin must make the decision.</Text>}
          </View>)}
        </View> : null}

        {canVerify ? <View style={s.panel}>
          <Text style={s.section}>STUDENT VERIFICATION QUEUE</Text>
          <Text style={s.meta}>Student plan proof reviews only. Coach and Academy checks continue to use their existing account-email and verified-workspace gates.</Text>
          {queue.map((row)=><View key={row.id} style={s.request}>
            <Text style={s.userName}>{row.full_name || 'Athlete account'}</Text>
            <Text style={s.meta}>@{row.username || 'username not set'} · {row.document_type.replace(/_/g,' ')} · {new Date(row.created_at).toLocaleDateString()}</Text>
            <Text style={s.code}>{row.user_id}</Text>
            <Pressable style={s.secondaryButton} disabled={busy || !row.file_path} onPress={()=>void openProof(row)}><Text style={s.buttonText}>OPEN PRIVATE PROOF</Text></Pressable>
            <TextInput value={reviewReasons[row.id] || ''} onChangeText={(value)=>setReviewReasons((v)=>({...v,[row.id]:value}))} placeholder="Evidence-based reason (5–500 characters)" placeholderTextColor={c.muted} style={[s.input,s.multiline]} multiline maxLength={500}/>
            <View style={s.actions}>
              <Pressable style={s.primaryButton} disabled={busy} onPress={()=>void review(row,'approved')}><Text style={s.buttonText}>APPROVE</Text></Pressable>
              <Pressable style={s.dangerButton} disabled={busy} onPress={()=>void review(row,'rejected')}><Text style={s.buttonText}>REJECT</Text></Pressable>
            </View>
          </View>)}
          {!queue.length ? <Text style={s.meta}>No pending Student proof requests.</Text> : null}
        </View> : null}

        {canAssign ? <View style={s.panel}>
          <Text style={s.section}>ADMINISTRATOR PERMISSIONS</Text>
          <Text style={s.meta}>Assign a limited scope to an existing Admin or Support Admin. Super Admin accounts cannot be scoped here.</Text>
          <TextInput value={assignmentUserId} onChangeText={setAssignmentUserId} placeholder="Admin user UUID" placeholderTextColor={c.muted} style={s.input} autoCapitalize="none"/>
          <Text style={s.controlLabel}>SCOPE</Text>
          <View style={s.chips}>{['support','verification','finance','operations','full'].map((scope)=><Pressable key={scope} onPress={()=>setAssignmentScope(scope)} style={[s.chip,assignmentScope===scope&&s.chipActive]}><Text style={s.chipText}>{scope.toUpperCase()}</Text></Pressable>)}</View>
          <Pressable style={s.primaryButton} disabled={busy} onPress={()=>void assignScope()}><Text style={s.buttonText}>SAVE PERMISSIONS</Text></Pressable>
          {assignmentRows.map((row)=><View key={row.admin_user_id} style={s.auditRow}><Text style={s.userName}>{row.full_name || row.username || row.admin_user_id}</Text><Text style={s.meta}>{row.base_role} · {row.permission_role || 'full'}</Text></View>)}
        </View> : null}

        {canManageAccounts ? <View style={s.panel}>
          <Text style={s.section}>ACCOUNT ACCESS CONTROLS</Text>
          <Text style={s.meta}>Restrictions block core application data through database access rules. This does not forcibly terminate authentication sessions; profile and support access remain available.</Text>
          <TextInput value={query} onChangeText={setQuery} placeholder="Search name, username or user ID" placeholderTextColor={c.muted} style={s.input}/>
          <Pressable style={s.secondaryButton} disabled={busy} onPress={()=>void searchAccounts()}><Text style={s.buttonText}>SEARCH ACCOUNTS</Text></Pressable>
          {accounts.map((row)=><Pressable key={row.user_id} onPress={()=>setSelectedAccount(row)} style={[s.userRow,selectedAccount?.user_id===row.user_id&&s.selected]}><View style={{flex:1}}><Text style={s.userName}>{row.full_name || 'Unnamed account'}</Text><Text style={s.meta}>@{row.username || 'no username'} · {row.role} · {row.plan_id}</Text><Text style={s.code}>{row.user_id}</Text></View></Pressable>)}
          {selectedAccount ? <View style={s.request}>
            <Text style={s.userName}>Selected: {selectedAccount.full_name || selectedAccount.user_id}</Text>
            <View style={s.chips}>{['restricted','suspended','active'].map((status)=><Pressable key={status} onPress={()=>setAccountStatus(status)} style={[s.chip,accountStatus===status&&s.chipActive]}><Text style={s.chipText}>{status.toUpperCase()}</Text></Pressable>)}</View>
            <TextInput value={accountExpiry} onChangeText={setAccountExpiry} placeholder="Expiry ISO date (required for restricted)" placeholderTextColor={c.muted} style={s.input} autoCapitalize="none"/>
            <TextInput value={accountReason} onChangeText={setAccountReason} placeholder="Reason (5–500 characters)" placeholderTextColor={c.muted} style={[s.input,s.multiline]} multiline maxLength={500}/>
            <Pressable style={s.dangerButton} disabled={busy} onPress={()=>void changeAccess()}><Text style={s.buttonText}>{accountStatus==='active'?'RESTORE ACCESS':'APPLY ACCESS CONTROL'}</Text></Pressable>
          </View> : null}
          {accessRows.map((row)=><View key={row.user_id} style={s.auditRow}><Text style={s.userName}>{row.full_name || row.username || row.user_id} · {row.status}</Text><Text style={s.meta}>{row.reason}</Text><Text style={s.meta}>{row.expires_at ? new Date(row.expires_at).toLocaleString() : 'No expiry'}</Text></View>)}
        </View> : null}

        {canReadAudit ? <View style={s.panel}>
          <Text style={s.section}>ADMINISTRATIVE AUDIT TRAIL</Text>
          {auditRows.map((row)=><View key={row.id} style={s.auditRow}><Text style={s.userName}>{row.action}</Text><Text style={s.meta}>{new Date(row.created_at).toLocaleString()} · actor {row.actor_user_id?.slice(0,8)||'—'} · target {row.target_user_id?.slice(0,8)||'—'}</Text><Text style={s.meta}>{row.reason || 'No reason supplied'}</Text></View>)}
          {!auditRows.length ? <Text style={s.meta}>No audit events available.</Text> : null}
        </View> : null}

        {role==='super_admin' ? <Text style={s.footnote}>Subscription activation, payment settlement and refunds remain provider/webhook-controlled. This workspace cannot mark payments successful manually. Age and guardian approval remains in its existing separate consent process.</Text> : null}
        {message ? <Text style={s.message}>{message}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <View style={s.stat}><Text style={s.statValue}>{value.toLocaleString()}</Text><Text style={s.statLabel}>{label}</Text></View>;
}

const s = StyleSheet.create({
  screen:{flex:1,backgroundColor:c.background},content:{padding:18,paddingBottom:70,gap:12},
  back:{color:c.accentBright,fontSize:11,fontWeight:'900',letterSpacing:1},kicker:{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:1.7},
  title:{color:c.text,fontSize:29,fontWeight:'900',marginTop:2},meta:{color:c.muted,fontSize:10,lineHeight:16},
  scope:{alignSelf:'flex-start',borderWidth:1,borderColor:c.borderStrong,borderRadius:999,paddingHorizontal:11,paddingVertical:7,backgroundColor:c.surface},
  scopeText:{color:c.accentBright,fontSize:8,fontWeight:'900',letterSpacing:1},
  grid:{flexDirection:'row',flexWrap:'wrap',gap:8},stat:{width:'31%',minWidth:100,backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong,borderRadius:13,padding:11},
  statValue:{color:c.text,fontSize:21,fontWeight:'900'},statLabel:{color:c.muted,fontSize:7,fontWeight:'900',letterSpacing:.7,marginTop:4},
  panel:{backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong,borderRadius:18,padding:14,gap:10},
  section:{color:c.muted,fontSize:9,fontWeight:'900',letterSpacing:1.4},request:{padding:11,borderWidth:1,borderColor:c.border,borderRadius:12,gap:8,backgroundColor:c.background},
  userName:{color:c.text,fontSize:12,fontWeight:'900'},code:{color:c.accentBright,fontSize:8,fontWeight:'800',marginTop:3},
  input:{backgroundColor:c.background,borderWidth:1,borderColor:c.border,borderRadius:10,color:c.text,padding:11,fontSize:11},
  multiline:{minHeight:65,textAlignVertical:'top'},controlLabel:{color:c.textSecondary,fontSize:8,fontWeight:'900',letterSpacing:1},
  actions:{flexDirection:'row',gap:8},primaryButton:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:c.accent,borderRadius:10,paddingVertical:12},
  secondaryButton:{alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:c.borderStrong,borderRadius:10,paddingVertical:11},
  dangerButton:{alignItems:'center',justifyContent:'center',backgroundColor:'#632c39',borderWidth:1,borderColor:'#a64d62',borderRadius:10,paddingVertical:12},
  buttonText:{color:'#fff',fontSize:8,fontWeight:'900',letterSpacing:.6},chips:{flexDirection:'row',flexWrap:'wrap',gap:6},
  chip:{borderWidth:1,borderColor:c.border,borderRadius:9,paddingHorizontal:9,paddingVertical:8,backgroundColor:c.background},
  chipActive:{borderColor:c.accent,backgroundColor:c.accentSoft},disabled:{opacity:0.45},chipText:{color:c.text,fontSize:8,fontWeight:'900'},
  userRow:{borderTopWidth:1,borderTopColor:c.border,paddingVertical:10},selected:{backgroundColor:c.accentSoft,borderRadius:9,paddingHorizontal:8},
  auditRow:{borderTopWidth:1,borderTopColor:c.border,paddingVertical:8,gap:3},footnote:{color:c.muted,fontSize:9,lineHeight:15},
  message:{color:c.accentBright,fontSize:10},denied:{flex:1,alignItems:'center',justifyContent:'center',padding:25,backgroundColor:c.background}
});
