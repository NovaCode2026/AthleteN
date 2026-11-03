import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';

export const ATHLETEN_NOTIFICATION_CHANNEL_ID = 'athleten-default-v2';

let registeredPushToken: string | null = null;
let registeredPushUserId: string | null = null;

function getExpoProjectId() {
  return Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotifications(userId: string) {
  if (!Device.isDevice) return { token: null, reason: 'physical-device-required' as const };

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ATHLETEN_NOTIFICATION_CHANNEL_ID, {
      name: 'AthleteN',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
    });
  }

  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') return { token: null, reason: 'permission-denied' as const };

  const projectId = getExpoProjectId();

  if (!projectId) return { token: null, reason: 'expo-project-id-missing' as const };

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const { error } = await supabase.from('device_push_tokens').upsert(
    {
      user_id: userId,
      token,
      platform: Platform.OS,
      app_version: Constants.expoConfig?.version ?? null,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'token' }
  );

  if (error) throw error;
  registeredPushToken = token;
  registeredPushUserId = userId;
  return { token, reason: 'registered' as const };
}

export async function unregisterPushNotifications(userId: string) {
  if (!userId) return;

  let token = registeredPushUserId === userId ? registeredPushToken : null;
  if (!token && Device.isDevice) {
    const permission = await Notifications.getPermissionsAsync();
    const projectId = getExpoProjectId();
    if (permission.status === 'granted' && projectId) {
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    }
  }

  if (token) {
    const { error } = await supabase
      .from('device_push_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('token', token);
    if (error) throw error;
  }

  if (registeredPushUserId === userId) {
    registeredPushToken = null;
    registeredPushUserId = null;
  }
}

async function acknowledgeMessageDelivery(data: Record<string, unknown> | undefined) {
  const messageId = data?.messageId;
  if (typeof messageId !== 'string' || !messageId) return;
  const { error } = await supabase.rpc('mark_messages_delivered', { p_message_ids: [messageId] });
  if (error) {
    // The in-app message screen will retry the acknowledgement when it loads.
    console.warn('AthleteN could not acknowledge a push-delivered message yet.');
  }
}

export function attachNotificationListeners() {
  const received = Notifications.addNotificationReceivedListener((notification) => {
    void acknowledgeMessageDelivery(notification.request.content.data);
  });
  const response = Notifications.addNotificationResponseReceivedListener((event) => {
    const notificationData = event.notification.request.content.data;
    void acknowledgeMessageDelivery(notificationData);
    const route = notificationData?.route;
    if (typeof route === 'string' && route.startsWith('/')) {
      router.push(route as never);
    }
  });

  return () => {
    received.remove();
    response.remove();
  };
}
