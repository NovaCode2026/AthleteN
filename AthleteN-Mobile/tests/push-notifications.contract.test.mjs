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
  assert.match(authSource, /await withTimeout\(\s*unregisterPushNotifications\(userId\),\s*2500/);
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

test('message push taps resolve and open the exact conversation with a safe inbox fallback', () => {
  const listener = between(
    pushSource,
    'export function attachNotificationListeners',
    'return () => {'
  );

  assert.match(listener, /notificationData\?\.notificationType === 'message'/);
  assert.match(listener, /typeof data.messageId === 'string'/);
  assert.match(listener, /\.from\('messages'\)[\s\S]*?\.select\('conversation_id'\)[\s\S]*?\.eq\('id', data.messageId\)/);
  assert.match(listener, /pathname: '\/messages'[\s\S]*?params: \{ conversationId: String\(data\.conversation_id\) \}/);
  assert.match(listener, /router\.push\('\/notifications' as never\)/);
  assert.match(listener, /!route\.startsWith\('\/\/'\)/);
});


test('cold-start push taps are recovered and notification rows are marked read safely', () => {
  assert.match(pushSource, /getLastNotificationResponseAsync\(\)/);
  assert.match(pushSource, /clearLastNotificationResponseAsync\(\)/);
  assert.match(pushSource, /handledResponses\.has\(identifier\)/);
  assert.match(pushSource, /async function markNotificationRead/);
  assert.match(pushSource, /\.from\('notifications'\)[\s\S]*?\.update\(\{ read_at: new Date\(\)\.toISOString\(\) \}\)/);
  assert.match(pushSource, /\.eq\('id', notificationId\)[\s\S]*?\.is\('read_at', null\)/);
});


test('push taps deep-link to exact attendance and announcement source records', () => {
  assert.match(pushSource, /typeof data\?\.attendanceRecordId === 'string'/);
  assert.match(pushSource, /params: \{ attendanceRecordId: data\.attendanceRecordId \}/);
  assert.match(pushSource, /typeof data\?\.announcementId === 'string'/);
  assert.match(pushSource, /params: \{ announcementId: data\.announcementId \}/);
  const inbox = readFileSync(new URL('../src/app/notifications.tsx', import.meta.url), 'utf8');
  assert.match(inbox, /useLocalSearchParams/);
  assert.match(inbox, /routeParams\.attendanceRecordId/);
  assert.match(inbox, /routeParams\.announcementId/);
  assert.match(inbox, /attendance_record_id/);
});
