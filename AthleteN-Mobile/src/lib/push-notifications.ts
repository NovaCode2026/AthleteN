import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';

export const ATHLETEN_NOTIFICATION_CHANNEL_ID = 'athleten-default-v2';

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
    });
  }

  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') return { token: null, reason: 'permission-denied' as const };

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  if (!projectId) return { token: null, reason: 'expo-project-id-missing' as const };

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

  const { error } = await supabase.from('push_tokens').upsert(
    {
      user_id: userId,
      expo_push_token: token,
      platform: Platform.OS,
      device_id: Device.modelName || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,expo_push_token' }
  );

  if (error) throw error;
  return { token, reason: 'registered' as const };
}

export function attachNotificationListeners() {
  const received = Notifications.addNotificationReceivedListener(() => undefined);
  const response = Notifications.addNotificationResponseReceivedListener((event) => {
    const route = event.notification.request.content.data?.route;
    if (typeof route === 'string' && route.startsWith('/')) {
      router.push(route as never);
    }
  });

  return () => {
    received.remove();
    response.remove();
  };
}
