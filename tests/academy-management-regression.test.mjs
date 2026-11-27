import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261124233000_harden_academy_workspace_management.sql");
const web = read("../src/components/roles/RoleDashboards.tsx");
const coachDashboard = read("../src/components/coach/CoachAcademyDashboard.tsx");
const mobileSetup = read("../AthleteN-Mobile/src/app/academy-setup.tsx");
const mobileAcademy = read("../AthleteN-Mobile/src/app/(tabs)/academy.tsx");

test("Academy workspace creation is an approved-role, atomic server operation", () => {
  assert.match(migration, /create or replace function public\.create_academy_workspace[\s\S]*?security definer/i);
  assert.match(migration, /v_role is distinct from 'academy_admin'/i);
  assert.match(migration, /insert into public\.academy_memberships/i);
  assert.match(migration, /insert into public\.academy_coach_seats/i);
  assert.match(migration, /update public\.profiles[\s\S]*?academy_id/i);
  assert.match(migration, /grant execute on function public\.create_academy_workspace/i);
});

test("direct Academy and membership creation, deletion and role promotion are blocked", () => {
  assert.match(migration, /revoke insert on public\.academies from public, anon, authenticated/i);
  assert.match(migration, /revoke insert on public\.academy_memberships from public, anon, authenticated/i);
  assert.match(migration, /revoke delete on public\.academies from public, anon, authenticated/i);
  assert.match(migration, /revoke delete on public\.academy_memberships from public, anon, authenticated/i);
  assert.match(migration, /academy memberships admin update/i);
  assert.match(migration, /academy memberships admin delete/i);
  assert.ok(migration.toLowerCase().includes("grant update (status, updated_at) on public.academy_memberships"));
  assert.doesNotMatch(migration, /grant select, delete on public\.(academies|academy_memberships)/i);
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
  assert.match(mobileSetup, /from\('academy_memberships'\)[\s\S]*?eq\('role', 'academy_admin'\)[\s\S]*?eq\('status', 'active'\)/);
  assert.doesNotMatch(mobileSetup, /\.eq\('id', academyId\)\.eq\('owner_user_id'/);
});

test("Academy verification and setup completion are server-owned Auth-backed states", () => {
  assert.ok(migration.includes("CREATE OR REPLACE FUNCTION public.sync_verified_academy_contact_email("));
  assert.ok(migration.includes("CREATE OR REPLACE FUNCTION public.complete_academy_setup("));
  assert.ok(migration.includes("FROM auth.users u"));
  assert.ok(migration.includes("GRANT UPDATE (\n  name, city, state, country, contact_phone\n) ON public.academies TO authenticated;"));
  assert.equal(migration.includes("contact_email_verified_at, setup_completed, setup_completed_at\n) ON public.academies TO authenticated;"), false);
  assert.ok(mobileSetup.includes("rpc('sync_verified_academy_contact_email'"));
  assert.ok(mobileSetup.includes("rpc('complete_academy_setup'"));
  assert.ok(mobileSetup.includes("rpc('link_owned_academy_workspace'"));
  assert.equal(mobileSetup.includes("from('academies').update("), false);
  assert.equal(mobileSetup.includes("from('profiles').update({ academy_id: id })"), false);
  assert.equal(mobileSetup.includes("contact_email_verified_at: new Date()"), false);
  assert.equal(mobileSetup.includes("setup_completed: true"), false);
});

test("Academy web dashboard supports approved delegated admins and active athlete rosters", () => {
  assert.match(web, /from\("academy_memberships"\)[\s\S]*?eq\("role", "academy_admin"\)[\s\S]*?eq\("status", "active"\)/);
  assert.match(web, /accessibleResult[\s\S]*?in\("id", academyIds\)/);
  assert.match(web, /membership\.role==="athlete"[\s\S]*?membership\.status==="active"/);
});

test("Coach dashboard uses the canonical monthly Coach plan price", () => {
  const catalogue = read("../docs/COACH_ACADEMY_ACCOUNT_LIFECYCLE.md");
  assert.match(catalogue, /Coach \| ₹499 \| ₹4,999/);
  assert.ok(coachDashboard.includes('isAcademy?coachCount:"₹499"'));
  assert.equal(coachDashboard.includes('"₹149"'), false);
});

test("Academy mobile member lifecycle preserves history through suspend and reactivate", () => {
  assert.match(mobileAcademy, /from\('academy_memberships'\)\.update\(\{status,updated_at:/);
  assert.match(mobileAcademy, /m\.status==='active'\?'suspended':'active'/);
  assert.doesNotMatch(mobileAcademy, /from\('academy_memberships'\)\.delete\(/);
});
