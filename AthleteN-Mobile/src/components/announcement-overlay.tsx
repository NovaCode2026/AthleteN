import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/theme';

const c = Colors.dark;

export default function AnnouncementOverlay() {
  const { session } = useAuth();
  const [item, setItem] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    if (!session) {
      setItem(null);
      setLoadError('');
      return;
    }

    try {
      // RLS is the audience boundary. Do not hard-code "all" here: an
      // athlete/coach/academy announcement must reach only its eligible readers.
      const { data: announcements, error: announcementsError } = await supabase
        .from('announcements')
        .select('id,title,body,published_at,audience')
        .not('published_at', 'is', null)
        .lte('published_at', new Date().toISOString())
        .order('published_at', { ascending: false })
        .limit(20);
      if (announcementsError) throw announcementsError;

      if (!announcements?.length) {
        setItem(null);
        setLoadError('');
        return;
      }

      const ids = announcements.map((announcement: any) => announcement.id);
      const { data: reads, error: readsError } = await supabase
        .from('announcement_reads')
        .select('announcement_id')
        .eq('user_id', session.user.id)
        .in('announcement_id', ids);
      if (readsError) throw readsError;

      const readSet = new Set((reads || []).map((read: any) => read.announcement_id));
      setItem(announcements.find((announcement: any) => !readSet.has(announcement.id)) || null);
      setLoadError('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Announcements could not be loaded.');
    }
  }, [session]);

  useEffect(() => {
    void load();
    if (!session) return;

    const channel = supabase
      .channel('announcements-' + session.user.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, (payload: any) => {
        const announcement = payload.new;
        if (!announcement?.published_at || new Date(announcement.published_at).getTime() > Date.now()) return;
        // Reload through RLS. This safely handles global and role-targeted notices.
        void load();
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [load, session]);

  async function close() {
    if (!session || !item || busy) return;
    setBusy(true);
    setLoadError('');
    try {
      const { error } = await supabase
        .from('announcement_reads')
        .upsert(
          { announcement_id: item.id, user_id: session.user.id },
          { onConflict: 'announcement_id,user_id' },
        );
      if (error) throw error;

      setItem(null);
      await load();
    } catch (error) {
      // Keep the announcement visible until its read receipt is actually saved.
      setLoadError(error instanceof Error ? error.message : 'The read receipt could not be saved. Please retry.');
    } finally {
      setBusy(false);
    }
  }

  if (!item && !loadError) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => { if (!item) setLoadError(''); }} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.72)', justifyContent: 'center', padding: 22 }}>
        <View style={{ backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.accent, borderRadius: 24, padding: 20, gap: 12 }}>
          <Text style={{ color: c.accentBright, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 }}>ATHLETEN ANNOUNCEMENT</Text>
          {item ? (
            <>
              <Text style={{ color: c.text, fontSize: 23, fontWeight: '900' }}>{item.title}</Text>
              <Text style={{ color: c.muted, fontSize: 12, lineHeight: 19 }}>{item.body}</Text>
              <Text style={{ color: c.muted, fontSize: 8 }}>{new Date(item.published_at).toLocaleString()}</Text>
            </>
          ) : (
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '800' }}>Announcements could not be loaded.</Text>
          )}

          {loadError ? <Text accessibilityRole="alert" style={{ color: c.danger, fontSize: 11 }}>{loadError}</Text> : null}

          {item ? (
            <Pressable disabled={busy} onPress={() => void close()} style={{ backgroundColor: c.accent, borderRadius: 13, paddingVertical: 14, alignItems: 'center', marginTop: 4, opacity: busy ? 0.6 : 1 }}>
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 1 }}>{busy ? 'SAVING…' : 'CLOSE ANNOUNCEMENT'}</Text>
            </Pressable>
          ) : (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable disabled={busy} onPress={() => setLoadError('')} style={{ flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 13, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ color: c.muted, fontSize: 10, fontWeight: '900' }}>DISMISS</Text>
              </Pressable>
              <Pressable disabled={busy} onPress={() => void load()} style={{ flex: 1, backgroundColor: c.accent, borderRadius: 13, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>RETRY</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
