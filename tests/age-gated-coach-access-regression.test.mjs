import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("connected-team access requires both coach and athlete age approval", () => {
  const sql = read("../supabase/security/age_gated_coach_access_hardening.sql");
  assert.match(sql, /REVIEW DRAFT ONLY — NOT A DEPLOYABLE MIGRATION/);
  assert.match(sql, /create or replace function public\.can_view_athlete/i);
  assert.match(sql, /public\.is_age_approved\(auth\.uid\(\)\)/i);
  assert.match(sql, /public\.is_age_approved\(target_user_id\)/i);
  assert.match(sql, /create or replace function private\.user_can_manage_athlete/i);
  assert.match(sql, /public\.is_age_approved\(p_athlete_user_id\)/i);
  assert.match(sql, /public\.is_platform_admin\(\)/i);

  const tables = [
    ["hydration_logs", "user_id"],
    ["kyorugi_bouts", "user_id"],
    ["kyorugi_training_metrics", "user_id"],
    ["nutrition_logs", "user_id"],
    ["poomsae_performances", "user_id"],
    ["poomsae_training_metrics", "user_id"],
    ["taekwondo_belt_history", "athlete_user_id"],
    ["taekwondo_training_logs", "user_id"],
    ["taekwondo_weight_category_decisions", "athlete_user_id"],
  ];
  for (const [table, owner] of tables) {
    const policy = new RegExp(
      `create policy "age approval required" on public\\.${table}[\\s\\S]*?as restrictive for all to authenticated[\\s\\S]*?public\\.is_age_approved\\(auth\\.uid\\(\\)\\)[\\s\\S]*?public\\.is_age_approved\\(${owner}\\)`,
      "i",
    );
    assert.match(sql, policy, `missing two-sided restrictive age gate for ${table}`);
  }
  assert.match(sql, /revoke all on function public\.can_view_athlete\(uuid\) from public, anon/i);
  assert.match(sql, /revoke all on function private\.user_can_manage_athlete\(uuid\) from public, anon/i);
});

test("PostgreSQL integration suite tests pending coaches, pending athletes and approved linked athletes", () => {
  const sql = read("../tests/sql/security-authorization-integration.sql");
  assert.match(sql, /pending athlete hydration is visible to coach/i);
  assert.match(sql, /pending Coach can_view_athlete returned true/i);
  assert.match(sql, /Approved coach cannot view an approved linked athlete/i);
  assert.match(sql, /Approved coach cannot manage an approved linked athlete/i);
  assert.match(sql, /pending athlete Taekwondo logs are visible to coach/i);
});
