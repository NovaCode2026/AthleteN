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
  assert.match(messages, /\.select\("id,conversation_id,sender_id,body,message_type,created_at,attachment_path,attachment_name,attachment_type,attachment_size"\)\.single\(\)/);
  assert.match(messages, /if\(!savedMessage\?\.id\)throw new Error/);
  assert.match(messages, /setMessages\(old=>old\.some\(item=>item\.id===savedMessage\.id\)/);
});

test('mobile messaging confirms the insert and retains the database-returned message', () => {
  const messages = read('AthleteN-Mobile/src/app/(tabs)/messages.tsx');
  assert.match(messages, /data:savedMessage,error:e\}=await supabase\.from\('messages'\)\.insert/);
  assert.match(messages, /\.select\('id,conversation_id,sender_id,body,message_type,created_at,attachment_path,attachment_name,attachment_type,attachment_size'\)\.single\(\)/);
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
