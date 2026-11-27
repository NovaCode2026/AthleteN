import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const web = read("../src/components/parity/NotificationPages.tsx");
const mobile = read("../AthleteN-Mobile/src/app/notifications.tsx");
const migration = read("../supabase/migrations/20261124190000_group_conversation_push_notifications.sql");

test("web notification center groups message alerts by authorized conversation", () => {
  assert.match(web, /select\("id,conversation_id"\)/);
  assert.match(web, /function groupMessageNotifications/);
  assert.match(web, /notification_ids:group\.map/);
  assert.match(web, /\.in\("id",ids\)/);
  assert.match(web, /New messages/);
});

test("mobile notification center groups message alerts and marks/deletes the entire group", () => {
  assert.match(mobile, /select\('id,conversation_id'\)/);
  assert.match(mobile, /function groupMessageNotifications/);
  assert.match(mobile, /notification_ids:group\.map/);
  assert.match(mobile, /\.in\('id', ids\)/);
  assert.match(mobile, /displayRows\.map/);
});

test("notification categories match the server-side preference taxonomy", () => {
  for (const source of [web, mobile]) {
    for (const token of ["Messages", "Training", "Competitions", "Coach & Academy", "Achievements", "System"]) {
      assert.ok(source.toLowerCase().includes(token.toLowerCase()), `missing category label: ${token}`);
    }
  }
});

test("native message pushes collapse and thread by conversation without sending message content by default", () => {
  assert.match(migration, /'collapseId', v_conversation_group/);
  assert.match(migration, /'tag', v_conversation_group/);
  assert.match(migration, /'threadId', v_conversation_group/);
  assert.match(migration, /'Open AthleteN to view your new message\.'/);
  assert.match(migration, /'conversationId', v_conversation_id::text/);
});
