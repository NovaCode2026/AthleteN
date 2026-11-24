import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261124110000_message_notification_preview_privacy.sql", import.meta.url), "utf8");
const mobileSettings = readFileSync(new URL("../AthleteN-Mobile/src/app/notification-settings.tsx", import.meta.url), "utf8");
const webSettings = readFileSync(new URL("../src/components/parity/NotificationPages.tsx", import.meta.url), "utf8");

test("message lock-screen previews are opt-in and private by default", () => {
  assert.match(migration, /add column if not exists message_preview boolean not null default false/i);
  assert.match(migration, /coalesce\(np\.message_preview, false\)/i);
  assert.match(migration, /when v_preview_enabled and nullif\(btrim\(v_message_body\), ''\) is not null then v_message_body/i);
  assert.match(migration, /else 'Open AthleteN to view your new message\.'/i);
});

test("push dispatcher adds sender context only when preview privacy setting is enabled", () => {
  assert.match(migration, /left join public\.profiles p on p\.user_id = m\.sender_id/i);
  assert.match(migration, /'New message from ' \|\| coalesce\(v_sender_name/i);
  assert.match(migration, /'New message'/);
  assert.match(migration, /'messageId', new\.message_id::text/i);
  assert.match(migration, /'conversationId', v_conversation_id::text/i);
  assert.match(migration, /revoke all on function public\.dispatch_notification_push\(\) from public, anon, authenticated/i);
});

test("web and mobile settings expose the same private-preview preference", () => {
  assert.match(mobileSettings, /message_preview: false/);
  assert.match(mobileSettings, /toggle\('message_preview'\)/);
  assert.match(mobileSettings, /Message previews on lock screen/);
  assert.match(webSettings, /message_preview:false/);
  assert.match(webSettings, /toggle\("message_preview"\)/);
  assert.match(webSettings, /Message previews on lock screen/);
});


test("message preview preferences preserve the central notification-category preference guard", () => {
  const guard = readFileSync(new URL("../supabase/migrations/20261111112015_filter_notifications_by_user_preferences.sql", import.meta.url), "utf8").toLowerCase();
  assert.ok(guard.includes("private.notification_preference_allows"));
  assert.ok(guard.includes("create trigger enforce_notification_preferences_before_insert"));
  assert.ok(guard.includes("before insert on public.notifications"));
  assert.ok(guard.includes("when 'message' then coalesce(p_messages, true)"));
});
