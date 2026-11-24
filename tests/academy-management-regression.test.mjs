import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261124233000_harden_academy_workspace_management.sql");
const web = read("../src/components/roles/RoleDashboards.tsx");
const coachDashboard = read("../src/components/coach/CoachAcademyDashboard.tsx");
const mobileSetup = read("../AthleteN-Mobile/src/app/academy-setup.tsx");

test("Academy workspace creation is an approved-role, atomic server operation", () => {
  assert.match(migration, /create or replace function public\.create_academy_workspace[\s\S]*?security definer/i);
  assert.match(migration, /v_role is distinct from 'academy_admin'/i);
  assert.match(migration, /insert into public\.academy_memberships/i);
  assert.match(migration, /insert into public\.academy_coach_seats/i);
  assert.match(migration, /update public\.profiles[\s\S]*?academy_id/i);
  assert.match(migration, /grant execute on function public\.create_academy_workspace/i);
});

test("direct Academy and membership creation and role promotion are blocked", () => {
  assert.match(migration, /revoke insert on public\.academies from public, anon, authenticated/i);
  assert.match(migration, /revoke insert on public\.academy_memberships from public, anon, authenticated/i);
  assert.match(migration, /academy memberships admin update/i);
  assert.match(migration, /academy memberships admin delete/i);
  assert.match(migration, /grant update \(status, updated_at\) on public\.academy_memberships/i);
  assert.doesNotMatch(migration, /create policy [\s\S]{0,150}academy memberships[^;]*for insert/i);
});

test("web and mobile Academy setup share the same role-checked RPC", () => {
  assert.ok(web.includes('rpc("create_academy_workspace"'));
  assert.equal(web.includes('from("academies").insert'), false);
  assert.equal(web.includes('from("academy_memberships").insert'), false);
  assert.ok(web.includes('profile.role === "academy_admin"'));
  assert.ok(coachDashboard.includes('rpc("create_academy_workspace"'));
  assert.ok(mobileSetup.includes("supabase.rpc('create_academy_workspace'"));
  assert.equal(mobileSetup.includes(".from('academies')\n          .insert("), false);
});
