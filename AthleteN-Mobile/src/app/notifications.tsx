import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Screen, Header, Card, Empty, c } from '@/components/mobile-ui';

type NotificationRow = {
  id: string;
  title: string | null;
  body: string | null;
  notification_type?: string | null;
  action_route?: string | null;
  created_at: string;
  read_at: string | null;
};

export default function NotificationsScreen() {
  const { session } = useAuth();
  const [rows, setRows] = useState<NotificationRow[]>([]);

  const load = useCallback(async () => {
    if (!session) return;
    const { data, error } = await supabase
      .from('notifications')
      .select('id,title,body,notification_type,action_route,created_at,read_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      console.warn('[AthleteN] could not load notifications', error.message);
      return;
    }
    setRows((data || []) as NotificationRow[]);
  }, [session]);

  useEffect(() => {
    if (!session) return;
    void load();

    void (async () => {
      const p = await Notifications.getPermissionsAsync();
      if (p.granted && Notifications.setBadgeCountAsync) {
        await Notifications.setBadgeCountAsync(0);
      }
    })();

    const channel = supabase
      .channel('mobile-notifications-' + session.user.id)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: 'user_id=eq.' + session.user.id,
        },
        () => {
          void load();
          // Remote Expo push is dispatched by the database notification trigger.
          // Realtime is used here only to refresh the in-app inbox; this avoids duplicate alerts.
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, session]);

  async function read(x: NotificationRow) {
    if (!session) return;
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', x.id)
      .eq('user_id', session.user.id);
    if (error) {
      console.warn('[AthleteN] could not mark notification read', error.message);
      return;
    }
    await load();
  }

  return (
    <Screen>
      <Header eyebrow="ATHLETEN CENTER" title="Notifications" subtitle="Competition, account and platform updates." />
      <>
        {rows.length ? (
          rows.map((x) => (
            <Pressable key={x.id} onPress={() => void read(x)}>
              <Card>
                <Text style={{ color: x.read_at ? c.muted : c.text, fontSize: 14, fontWeight: '900' }}>{x.title}</Text>
                {x.body ? <Text style={{ color: c.muted, fontSize: 11, lineHeight: 17 }}>{x.body}</Text> : null}
                <Text style={{ color: c.muted, fontSize: 8, marginTop: 3 }}>
                  {x.created_at ? new Date(x.created_at).toLocaleString() : '—'}{x.read_at ? ' • READ' : ' • NEW'}
                </Text>
              </Card>
            </Pressable>
          ))
        ) : (
          <Empty text="No notifications yet." />
        )}
      </>
    </Screen>
  );
}
