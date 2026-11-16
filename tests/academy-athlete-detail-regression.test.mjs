import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const academy = read("../AthleteN-Mobile/src/app/(tabs)/academy.tsx");
const detail = read("../AthleteN-Mobile/src/app/academy-athlete-detail.tsx");
const migration = read("../supabase/migrations/20261116070000_academy_owner_athlete_attendance_access.sql");

test("academy People opens a dedicated detail view when an athlete is tapped", () => {
  assert.match(academy, /pathname:\s*'\/academy-athlete-detail'/);
  assert.match(academy, /params:\s*\{\s*athleteId:\s*m\.user_id\s*\}/);
});

test("academy athlete detail verifies active same-academy membership before loading profile data", () => {
  assert.match(detail, /from\('academy_memberships'\)/);
  assert.match(detail, /\.eq\('academy_id',academyId\)/);
  assert.match(detail, /\.eq\('user_id',athleteId\)/);
  assert.match(detail, /\.eq\('role','athlete'\)/);
  assert.match(detail, /\.eq\('status','active'\)/);
  assert.ok(detail.indexOf('if(!memberResult.data)') < detail.indexOf("from('profiles')"));
});

test("athlete detail includes an attendance calendar and attendance status totals", () => {
  assert.match(detail, /from\('training_group_sessions'\)/);
  assert.match(detail, /from\('training_group_attendance'\)/);
  assert.match(detail, /ATTENDANCE CALENDAR/);
  assert.match(detail, /'present'/);
  assert.match(detail, /'late'/);
  assert.match(detail, /'absent'/);
  assert.match(detail, /'excused'/);
});

test("detail view loads the existing athlete record categories without writing athlete data", () => {
  for (const table of ['training_sessions', 'training_plans', 'calendar_events', 'tournaments', 'matches', 'medals', 'weight_logs', 'goals', 'injuries', 'certificates', 'documents']) {
    assert.ok(detail.includes("from('" + table + "')"), 'missing ' + table);
  }
  assert.doesNotMatch(detail, /\.insert\(|\.update\(|\.delete\(/);
  assert.doesNotMatch(detail, /emergency_contact|account_code|file_path/);
});

test("academy owners can read group rosters and attendance through owner-aware checks", () => {
  assert.match(migration, /is_academy_admin_for_training_group[\s\S]*?user_is_academy_admin\(coach_profile\.academy_id\)/);
  assert.match(migration, /is_academy_admin_for_training_session[\s\S]*?user_is_academy_admin\(coach_profile\.academy_id\)/);
});
