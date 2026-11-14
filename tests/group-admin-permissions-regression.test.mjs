import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("group creator retains ownership and alone can appoint or remove group admins", () => {
  const sql = read("../supabase/migrations/20261114182000_group_admin_permissions_and_settings.sql");
  const mobile = read("../AthleteN-Mobile/src/app/(tabs)/messages.tsx");

  assert.match(sql, /ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false/);
  assert.match(sql, /UPDATE public\.conversation_members cm[\s\S]*c\.created_by = cm\.user_id/);
  assert.match(sql, /Only the group creator can appoint or remove group admins/);
  assert.match(sql, /The group creator must remain an admin/);
  assert.match(mobile, /MAKE ADMIN/);
  assert.match(mobile, /REMOVE ADMIN/);
  assert.match(mobile, /isGroupOwner&&member\.user_id!==selected\.created_by/);
});

test("group settings cover adding members, editing info and sending messages", () => {
  const sql = read("../supabase/migrations/20261114182000_group_admin_permissions_and_settings.sql");
  const mobile = read("../AthleteN-Mobile/src/app/(tabs)/messages.tsx");

  for (const permission of [
    "only_admins_can_add_members",
    "only_admins_can_edit_group_info",
    "only_admins_can_send_messages",
  ]) {
    assert.match(sql, new RegExp("ADD COLUMN IF NOT EXISTS " + permission));
    assert.match(sql, new RegExp("p_" + permission));
    assert.match(mobile, new RegExp(permission));
  }
  assert.match(sql, /Only group admins can add members/);
  assert.match(sql, /c\.only_admins_can_send_messages = false/);
  assert.match(sql, /OR cm\.is_admin = true/);
  assert.match(sql, /Only group admins can edit group information/);
  assert.match(mobile, /Who can add members\?/);
  assert.match(mobile, /Who can edit group info\?/);
  assert.match(mobile, /Who can send messages\?/);
  assert.match(mobile, /SAVE GROUP INFORMATION/);
});

test("settings and member changes are server-authorized and retain safety checks", () => {
  const sql = read("../supabase/migrations/20261114182000_group_admin_permissions_and_settings.sql");
  assert.match(sql, /public\.is_age_approved\(v_user\)/);
  assert.match(sql, /public\.is_age_approved\(p_user_id\)/);
  assert.match(sql, /public\.user_blocks/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.set_group_member_admin/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.update_group_settings/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.update_group_info/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.add_group_member_by_user/);
  assert.match(sql, /char_length\(btrim\(coalesce\(body, ''\)\)\) BETWEEN 1 AND 4000/);
  assert.match(sql, /attachment_path IS NOT NULL/);
});

test("mobile group chat remains usable before the permissions migration is available", () => {
  const mobile = read("../AthleteN-Mobile/src/app/(tabs)/messages.tsx");
  assert.match(mobile, /isMissingGroupSettingsSchema/);
  assert.match(mobile, /supportsGroupSettings=false/);
  assert.match(mobile, /GROUP SETTINGS UPDATE PENDING/);
  assert.match(mobile, /groupSettingsAvailable\?/);
  assert.match(mobile, /if\(!groupSettingsAvailable\|\|/);
  assert.match(mobile, /Only group admins can send messages/);
});

test("web messaging has the same group role, permission, and member-picker controls", () => {
  const web = read("../src/components/messaging/MessagingPage.tsx");
  assert.match(web, /selectedIsGroupCreator&&member\.user_id!==selected\.created_by/);
  assert.match(web, /Make admin/);
  assert.match(web, /Remove admin/);
  assert.match(web, /Who can add members\?/);
  assert.match(web, /Who can edit group info\?/);
  assert.match(web, /Who can send messages\?/);
  assert.match(web, /Add selected members/);
  assert.match(web, /selectedCreateUsers\.length/);
  assert.match(web, /!canSendGroupMessage/);
  assert.match(web, /Group settings update pending/);
  assert.match(web, /searchRequest\\.current/);
  assert.match(web, /groupSearchRequest\\.current/);
  assert.match(web, /Group settings update pending/);
});
