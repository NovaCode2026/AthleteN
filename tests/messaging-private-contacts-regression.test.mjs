import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20261124100000_private_messaging_contact_preferences.sql", import.meta.url),
  "utf8",
);

test("private messaging contact metadata is isolated by owner with row-level security", () => {
  assert.match(migration, /create table if not exists public\.messaging_private_contacts/i);
  assert.match(migration, /alter table public\.messaging_private_contacts enable row level security/i);
  assert.match(migration, /owner_user_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /for select to authenticated/i);
  assert.match(migration, /for insert to authenticated/i);
  assert.match(migration, /for update to authenticated/i);
  assert.match(migration, /for delete to authenticated/i);
  assert.match(migration, /revoke all on table public\.messaging_private_contacts from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant select, insert, update, delete on table public\.messaging_private_contacts to authenticated/i);
});

test("private contact metadata supports one nickname and one note per contact with bounded values", () => {
  assert.match(migration, /primary key \(owner_user_id, contact_user_id\)/i);
  assert.match(migration, /owner_user_id <> contact_user_id/i);
  assert.match(migration, /nickname text/i);
  assert.match(migration, /personal_note text/i);
  assert.match(migration, /char_length\(btrim\(nickname\)\) between 1 and 60/i);
  assert.match(migration, /char_length\(personal_note\) <= 1000/i);
  assert.match(migration, /relationship_label text/i);
  assert.match(migration, /organization_label text/i);
  assert.match(migration, /custom_labels text\[\]/i);
});

test("private contact metadata updates its timestamp without exposing the trigger function", () => {
  assert.match(migration, /new\.updated_at := now\(\)/i);
  assert.match(migration, /before update on public\.messaging_private_contacts/i);
  assert.match(migration, /revoke all on function public\.set_messaging_private_contact_updated_at\(\) from public, anon, authenticated/i);
});
