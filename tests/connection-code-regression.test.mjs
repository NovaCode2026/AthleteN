import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261115190000_repair_connection_code_lifecycle.sql", import.meta.url), "utf8");
const historyMigration = readFileSync(new URL("../supabase/migrations/20261116040000_preserve_connection_code_history.sql", import.meta.url), "utf8");
const reservationMigration = readFileSync(new URL("../supabase/migrations/20261116012408_permanently_reserve_case_insensitive_connection_codes.sql", import.meta.url), "utf8");
const team = readFileSync(new URL("../AthleteN-Mobile/src/app/team.tsx", import.meta.url), "utf8");

test("connection codes are tied to the account's current role and academy", () => {
  assert.match(migration, /owner_type = 'coach'[\\s\\S]*p\\.role = 'coach'/);
  assert.match(migration, /owner_type = 'academy'[\\s\\S]*p\\.role = 'academy_admin'/);
  assert.match(historyMigration, /IF v_role = 'coach'/);
  assert.match(historyMigration, /IF v_role = 'academy_admin'/);
  assert.match(historyMigration, /active academy administrator role is required/i);
});

test("switching coach or academy retires the previous active relationship", () => {
  assert.match(migration, /UPDATE public\\.coach_athlete_links SET status='ended'/);
  assert.match(migration, /UPDATE public\\.academy_memberships SET status='left'/);
});

test("Android team connection changes use an in-app password modal, not Alert.prompt", () => {
  assert.match(team, /<Modal visible=\\{reauthOpen\\}/);
  assert.match(team, /supabase\\.auth\\.signInWithPassword/);
  assert.doesNotMatch(team, /Alert\\.prompt/);
  assert.match(team, /connect_athlete_by_code_typed/);
});

test("codes are case-insensitive, trimmed, globally unique and stay reserved when inactive", () => {
  assert.match(reservationMigration, /CREATE UNIQUE INDEX connection_codes_code_lower_unique\\s+ON public\\.connection_codes\\s*\\(lower\\(btrim\\(code\\)\\)\\)/i);
  assert.doesNotMatch(reservationMigration, /WHERE\\s+active/i);
  assert.match(migration, /lower\\(btrim\\(cc\\.code\\)\\)=lower\\(v_normalized\\)/i);
  assert.match(migration, /That code is already reserved/i);
  assert.match(historyMigration, /That code is already permanently reserved/i);
});

test("rotating codes retires old rows and never overwrites a previously issued code", () => {
  assert.match(historyMigration, /UPDATE public\\.connection_codes cc\\s+SET active = false/i);
  assert.match(historyMigration, /INSERT INTO public\\.connection_codes/i);
  assert.doesNotMatch(historyMigration, /SET\\s+code\\s*=/i);
  assert.match(historyMigration, /cc\\.owner_user_id = v_uid[\\s\\S]*cc\\.owner_type = 'coach'[\\s\\S]*lower\\(btrim\\(cc\\.code\\)\\) = lower\\(v_normalized\\)/i);
  assert.match(historyMigration, /cc\\.owner_user_id = v_uid[\\s\\S]*cc\\.owner_type = 'academy'[\\s\\S]*cc\\.academy_id = v_academy[\\s\\S]*lower\\(btrim\\(cc\\.code\\)\\) = lower\\(v_normalized\\)/i);
  assert.match(historyMigration, /FOR UPDATE/i);
  assert.match(historyMigration, /REVOKE ALL ON FUNCTION public\\.set_connection_code\\(text\\) FROM PUBLIC, anon/i);
  assert.match(historyMigration, /GRANT EXECUTE ON FUNCTION public\\.set_connection_code\\(text\\) TO authenticated/i);
});

test("code redemption compares entered codes without case sensitivity or surrounding spaces", () => {
  assert.match(migration, /lower\\(btrim\\(cc\\.code\\)\\)=lower\\(btrim\\(p_code\\)\\)/i);
});
