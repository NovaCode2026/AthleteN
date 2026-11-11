import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("team connection migration removes direct membership creation paths", () => {
  const sql = read("../supabase/migrations/20261111170000_require_opt_in_team_connections.sql");
  assert.ok(sql.includes('DROP POLICY IF EXISTS "coach links coaches can create"'));
  assert.ok(sql.includes('DROP POLICY IF EXISTS "Academy admins can create memberships"'));
  assert.ok(sql.includes('Academy owners can bootstrap own admin membership'));
  assert.ok(sql.includes("REVOKE ALL ON FUNCTION public.academy_add_coach(text)"));
  assert.ok(sql.includes("REVOKE ALL ON FUNCTION public.find_athlete_by_username(text)"));
  assert.ok(sql.includes("FROM PUBLIC, anon, authenticated"));
  assert.ok(sql.includes("private.is_platform_admin()"));
});

test("web coach roster connects only by an athlete-shared account code", () => {
  const source = read("../src/components/roles/RoleDashboards.tsx");
  const coachAcademy = read("../src/components/coach/CoachAcademyDashboard.tsx");
  assert.ok(source.includes("coach_add_athlete_by_account_code"));
  assert.ok(source.includes("AthleteN account code"));
  assert.equal(source.includes("find_athlete_by_username"), false);
  assert.equal(source.includes('from("coach_athlete_links").insert'), false);
  assert.ok(coachAcademy.includes("coach_add_athlete_by_account_code"));
  assert.equal(coachAcademy.includes("coach_connect_athlete"), false);
  assert.equal(coachAcademy.includes("Athlete username"), false);
});

test("academy workspaces no longer add people by username", () => {
  const web = read("../src/components/roles/RoleDashboards.tsx");
  const mobileAcademy = read("../AthleteN-Mobile/src/app/(tabs)/academy.tsx");
  const coachProfile = read("../AthleteN-Mobile/src/app/coach-profile.tsx");
  assert.equal(web.includes("resolveAthlete"), false);
  assert.equal(web.includes("findMember"), false);
  assert.equal(web.includes('from("academy_memberships").insert({ academy_id: academyId'), false);
  assert.equal(mobileAcademy.includes("academy_add_coach"), false);
  assert.equal(mobileAcademy.includes("coachUsername"), false);
  assert.ok(mobileAcademy.includes("Invite coaches with your academy code"));
  assert.ok(coachProfile.includes("connect_coach_to_academy_by_code"));
});
