import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pushSource = readFileSync(new URL('../src/lib/push-notifications.ts', import.meta.url), 'utf8');
const authSource = readFileSync(new URL('../src/context/AuthContext.tsx', import.meta.url), 'utf8');

const between = (source, start, end) => {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing source section: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing end section: ${end}`);
  return source.slice(startIndex, endIndex);
};

test('push registration is restricted to physical devices with granted permission and project ID', () => {
  const registration = between(
    pushSource,
    'export async function registerForPushNotifications',
    'export async function unregisterPushNotifications'
  );

  assert.match(registration, /if\s*\(!Device\.isDevice\)/);
  assert.match(registration, /Notifications\.getPermissionsAsync\(\)/);
  assert.match(registration, /Notifications\.requestPermissionsAsync\(\)/);
  assert.match(registration, /if\s*\(!projectId\)/);
  assert.match(registration, /Notifications\.getExpoPushTokenAsync\(\{\s*projectId\s*\}\)/);
  assert.match(registration, /options\.requestPermission === false/);
});

test('push tokens are upserted by token and late registration is cleaned up after account changes', () => {
  const registration = between(
    pushSource,
    'export async function registerForPushNotifications',
    'export async function unregisterPushNotifications'
  );

  assert.match(registration, /\.from\('device_push_tokens'\)\.upsert\(/);
  assert.match(registration, /onConflict:\s*'token'/);
  assert.ok(
    (registration.match(/generation !== pushRegistrationGeneration/g) ?? []).length >= 2,
    'registration must check cancellation before and after the token upsert'
  );
  assert.match(registration, /\.delete\(\)[\s\S]*?\.eq\('user_id',\s*userId\)[\s\S]*?\.eq\('token',\s*token\)/);
});

test('sign-out invalidates pending registration and deletes only the current account token', () => {
  const unregister = between(
    pushSource,
    'export async function unregisterPushNotifications',
    'async function acknowledgeMessageDelivery'
  );

  assert.match(unregister, /pushRegistrationGeneration\s*\+=\s*1/);
  assert.match(unregister, /\.delete\(\)[\s\S]*?\.eq\('user_id',\s*userId\)[\s\S]*?\.eq\('token',\s*token\)/);
  assert.match(authSource, /await unregisterPushNotifications\(userId\)/);
  assert.match(authSource, /await supabase\.auth\.signOut\(\)/);
});

test('push receipt acknowledgement and notification navigation validate payload fields', () => {
  assert.match(pushSource, /const messageId = data\?\.messageId/);
  assert.match(pushSource, /typeof messageId !== 'string'/);
  assert.match(pushSource, /supabase\.rpc\('mark_messages_delivered'/);
  assert.match(pushSource, /addNotificationReceivedListener/);
  assert.match(pushSource, /addNotificationResponseReceivedListener/);
  assert.match(pushSource, /route\.startsWith\('\/'\)/);
});

test('mobile auth rechecks push permission on foreground without prompting again', () => {
  assert.match(authSource, /import \{ AppState \} from 'react-native'/);
  assert.match(authSource, /AppState\.addEventListener\('change'/);
  assert.match(authSource, /if \(state === 'active'\) syncPushToken\(false\)/);
  assert.match(pushSource, /options\.requestPermission === false/);
});

test('mobile auth session installs notification registration and listener cleanup', () => {
  assert.match(authSource, /syncPushToken\(true\)/);
  assert.match(authSource, /attachNotificationListeners\(\)/);
  assert.match(authSource, /appStateSubscription\.remove\(\)/);
  assert.match(authSource, /removeNotificationListeners\?\.\(\)/);
});
