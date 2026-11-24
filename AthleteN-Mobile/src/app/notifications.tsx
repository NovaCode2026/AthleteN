import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Screen, Header, Card, Empty, c, Icon } from '@/components/mobile-ui';

type NotificationRow = {
  id: string;
  title: string | null;
  body: string | null;
  notification_type?: string | null;
  action_route?: string | null;
  message_id?: string | null;
  announcement_id?: string | null;
  created_at: string;
  read_at: string | null;
};
type AnnouncementSource = { title: string; body: string; published_at: string | null };

export default function NotificationsScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState<AnnouncementSource | null>(null);

  const load = useCallback(async () => {
    if (!session) { setRows([]); setLoading(false); return; }
    setLoading(true);
    const { data, error: queryError } = await supabase
      .from('notifications')
      .select('id,title,body,notification_type,action_route,message_id,announcement_id,created_at,read_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (queryError) {
      setError(queryError.message);
      console.warn('[AthleteN] could not load notifications', queryError.message);
    } else {
      const next = (data || []) as NotificationRow[];
      setRows(next);
      setError('');
      const unread = next.filter((row) => !row.read_at).length;
      try {
        const permissions = await Notifications.getPermissionsAsync();
        if (permissions.granted && Notifications.setBadgeCountAsync) {
          await Notifications.setBadgeCountAsync(unread);
        }
      } catch { /* The in-app unread state remains authoritative. */ }
    }
    setLoading(false);
  }, [session]);

  useEffect(() => {
    if (!session) return;
    void load();
    const channel = supabase
      .channel('mobile-notifications-' + session.user.id)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + session.user.id },
        () => { void load(); }
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, session]);

  async function markRead(row: NotificationRow) {
    if (!session || row.read_at) return;
    const { error: updateError } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('user_id', session.user.id);
    if (updateError) throw updateError;
    setRows((current) => current.map((item) => item.id === row.id ? { ...item, read_at: new Date().toISOString() } : item));
  }

  async function openNotification(row: NotificationRow) {
    if (!session || busy) return;
    setBusy(true);
    setError('');
    try {
      await markRead(row);
      if (row.message_id) {
        const { data, error: sourceError } = await supabase
          .from('messages')
          .select('conversation_id')
          .eq('id', row.message_id)
          .maybeSingle();
        if (sourceError) throw sourceError;
        if (data?.conversation_id) {
          await load();
          router.push({ pathname: '/messages', params: { conversationId: String(data.conversation_id) } } as never);
          return;
        }
        setError('The original message is no longer available. It may have been deleted.');
        await load();
        return;
      }
      if (row.announcement_id) {
        const { data, error: sourceError } = await supabase
          .from('announcements')
          .select('id,title,body,published_at')
          .eq('id', row.announcement_id)
          .maybeSingle();
        if (sourceError) throw sourceError;
        if (!data) setError('The original announcement is no longer available.');
        else setAnnouncement({ title: String(data.title || 'Announcement'), body: String(data.body || ''), published_at: data.published_at || null });
        await load();
        return;
      }
      const route = String(row.action_route || '');
      if (route.startsWith('/') && !route.startsWith('//') && !route.startsWith('/notifications')) {
        await load();
        router.push(route as never);
        return;
      }
      if (String(row.notification_type || '').toLowerCase() === 'training') {
        setError('This older attendance alert has no saved attendance-record link, so the exact original session cannot be opened.');
      } else {
        setError('This notification does not have a linked source record yet.');
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Notification could not be opened.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteNotification(row: NotificationRow) {
    if (!session || busy) return;
    Alert.alert('Delete notification?', 'This removes only the notification. The original message, announcement or athlete record will remain.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { void (async () => {
        setBusy(true);
        const { error: deleteError } = await supabase.from('notifications').delete().eq('id', row.id).eq('user_id', session.user.id);
        if (deleteError) setError(deleteError.message);
        else setRows((current) => current.filter((item) => item.id !== row.id));
        setBusy(false);
        await load();
      })(); } },
    ]);
  }

  async function markAllRead() {
    if (!session || busy || !rows.some((row) => !row.read_at)) return;
    setBusy(true);
    const { error: updateError } = await supabase.from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', session.user.id)
      .is('read_at', null);
    if (updateError) setError(updateError.message);
    setBusy(false);
    await load();
  }

  function clearAll() {
    if (!session || busy || !rows.length) return;
    Alert.alert('Clear all notifications?', 'All notification entries will be deleted. Original messages, announcements and athlete records will not be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear all', style: 'destructive', onPress: () => { void (async () => {
        setBusy(true);
        const { error: deleteError } = await supabase.from('notifications').delete().eq('user_id', session.user.id);
        if (deleteError) setError(deleteError.message);
        setBusy(false);
        await load();
      })(); } },
    ]);
  }

  const unread = rows.filter((row) => !row.read_at).length;

  return (
    <Screen>
      <Header eyebrow="ATHLETEN CENTER" title="Notifications" subtitle={unread ? unread + ' unread · Competition, account and platform updates.' : 'Competition, account and platform updates.'} right={<Pressable accessibilityRole="button" accessibilityLabel="Refresh notifications" onPress={() => void load()} hitSlop={8}><Icon name="refresh" size={19} color={c.accentBright}/></Pressable>} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable accessibilityRole="button" onPress={() => void markAllRead()} disabled={busy || unread === 0} style={{ flex: 1, borderRadius: 11, paddingVertical: 11, paddingHorizontal: 10, alignItems: 'center', backgroundColor: unread ? c.accent : c.surface, opacity: busy || unread === 0 ? 0.55 : 1 }}>
          <Text style={{ color: unread ? '#fff' : c.muted, fontSize: 9, fontWeight: '900' }}>MARK ALL READ</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={clearAll} disabled={busy || rows.length === 0} style={{ flex: 1, borderRadius: 11, paddingVertical: 11, paddingHorizontal: 10, alignItems: 'center', borderWidth: 1, borderColor: c.danger, backgroundColor: c.surface, opacity: busy || rows.length === 0 ? 0.55 : 1 }}>
          <Text style={{ color: c.danger, fontSize: 9, fontWeight: '900' }}>CLEAR ALL</Text>
        </Pressable>
      </View>
      {error ? <Card><Text accessibilityRole="alert" style={{ color: c.warning, fontSize: 11, lineHeight: 17 }}>{error}</Text></Card> : null}
      {loading ? <Card><ActivityIndicator color={c.accentBright}/></Card> : rows.length ? rows.map((row) => (
        <Card key={row.id} style={{ gap: 9, borderColor: row.read_at ? c.border : c.accent }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9 }}>
            <Pressable accessibilityRole="button" accessibilityLabel={'Open notification: ' + (row.title || 'AthleteN notification')} onPress={() => void openNotification(row)} disabled={busy} style={{ flex: 1, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ color: row.read_at ? c.muted : c.text, fontSize: 14, fontWeight: '900', flex: 1 }}>{row.title || 'AthleteN notification'}</Text>
                <View style={{ backgroundColor: row.read_at ? c.background : c.accentSoft, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={{ color: row.read_at ? c.muted : c.accentBright, fontSize: 8, fontWeight: '900' }}>{row.read_at ? 'READ' : 'NEW'}</Text>
                </View>
              </View>
              {row.body ? <Text style={{ color: c.muted, fontSize: 11, lineHeight: 17 }}>{row.body}</Text> : null}
              <Text style={{ color: c.muted, fontSize: 8, marginTop: 3 }}>{row.created_at ? new Date(row.created_at).toLocaleString() : '—'}</Text>
              <Text style={{ color: c.accentBright, fontSize: 9, fontWeight: '900' }}>OPEN SOURCE  →</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={'Delete notification: ' + (row.title || 'AthleteN notification')} onPress={() => deleteNotification(row)} disabled={busy} hitSlop={8} style={{ padding: 8 }}>
              <Icon name="delete" size={17} color={c.danger}/>
            </Pressable>
          </View>
        </Card>
      )) : <Empty text="No notifications yet."/>}
      <Modal visible={!!announcement} transparent animationType="fade" onRequestClose={() => setAnnouncement(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.accent, borderRadius: 20, padding: 18, gap: 12 }}>
            <Text style={{ color: c.accentBright, fontSize: 9, fontWeight: '900', letterSpacing: 1.3 }}>ORIGINAL ANNOUNCEMENT</Text>
            <Text style={{ color: c.text, fontSize: 21, fontWeight: '900' }}>{announcement?.title}</Text>
            <Text style={{ color: c.muted, fontSize: 12, lineHeight: 19 }}>{announcement?.body}</Text>
            {announcement?.published_at ? <Text style={{ color: c.muted, fontSize: 9 }}>{new Date(announcement.published_at).toLocaleString()}</Text> : null}
            <Pressable onPress={() => setAnnouncement(null)} style={{ backgroundColor: c.accent, borderRadius: 11, padding: 13, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 9, fontWeight: '900' }}>CLOSE</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
