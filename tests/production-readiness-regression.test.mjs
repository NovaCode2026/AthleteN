import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('web registration requires explicit acceptance of both published policies', () => {
  const app = read('src/App.tsx');
  assert.match(app, /mode === "register" && !policiesAccepted/);
  assert.match(app, /checked=\{policiesAccepted\}/);
  assert.match(app, /href="\/privacy-policy\.html"/);
  assert.match(app, /href="\/terms-of-service\.html"/);
  assert.match(app, /athleten_terms_accepted_version/);
  assert.match(app, /athleten_privacy_accepted_version/);
});

test('web Google registration records the accepted policy version after callback', () => {
  const app = read('src/App.tsx');
  assert.match(app, /sessionStorage\.setItem\("athleten_policy_acceptance"/);
  assert.match(app, /source: "web_google_signup"/);
  assert.match(app, /sessionStorage\.removeItem\("athleten_policy_acceptance"\)/);
});

test('mobile messaging has no escaped-newline syntax regression and prevents duplicate sends', () => {
  const messages = read('AthleteN-Mobile/src/app/(tabs)/messages.tsx');
  assert.doesNotMatch(messages, /\\n async function/);
  assert.match(messages, /\|\|sending\)return/);
  assert.match(messages, /finally\{setSending\(false\)\}/);
});

test('trigger-only security-definer functions are not exposed as client RPCs', () => {
  const migration = read('supabase/migrations/20261013113154_revoke_public_trigger_function_execute.sql');
  assert.match(migration, /audit_admin_mutation\(\) from public, anon, authenticated/i);
  assert.match(migration, /guard_privileged_profile_fields\(\) from public, anon, authenticated/i);
});

test('mobile auth copy has valid encoding and adapts to available screen dimensions', () => {
  const auth = read('AthleteN-Mobile/src/components/auth-screen.tsx');
  assert.doesNotMatch(auth, /Ã¢|â€|Â¦/);
  assert.match(auth, /useWindowDimensions/);
  assert.match(auth, /const compact = width < 380/);
  assert.match(auth, /const wide = width >= 700/);
  assert.match(auth, /maxWidth:wide\?760/);
});
test('web responsive layout includes narrow phone and tablet breakpoints', () => {
  const css = read('src/styles/main.css');
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /@media \(max-width: 360px\)/);
  assert.match(css, /@media \(max-width: 900px\)/);
});


