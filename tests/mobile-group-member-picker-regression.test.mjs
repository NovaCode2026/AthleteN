import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("mobile group creation selects multiple people from recent chats and live search", () => {
  const messages = read("../AthleteN-Mobile/src/app/(tabs)/messages.tsx");
  assert.match(messages, /const recentPeople=recentContacts/);
  assert.match(messages, /setRecentContacts\(userIds\.map/);
  assert.match(messages, /search_messaging_users/);
  assert.match(messages, /pickerSearch/);
  assert.match(messages, /selectedCreateUsers/);
  assert.match(messages, /CREATE GROUP · '\+selectedCreateUsers\.length\+' MEMBERS/);
  assert.match(messages, /Tap to open private chat/);
});

test("group creator can select and add multiple members after group creation", () => {
  const messages = read("../AthleteN-Mobile/src/app/(tabs)/messages.tsx");
  assert.match(messages, /selected\.kind==='group'&&selected\.created_by===session\?\.user\.id/);
  assert.match(messages, /＋ ADD MEMBERS/);
  assert.match(messages, /selectedAddUsers/);
  assert.match(messages, /async function addSelectedMembers\(\)/);
  assert.match(messages, /add_group_member_by_user/);
  assert.match(messages, /Could not add:/);
  assert.match(messages, /setGroupMemberIds/);
});

test("messaging search ignores stale responses and existing member selections", () => {
  const messages = read("../AthleteN-Mobile/src/app/(tabs)/messages.tsx");
  assert.match(messages, /searchRequest\.current/);
  assert.match(messages, /pickerRequest\.current/);
  assert.match(messages, /pickerUsers\.filter\(person=>!groupMemberIds\.includes/);
  assert.match(messages, /Age approval|required/);
  const migration = read("../supabase/migrations/20261104103042_secure_messaging_and_coach_rpcs.sql");
  assert.match(migration, /public\.is_age_approved\(p_user_id\)/);
  assert.match(migration, /Only the group creator can add members/);
  assert.match(migration, /public\.user_blocks/);
});
