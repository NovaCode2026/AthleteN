import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261124140000_message_reactions.sql", import.meta.url), "utf8");
const web = readFileSync(new URL("../src/components/messaging/MessagingPage.tsx", import.meta.url), "utf8");
const mobile = readFileSync(new URL("../AthleteN-Mobile/src/app/(tabs)/messages.tsx", import.meta.url), "utf8");

test("message reactions are one per member per message and emoji values are allow-listed", () => {
  assert.match(migration, /primary key \(message_id, user_id\)/i);
  assert.match(migration, /reaction in \('👍','❤️','😂','😮','😢','🙏'\)/);
});

test("reaction table is private to age-approved conversation members and cannot target deleted messages", () => {
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /public\.is_age_approved/);
  assert.match(migration, /public\.is_conversation_member/);
  assert.match(migration, /m\.deleted_for_everyone_at is null/);
  assert.match(migration, /revoke all on public\.message_reactions from public, anon/i);
  assert.match(migration, /grant select, insert, update, delete on public\.message_reactions to authenticated/i);
  assert.match(migration, /alter publication supabase_realtime add table public\.message_reactions/i);
});

test("web and mobile load, toggle and live-refresh conversation reactions", () => {
  for (const source of [web, mobile]) {
    assert.match(source, /from\(['"]message_reactions['"]\)/);
    assert.match(source, /onConflict:\s*['"]message_id,user_id['"]/);
    assert.match(source, /MESSAGE_REACTION_OPTIONS/);
    assert.match(source, /table:\s*['"]message_reactions['"]/);
  }
});
