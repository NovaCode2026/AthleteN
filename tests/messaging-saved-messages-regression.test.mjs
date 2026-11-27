import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261124180000_private_saved_messages.sql");
const web = read("../src/components/messaging/MessagingPage.tsx");
const mobile = read("../AthleteN-Mobile/src/app/(tabs)/messages.tsx");

test("saved-message table contains only private owner metadata and cascades with source messages", () => {
  assert.match(migration, /owner_user_id uuid NOT NULL/);
  assert.match(migration, /message_id uuid NOT NULL REFERENCES public\.messages\(id\) ON DELETE CASCADE/);
  assert.match(migration, /label text NOT NULL DEFAULT 'Saved'/);
  assert.match(migration, /note text/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.messaging_saved_messages FROM PUBLIC, anon/);
  assert.match(migration, /remove_saved_message_bookmarks_on_global_delete/);
  assert.match(migration, /messages_remove_saved_bookmarks_after_global_delete/);
});

test("only the owner can read or change saved messages for their own conversations", () => {
  assert.match(migration, /owner_user_id = \(SELECT auth\.uid\(\)\)/);
  assert.match(migration, /public\.is_age_approved/);
  assert.match(migration, /JOIN public\.conversation_members cm/);
  assert.match(migration, /Users read their own saved messages/);
  assert.match(migration, /Users save messages in their conversations/);
  assert.match(migration, /Users update their saved message labels/);
  assert.match(migration, /Users unsave their own messages/);
});

test("web and mobile provide save and saved-only organization controls", () => {
  for (const source of [web, mobile]) {
    assert.match(source, /messaging_saved_messages/);
    assert.match(source, /Save message/i);
    assert.match(source, /savedOnly/);
    assert.match(source, /Show saved messages|SHOW SAVED MESSAGES/);
  }
});
