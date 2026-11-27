// Dynamic Expo config is kept in one file so AdMob and Firebase native
// configuration are always composed with the static app.json configuration.
const TEST_ANDROID_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const TEST_IOS_APP_ID = 'ca-app-pub-3940256099942544~1458002511';

function appId(value, fallback, platform) {
  const candidate = String(value || '').trim();
  if (!candidate) return fallback;
  const [publisher, app] = candidate.split('~');
  const isDigits = value => value.length > 0 && [...value].every(character => character >= '0' && character <= '9');
  if (!candidate.startsWith('ca-app-pub-') || candidate.split('~').length !== 2 ||
      !isDigits(publisher.slice('ca-app-pub-'.length)) || !isDigits(app)) {
    throw new Error('ADMOB_' + platform + '_APP_ID must be a valid AdMob application ID.');
  }
  return candidate;
}

function validateRewardedAdUnitId(value, androidAppId) {
  const candidate = String(value || '').trim();
  if (!candidate) return;

  const match = candidate.match(/^ca-app-pub-(\d+)\/(\d+)$/);
  if (!match) {
    throw new Error('EXPO_PUBLIC_ADMOB_REWARDED_AD_UNIT_ID must be a valid AdMob ad unit ID.');
  }

  const appPublisherId = androidAppId.split('~')[0].slice('ca-app-pub-'.length);
  if (match[1] !== appPublisherId) {
    throw new Error('The rewarded ad unit publisher ID must match ADMOB_ANDROID_APP_ID.');
  }
}

const ANDROID_APP_ID = appId(process.env.ADMOB_ANDROID_APP_ID, TEST_ANDROID_APP_ID, 'ANDROID');
const IOS_APP_ID = appId(process.env.ADMOB_IOS_APP_ID, TEST_IOS_APP_ID, 'IOS');
validateRewardedAdUnitId(process.env.EXPO_PUBLIC_ADMOB_REWARDED_AD_UNIT_ID, ANDROID_APP_ID);

module.exports = ({ config }) => {
  const bootDiagnostic = process.env.ATHLETEN_BOOT_DIAGNOSTIC === '1';
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_FILE ||
    process.env.GOOGLE_SERVICES_JSON_FILE;

  const diagnosticOnlyPlugins = new Set([
    'expo-router',
    'expo-web-browser',
    'expo-splash-screen',
    'expo-notifications',
    'expo-secure-store',
    'react-native-android-widget',
    'react-native-google-mobile-ads',
  ]);
  const basePlugins = config.plugins || [];
  const plugins = bootDiagnostic
    ? basePlugins.filter((plugin) => !diagnosticOnlyPlugins.has(Array.isArray(plugin) ? plugin[0] : plugin))
    : [
        ...basePlugins,
        [
          'react-native-google-mobile-ads',
          {
            androidAppId: ANDROID_APP_ID,
            iosAppId: IOS_APP_ID,
            // Prevent app measurement before the UMP consent flow is completed.
            delayAppMeasurementInit: true,
          },
        ],
      ];

  return {
    ...config,
    ...(bootDiagnostic ? {
      updates: {
        ...config.updates,
        enabled: false,
        checkAutomatically: 'NEVER',
        fallbackToCacheTimeout: 0,
      },
    } : {}),
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
    plugins,
  };
};
