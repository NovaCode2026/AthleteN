import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { registerForPushNotifications } from './push-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export { registerForPushNotifications };

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
