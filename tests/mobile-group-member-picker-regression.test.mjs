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

test("group permissions control who can select and add multiple members after creation", () => {
  const messages = read("../AthleteN-Mobile/src/app/(tabs)/messages.tsx");
  const migration = read("../supabase/migrations/20261114162145_group_admin_permissions_and_settings.sql");
  assert.match(messages, /const canAddMembers=Boolean\(selected\?\.kind==='group'/);
  assert.match(messages, /selected\.kind==='group'&&canAddMembers/);
  assert.match(messages, /＋ ADD MEMBERS/);
  assert.match(messages, /selectedAddUsers/);
  assert.match(messages, /async function addSelectedMembers\(\)/);
  assert.match(messages, /add_group_member_by_user/);
  assert.match(messages, /Could not add:/);
  assert.match(messages, /setGroupMemberIds/);
  assert.match(migration, /Only group admins can add members/);
  assert.match(migration, /coalesce\(v_is_admin, false\)/);
});

test("messaging search ignores stale responses and enforces approval, privacy and group membership server-side", () => {
  const messages = read("../AthleteN-Mobile/src/app/(tabs)/messages.tsx");
  assert.match(messages, /searchRequest\.current/);
  assert.match(messages, /pickerRequest\.current/);
  assert.match(messages, /pickerUsers\.filter\(person=>!groupMemberIds\.includes/);
  const migration = read("../supabase/migrations/20261114162145_group_admin_permissions_and_settings.sql");
  assert.match(migration, /public\.is_age_approved\(v_user\)/);
  assert.match(migration, /public\.is_age_approved\(p_user_id\)/);
  assert.match(migration, /Only group admins can add members/);
  assert.match(migration, /public\.user_blocks/);
});
