const expoConfig = require('./app.json').expo;

// Google’s published sample app IDs keep development builds on test inventory.
// The publisher’s real App IDs must be supplied through the adult-managed EAS
// build environment after provider and privacy approval.
const TEST_ANDROID_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const TEST_IOS_APP_ID = 'ca-app-pub-3940256099942544~1458002511';

function appId(value, fallback, platform) {
  const candidate = String(value || '').trim();
  if (!candidate) return fallback;
  if (!/^ca-app-pub-\\d+~\\d+$/.test(candidate)) {
    throw new Error('ADMOB_' + platform + '_APP_ID must be a valid AdMob application ID.');
  }
  return candidate;
}

module.exports = () => ({
  ...expoConfig,
  plugins: [
    ...(expoConfig.plugins || []),
    [
      'react-native-google-mobile-ads',
      {
        androidAppId: appId(process.env.ADMOB_ANDROID_APP_ID, TEST_ANDROID_APP_ID, 'ANDROID'),
        iosAppId: appId(process.env.ADMOB_IOS_APP_ID, TEST_IOS_APP_ID, 'IOS'),
      },
    ],
  ],
});
