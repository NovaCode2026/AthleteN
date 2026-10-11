import 'expo-router/entry';
import { Platform } from 'react-native';

// The widget library is Android-only. Load it conditionally so iOS/web startup stays unaffected.
if (Platform.OS === 'android') {
  void import('react-native-android-widget').then(({ registerWidgetTaskHandler }) =>
    import('./src/widgets/widget-task-handler').then(({ widgetTaskHandler }) => {
      registerWidgetTaskHandler(widgetTaskHandler);
    }),
  );
}
