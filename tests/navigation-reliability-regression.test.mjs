import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('database navigation contract always appends More and accepts only known destinations', () => {
  const sql = read('../supabase/migrations/20261111072407_require_more_in_navigation.sql');
  assert.match(sql, /v_ids := array_append\(v_ids,'explore'\)/);
  assert.match(sql, /v_ids\[1:least\(cardinality\(v_ids\),5\)\]/);
  for (const id of ['index','training','ai','compete','profile','explore','calendar','journey','weight','messages','documents','attendance','analytics','reports','coach','verification-review','academy','badges','taekwondo-hub','scanner-panel','plans-panel','notifications-panel','medals-panel','checklist-panel','nutrition-panel','missions-panel','passport-panel','support-panel','team-panel','session-panel','competition-mode-panel']) {
    assert.ok(sql.includes("'" + id + "'"), 'Missing allowed destination: ' + id);
  }
});

test('mobile navigation pins More and exposes five customizable shortcut slots', () => {
  const settings = read('../AthleteN-Mobile/src/app/navigation-settings.tsx');
  const layout = read('../AthleteN-Mobile/src/app/(tabs)/_layout.tsx');
  assert.match(settings, /const MORE_ID='explore'/);
  assert.match(settings, /Choose up to five shortcuts/);
  assert.match(settings, /if\(id===MORE_ID\)/);
  assert.match(layout, /return \[\.\.\.valid, REQUIRED_NAV_ITEM\]/);
});

test('web navigation uses the same destination catalogue and mandatory More rule', () => {
  const web = read('../src/components/parity/NotificationPages.tsx');
  assert.match(web, /const REQUIRED_NAV_ITEM="explore"/);
  assert.match(web, /Choose and reorder up to five shortcuts/);
  assert.match(web, /return \[\.\.\.valid,REQUIRED_NAV_ITEM\]/);
  for (const id of ['taekwondo-hub','scanner-panel','plans-panel','notifications-panel','medals-panel','checklist-panel','nutrition-panel','missions-panel','passport-panel','support-panel','team-panel','session-panel','competition-mode-panel']) {
    assert.ok(web.includes('["' + id + '"'), 'Web catalogue is missing ' + id);
  }
});

test('all mobile chat entry points use the canonical messaging screen', () => {
  const redirect = read('../AthleteN-Mobile/src/app/conversation.tsx');
  const messages = read('../AthleteN-Mobile/src/app/(tabs)/messages.tsx');
  assert.match(redirect, /Redirect href=\{\{pathname:'\/messages',params:\{conversationId:String\(id\)\}\}\}/);
  assert.match(messages, /conversationId\?: string/);
  assert.match(messages, /if\(session&&conversationId\)void open\(String\(conversationId\)\)/);
});

test('mobile profile no longer repeats the same settings destination twice', () => {
  const profile = read('../AthleteN-Mobile/src/app/profile.tsx');
  assert.equal((profile.match(/router\.push\('\/settings'\)/g) || []).length, 1);
});
