import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("team connection migration removes direct membership creation paths", () => {
  const sql = read("../supabase/migrations/20261111170000_require_opt_in_team_connections.sql");
  assert.match(sql, /DROP POLICY IF EXISTS "coach links coaches can create"/i);
  assert.match(sql, /DROP POLICY IF EXISTS "Academy admins can create memberships"/i);
  assert.match(sql, /Academy owners can bootstrap own admin membership/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.academy_add_coach\(text\)[\s\S]*FROM PUBLIC, anon, authenticated/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.find_athlete_by_username\(text\)[\s\S]*FROM PUBLIC, anon, authenticated/i);
  assert.match(sql, /private\.is_platform_admin\(\)/i);
});

test("web coach roster connects only by an athlete-shared account code", () => {
  const source = read("../src/components/roles/RoleDashboards.tsx");
  assert.match(source, /coach_add_athlete_by_account_code/);
  assert.match(source, /AthleteN account code/);
  assert.doesNotMatch(source, /find_athlete_by_username/);
  assert.doesNotMatch(source, /coach_athlete_links["']\)\.insert/);
});

test("academy workspaces no longer add people by username", () => {
  const web = read("../src/components/roles/RoleDashboards.tsx");
  const mobile = read("../AthleteN-Mobile/src/app/(tabs)/academy.tsx");
  assert.doesNotMatch(web, /resolveAthlete|findMember|addMember\(\)/);
  assert.doesNotMatch(web, /academy_memberships["']\)\.insert\(\{\s*academy_id:\s*academyId/);
  assert.doesNotMatch(mobile, /academy_add_coach|coachUsername/);
  assert.match(mobile, /connect_coach_to_academy_by_code/);
  assert.match(mobile, /Invite coaches with your academy code/);
});
