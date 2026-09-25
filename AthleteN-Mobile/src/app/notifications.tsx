import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { ATHLETEN_NOTIFICATION_CHANNEL_ID, registerForPushNotifications } from '@/lib/push-notifications';
import { Screen, Header, Card, Empty, c } from '@/components/mobile-ui';

export default function NotificationsScreen() {
  const { session } = useAuth();
  const channelRef = useRef<any>(null);
  const [rows, setRows] = useState<any[]>([]);

  const load = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase
      .from('notifications')
      .select('id,title,body,created_at,read_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setRows(data || []);
  }, [session]);

  useEffect(() => {
    if (!session) return;
    void load();
    void registerForPushNotifications(session.user.id).catch((error) => {
      console.warn('[AthleteN] push registration failed', error);
    });

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
        (payload) => {
          const n: any = payload.new;
          void load();
          void Notifications.scheduleNotificationAsync({
            content: {
              title: n?.title || 'AthleteN',
              body: n?.body || 'You have a new notification.',
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
              seconds: 1,
              repeats: false,
              channelId: ATHLETEN_NOTIFICATION_CHANNEL_ID,
            },
          });
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, session]);

  async function read(x: any) {
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', x.id)
      .eq('user_id', session?.user.id);
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
