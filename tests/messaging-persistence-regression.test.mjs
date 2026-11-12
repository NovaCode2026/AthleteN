import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Web messaging persists messages and retries with the same client message ID", () => {
  const source = read("../src/components/messaging/MessagingPage.tsx");
  assert.match(source, /const clientMessageId=draftMessageId\|\|crypto\.randomUUID\(\)/);
  assert.match(source, /setDraftMessageId\(clientMessageId\)/);
  assert.match(source, /supabase\.from\("messages"\)\.insert\(payload\)/);
  assert.match(source, /\.select\("id,conversation_id,sender_id,body,message_type,created_at,client_message_id/);
  assert.match(source, /insertError\?\.code==="23505"/);
  assert.match(source, /\.eq\("conversation_id",selectedId\)/);
  assert.match(source, /\.eq\("sender_id",effectiveUserId\)/);
  assert.match(source, /\.eq\("client_message_id",clientMessageId\)/);
  assert.match(source, /if\(!savedMessage\?\.id\)throw new Error\("Server did not confirm message persistence\."/);
  assert.match(source, /await loadMessages\(selectedId\)/);
  assert.match(source, /async function loadMessages\(conversationId:string\)/);
  assert.match(source, /\.eq\("conversation_id",conversationId\)\.order\("created_at",\{ascending:true\}\)/);
});

test("Mobile messaging persists messages and retries with the same client message ID", () => {
  const source = read("../AthleteN-Mobile/src/app/(tabs)/messages.tsx");
  assert.match(source, /const clientMessageId=draftMessageId\|\|makeClientMessageId\(\)/);
  assert.match(source, /setDraftMessageId\(clientMessageId\)/);
  assert.match(source, /supabase\.from\('messages'\)\.insert\(payload\)/);
  assert.match(source, /e\?\.code==='23505'/);
  assert.match(source, /\.eq\('conversation_id',selected\.id\)/);
  assert.match(source, /\.eq\('sender_id',session\.user\.id\)/);
  assert.match(source, /\.eq\('client_message_id',clientMessageId\)/);
  assert.match(source, /if\(!savedMessage\?\.id\)throw new Error\('The server did not confirm saving this message\.'/);
  assert.match(source, /await open\(selected\.id\)/);
  assert.match(source, /Your draft is preserved\. Retry will not create a duplicate\./);
});

test("messaging schema enforces idempotency, membership, receipts and Realtime", () => {
  const idempotency = read("../supabase/migrations/20261101153000_message_delivery_receipts_and_notifications.sql");
  const deliveryLimits = read("../supabase/migrations/20261103112535_harden_message_receipt_rpc_limits_and_search_path.sql");
  const persistence = read("../supabase/migrations/20261029165600_fix_messaging_delivery_persistence.sql");
  assert.match(idempotency, /messages_sender_client_message_id_uidx/);
  assert.match(idempotency, /unique \(message_id, user_id\)/);
  assert.match(idempotency, /create_message_delivery_records/);
  assert.match(idempotency, /after insert on public\.messages/);
  assert.match(idempotency, /alter publication supabase_realtime add table public\.message_receipts/);
  assert.match(deliveryLimits, /requested_count > 200/);
  assert.match(persistence, /public\.is_conversation_member\(conversation_id\)/);
  assert.match(persistence, /sender_id = \(select auth\.uid\(\)\)/);
});