test('web messaging only clears the composer after the database confirms a saved message', () => {
  const messages = read('src/components/messaging/MessagingPage.tsx');
  assert.match(messages, /data:savedMessage,error:insertError/);
  assert.match(messages, /\.select\("id,conversation_id,sender_id,body,message_type,created_at,client_message_id,attachment_path,attachment_name,attachment_type,attachment_size"\)\.single\(\)/);
  assert.match(messages, /if\(!savedMessage\?\.id\)throw new Error/);
  assert.match(messages, /setMessages\(old=>old\.some\(item=>item\.id===savedMessage\.id\)/);
});

test('mobile messaging confirms the insert and retains the database-returned message', () => {
  const messages = read('AthleteN-Mobile/src/app/(tabs)/messages.tsx');
  assert.match(messages, /data:savedMessage,error:e\}=await supabase\.from\('messages'\)\.insert/);
  assert.match(messages, /\.select\('id,conversation_id,sender_id,body,message_type,created_at,client_message_id,attachment_path,attachment_name,attachment_type,attachment_size'\)\.single\(\)/);
  assert.match(messages, /if\(!savedMessage\?\.id\)throw new Error/);
  assert.match(messages, /setMessages\(old=>old\.some\(m=>m\.id===savedMessage\.id\)/);
});

test('messaging migration safely replaces the prior constraint and keeps member-only writes', () => {
  const migration = read('supabase/migrations/20261029165600_fix_messaging_delivery_persistence.sql');
  assert.match(migration, /drop constraint if exists messages_body_or_attachment_check/);
  assert.match(migration, /add constraint messages_body_or_attachment_check/);
  assert.match(migration, /sender_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /public\.is_conversation_member\(conversation_id\)/);
  assert.match(migration, /char_length\(trim\(coalesce\(body, ''\)\)\) between 1 and 4000/);
  assert.match(migration, /attachment_path is not null/);
});


test('web and Android acknowledge message delivery through recipient-scoped receipts', () => {
  const web = read('src/components/messaging/MessagingPage.tsx');
  const mobile = read('AthleteN-Mobile/src/app/(tabs)/messages.tsx');
  const receiptMigration = read('supabase/migrations/20261101153000_message_delivery_receipts_and_notifications.sql');
  assert.match(web, /mark_messages_delivered/);
  assert.match(web, /table:"message_receipts"/);
  assert.match(web, /mark_messages_read/);
  assert.match(mobile, /mark_messages_delivered/);
  assert.match(mobile, /table:'message_receipts'/);
  assert.match(mobile, /mark_messages_read/);
  assert.match(receiptMigration, /unique\(message_id, user_id\)/);
  assert.match(receiptMigration, /message_receipts_read_requires_delivery/);
});

test('message attachment retries reuse the idempotency key and stable storage path', () => {
  const web = read('src/components/messaging/MessagingPage.tsx');
  const mobile = read('AthleteN-Mobile/src/app/(tabs)/messages.tsx');
  assert.match(web, /uploadedPath=.*clientMessageId.*ext/);
  assert.match(web, /message-attachments.*list\(selectedId/);
  assert.match(web, /upsert:false/);
  assert.match(mobile, /uploadedPath=.*clientMessageId.*ext/);
  assert.match(mobile, /message-attachments.*list\(selected\.id/);
  assert.match(mobile, /upsert:false/);
});

test('pg_net is recorded as a required dependency for server-dispatched Expo notifications', () => {
  const migration = read('supabase/migrations/20261103100630_enable_pg_net_notification_dispatch.sql');
  assert.match(migration, /create extension if not exists pg_net/i);
  const dispatch = read('supabase/migrations/20261103100957_harden_notification_push_dispatch.sql');
  assert.match(dispatch, /net\.http_post/);
  assert.match(dispatch, /exception when others then/i);
});


test('coach and academy analytics support date ranges, CSV exports, and print-to-PDF', () => {
  const dashboards = read('src/components/roles/RoleDashboards.tsx');
  const styles = read('src/styles/main.css');
  assert.match(dashboards, /const \[rangeMonths,setRangeMonths\]=useState\(6\)/);
  assert.match(dashboards, /filteredTrainingMetrics/);
  assert.match(dashboards, /filteredAcademyTraining/);
  assert.match(dashboards, /Export CSV/);
  assert.match(dashboards, /window\.print\(\)/);
  assert.match(styles, /@media print/);
});

test('message notifications carry a source message ID and acknowledge push delivery on both clients', () => {
  const migration = read('supabase/migrations/20261103110000_message_notification_delivery_ack.sql');
  const mobilePush = read('AthleteN-Mobile/src/lib/push-notifications.ts');
  const webApp = read('src/App.tsx');
  assert.match(migration, /notifications_message_id_fkey/);
  assert.match(migration, /message_id/);
  assert.match(migration, /'messageId', new\.message_id::text/);
  assert.match(mobilePush, /acknowledgeMessageDelivery/);
  assert.match(mobilePush, /mark_messages_delivered/);
  assert.match(webApp, /message_id\?:string\|null/);
  assert.match(webApp, /mark_messages_delivered/);
});

test('athlete dashboard preferences are saved securely and shared through Supabase', () => {
  const dashboard = read('src/components/dashboard/AthleteCommandCenter.tsx');
  const migration = read('supabase/migrations/20261103110200_dashboard_widget_preferences_rpc.sql');
  assert.match(dashboard, /from\("dashboard_widgets"\)/);
  assert.match(dashboard, /save_my_dashboard_widgets/);
  assert.match(dashboard, /Move .* up/);
  assert.doesNotMatch(dashboard, /window\.localStorage/);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /widget_key/);
  assert.match(migration, /grant execute on function public\.save_my_dashboard_widgets\(text\[\]\) to authenticated/i);
});

test('group message receipts report partial and all-member delivery/read progress', () => {
  const web = read('src/components/messaging/MessagingPage.tsx');
  const mobile = read('AthleteN-Mobile/src/app/(tabs)/messages.tsx');
  assert.match(web, /Read by all/);
  assert.match(web, /Delivered to all/);
  assert.match(mobile, /READ BY ALL/);
  assert.match(mobile, /DELIVERED TO ALL/);
});

test('coach and academy range summaries use the same filtered rows as their charts', () => {
  const dashboards = read('src/components/roles/RoleDashboards.tsx');
  assert.match(dashboards, /filteredAttendanceMetrics\.length/);
  assert.match(dashboards, /filteredTrainingMetrics\.length\?</);
  assert.match(dashboards, /filteredAcademyTraining\.length\?</);
  assert.match(dashboards, /filteredAcademyAttendance\.length\?</);
  assert.doesNotMatch(dashboards, /<strong>\{attendanceMetrics\.length\}<\/strong><small>Recorded check-ins/);
});


test('OAuth-created starter profiles stay in onboarding until all required athlete details are saved', () => {
  const app = read('src/App.tsx');
  assert.match(app, /const profileComplete = Boolean\(savedProfile\?\.full_name\?\.trim\(\) && savedProfile\?\.username\?\.trim\(\) && savedProfile\?\.date_of_birth && savedProfile\?\.gender && savedProfile\?\.sport === "taekwondo" && \(savedProfile\?\.discipline === "kyorugi" \|\| savedProfile\?\.discipline === "poomsae"\) && savedProfile\?\.academy\?\.trim\(\) && savedProfile\?\.coach\?\.trim\(\)\);/);
  assert.match(app, /!values\.full_name\?\.trim\(\)\|\|!values\.date_of_birth\|\|!values\.gender\|\|values\.sport!==\"taekwondo\"\|\|!values\.discipline\|\|!values\.academy\?\.trim\(\)\|\|!values\.coach\?\.trim\(\)/);
});


test('OAuth callback offers a recovery path when no session is established', () => {
  const app = read('src/App.tsx');
  assert.match(app, /const \[sessionMissing, setSessionMissing\] = useState\(false\)/);
  assert.match(app, /if \(auth\.loading \|\| auth\.user \|\| errorDescription\)/);
  assert.match(app, /setSessionMissing\(true\), 8000/);
  assert.match(app, /Sign-in could not be completed/);
  assert.match(app, /AthleteN did not receive a secure sign-in session/);
});
