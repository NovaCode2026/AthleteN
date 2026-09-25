import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { supabase } from './supabase';

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }) });

const tokenKey = 'athleten.push-token';

export async function registerForNotifications(userId: string) {
  if (Platform.OS === 'web' || !Constants.isDevice) return null;
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('athleten-default', { name: 'AthleteN updates', importance: Notifications.AndroidImportance.DEFAULT, vibrationPattern: [0, 250, 250, 250], lightColor: '#4D96FF' });
  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return null;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId: Constants.expoConfig?.extra?.eas?.projectId })).data;
  await SecureStore.setItemAsync(tokenKey, token);
  await supabase.from('device_push_tokens').upsert({ user_id: userId, token, platform: Platform.OS, app_version: Constants.expoConfig?.version || null, last_seen_at: new Date().toISOString() }, { onConflict: 'token' });
  await Notifications.setBadgeCountAsync(0);
  return token;
}

export function attachNotificationListeners() {
  const received = Notifications.addNotificationReceivedListener(() => undefined);
  const response = Notifications.addNotificationResponseReceivedListener(event => {
    const route = event.notification.request.content.data?.route;
    if (typeof route === 'string' && route.startsWith('/')) router.push(route as never);
  });
  return () => { received.remove(); response.remove(); };
}
