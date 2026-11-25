// @ts-nocheck
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Screen, Header, Section, Card, Empty, RefreshButton, c } from '@/components/mobile-ui';

const ADMIN_ROLES = ['support_admin', 'admin', 'super_admin'];
const PROOF_LABELS: Record<string, string> = {
  school_id: 'School ID',
  fee_receipt: 'School fee receipt',
  bonafide: 'Bonafide certificate',
};

export default function AdminVerificationsScreen() {
  const { profile } = useAuth();
  const allowed = ADMIN_ROLES.includes(String(profile?.role || ''));
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState('pending');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setMessage('');
    const { data, error } = await supabase
      .from('student_verifications')
      .select('id,user_id,document_type,file_path,status,reviewer_notes,reviewed_at,created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) setMessage(error.message);
    else setRows(data || []);
    setLoading(false);
  }, [allowed]);

  useEffect(() => { void load(); }, [load]);

  const visibleRows = useMemo(
    () => filter === 'all' ? rows : rows.filter(row => row.status === filter),
    [rows, filter],
  );
  const counts = useMemo(() => ({
    pending: rows.filter(row => row.status === 'pending').length,
    approved: rows.filter(row => row.status === 'approved').length,
    rejected: rows.filter(row => row.status === 'rejected').length,
  }), [rows]);

  async function openProof(row: any) {
    const path = String(row.file_path || '');
    const userId = String(row.user_id || '');
    if (!path || !userId || !path.startsWith(userId + '/') || path.includes('..')) {
      setMessage('The stored proof path does not match the verification owner.');
      return;
    }
    setMessage('');
    const { data, error } = await supabase.storage.from('verification-proofs').createSignedUrl(path, 300);
    if (error || !data?.signedUrl) {
      setMessage(error?.message || 'The proof file could not be opened.');
      return;
    }
    try {
      await Linking.openURL(data.signedUrl);
    } catch (openError) {
      setMessage(openError instanceof Error ? openError.message : 'The proof file could not be opened.');
    }
  }

  async function review(row: any, status: 'approved' | 'rejected') {
    const id = String(row.id || '');
    const reviewerNotes = String(notes[id] || '').trim();
    if (!id) return;
    if (status === 'rejected' && !reviewerNotes) {
      setMessage('Add a reviewer note before rejecting this request.');
      return;
    }
    if (status === 'approved' && !row.file_path) {
      setMessage('A proof file is required before approval.');
      return;
    }
    setBusy(id);
    setMessage('');
    const { error } = await supabase.rpc('admin_review_student_verification', {
      p_verification_id: id,
      p_status: status,
      p_reviewer_notes: reviewerNotes || null,
    });
    setBusy('');
    if (error) {
      setMessage(error.message);
      return;
    }
    setNotes(current => ({ ...current, [id]: '' }));
    setMessage(status === 'approved' ? 'Student proof approved and audit event recorded.' : 'Student proof rejected. The athlete can see the review note.');
    await load();
  }

  if (!allowed) {
    return <Screen><Header back eyebrow="ATHLETEN SECURITY" title="Verification Queue" subtitle="Platform Admin access is required." /><Card><Text style={{ color: c.danger, fontWeight: '900' }}>ACCESS RESTRICTED</Text><Text style={{ color: c.muted, fontSize: 10, marginTop: 5 }}>Only Support Admin, Admin or Super Admin can review Student proof requests.</Text></Card></Screen>;
  }

  return (
    <Screen>
      <Header back eyebrow="ATHLETEN TRUST" title="Student Verification" subtitle="Review Student plan proof securely. Every decision is audited." right={<RefreshButton onPress={() => void load()} busy={loading} />} />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {(['pending', 'approved', 'rejected', 'all'] as const).map(status => (
          <Pressable key={status} onPress={() => setFilter(status)} style={{ borderWidth: 1, borderColor: filter === status ? c.accent : c.border, backgroundColor: filter === status ? c.accentSoft : c.surface, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 }}>
            <Text style={{ color: filter === status ? c.accentBright : c.muted, fontSize: 9, fontWeight: '900' }}>{status === 'all' ? 'ALL' : status.toUpperCase()} {status === 'all' ? rows.length : counts[status]}</Text>
          </Pressable>
        ))}
      </View>
      <Section title={'REQUESTS · ' + visibleRows.length}>
        {loading ? <ActivityIndicator color={c.accentBright} /> : visibleRows.length ? visibleRows.map(row => {
          const id = String(row.id);
          const status = String(row.status || 'pending');
          const pending = status === 'pending';
          return (
            <Card key={id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: 13, fontWeight: '900' }}>{PROOF_LABELS[row.document_type] || row.document_type || 'Student proof'}</Text>
                  <Text style={{ color: c.muted, fontSize: 9, marginTop: 4 }}>Account {String(row.user_id || '').slice(0, 8)}… · Submitted {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}</Text>
                  {row.reviewed_at ? <Text style={{ color: c.muted, fontSize: 9, marginTop: 3 }}>Reviewed {new Date(row.reviewed_at).toLocaleString()}</Text> : null}
                </View>
                <View style={{ borderWidth: 1, borderColor: status === 'approved' ? c.accent : status === 'rejected' ? c.danger : c.border, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 }}>
                  <Text style={{ color: status === 'rejected' ? c.danger : c.accentBright, fontSize: 8, fontWeight: '900' }}>{status.toUpperCase()}</Text>
                </View>
              </View>
              {row.file_path ? <Pressable onPress={() => void openProof(row)} style={{ marginTop: 10, borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 10 }}><Text style={{ color: c.accentBright, fontSize: 9, fontWeight: '900' }}>OPEN PRIVATE PROOF · 5 MIN LINK</Text></Pressable> : <Text style={{ color: c.danger, fontSize: 9, marginTop: 8 }}>No proof file attached.</Text>}
              {pending ? <View style={{ gap: 8, marginTop: 10 }}>
                <Text style={{ color: c.muted, fontSize: 9, fontWeight: '900' }}>REVIEW NOTE · REQUIRED FOR REJECTION</Text>
                <TextInput value={notes[id] || ''} onChangeText={value => setNotes(current => ({ ...current, [id]: value }))} maxLength={1000} placeholder="Explain the review decision..." placeholderTextColor={c.muted} multiline style={{ minHeight: 70, borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.background, textAlignVertical: 'top', fontSize: 10 }} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable disabled={!!busy || !row.file_path} onPress={() => void review(row, 'approved')} style={{ flex: 1, backgroundColor: c.accent, borderRadius: 10, padding: 11, alignItems: 'center', opacity: busy || !row.file_path ? 0.5 : 1 }}>
                    <Text style={{ color: '#fff', fontSize: 9, fontWeight: '900' }}>{busy === id ? 'SAVING…' : 'APPROVE'}</Text>
                  </Pressable>
                  <Pressable disabled={!!busy || !String(notes[id] || '').trim()} onPress={() => void review(row, 'rejected')} style={{ flex: 1, borderWidth: 1, borderColor: c.danger, borderRadius: 10, padding: 11, alignItems: 'center', opacity: busy || !String(notes[id] || '').trim() ? 0.5 : 1 }}>
                    <Text style={{ color: c.danger, fontSize: 9, fontWeight: '900' }}>{busy === id ? 'SAVING…' : 'REJECT'}</Text>
                  </Pressable>
                </View>
              </View> : String(row.reviewer_notes || '').trim() ? <Text style={{ color: c.muted, fontSize: 10, lineHeight: 15, marginTop: 10 }}>Reviewer note: {row.reviewer_notes}</Text> : null}
            </Card>
          );
        }) : <Empty text="No verification requests in this view." />}
      </Section>
      {message ? <Text style={{ color: message.toLowerCase().includes('approved') || message.toLowerCase().includes('rejected') ? c.accentBright : c.danger, fontSize: 10, lineHeight: 15 }}>{message}</Text> : null}
    </Screen>
  );
}
