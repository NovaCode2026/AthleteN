import 'expo-router/entry';
import { Platform } from 'react-native';

// Android home-screen widget registration is optional. It must never block or
// destabilize the Expo Router application entry if the native module is absent.
if (Platform.OS === 'android') {
  void import('react-native-android-widget')
    .then(({ registerWidgetTaskHandler }) =>
      import('./src/widgets/widget-task-handler').then(({ widgetTaskHandler }) => {
        registerWidgetTaskHandler(widgetTaskHandler);
      }),
    )
    .catch((error) => {
      console.warn('[AthleteN] widget task registration skipped:', error instanceof Error ? error.message : error);
    });
}
