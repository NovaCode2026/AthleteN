import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261115190000_repair_connection_code_lifecycle.sql", import.meta.url), "utf8");
const reservationMigration = readFileSync(new URL("../supabase/migrations/20261116012408_permanently_reserve_case_insensitive_connection_codes.sql", import.meta.url), "utf8");
const team = readFileSync(new URL("../AthleteN-Mobile/src/app/team.tsx", import.meta.url), "utf8");

test("connection codes are tied to the account's current role and academy", () => {
  assert.match(migration, /owner_type = 'coach'[\s\S]*p\.role = 'coach'/);
  assert.match(migration, /owner_type = 'academy'[\s\S]*p\.role = 'academy_admin'/);
  assert.match(migration, /SET code\s*=\s*v_normalized,\s*academy_id\s*=\s*v_academy/i);
  assert.match(migration, /SET active\s*=\s*false/i);
});

test("switching coach or academy retires the previous active relationship", () => {
  assert.match(migration, /UPDATE public\.coach_athlete_links SET status='ended'/);
  assert.match(migration, /UPDATE public\.academy_memberships SET status='left'/);
});

test("Android team connection changes use an in-app password modal, not Alert.prompt", () => {
  assert.match(team, /<Modal visible=\{reauthOpen\}/);
  assert.match(team, /supabase\.auth\.signInWithPassword/);
  assert.doesNotMatch(team, /Alert\.prompt/);
  assert.match(team, /connect_athlete_by_code_typed/);
});

test("codes are case-insensitive, trimmed, globally unique and stay reserved when inactive", () => {
  assert.match(reservationMigration, /CREATE UNIQUE INDEX connection_codes_code_lower_unique\s+ON public\.connection_codes\s*\(lower\(btrim\(code\)\)\)/i);
  assert.doesNotMatch(reservationMigration, /WHERE\s+active/i);
  assert.match(migration, /lower\(btrim\(cc\.code\)\)=lower\(v_normalized\)/i);
  assert.match(migration, /That code is already reserved/i);
});

test("code redemption compares entered codes without case sensitivity or surrounding spaces", () => {
  assert.match(migration, /lower\(btrim\(cc\.code\)\)=lower\(btrim\(p_code\)\)/i);
});
