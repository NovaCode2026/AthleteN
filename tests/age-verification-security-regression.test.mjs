import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("age verification SQL draft removes client-write paths and makes DOB immutable", () => {
  const sql = read("../supabase/security/age_verification_hardening.sql");
  assert.match(sql, /REVIEWED DRAFT ONLY — NOT A DEPLOYABLE MIGRATION/);
  assert.match(sql, /drop policy if exists "users can create own age verification"/i);
  assert.match(sql, /drop policy if exists "users can update own age verification"/i);
  assert.ok(sql.includes("create trigger prevent_profile_dob_rewrite"));
  assert.ok(sql.includes("old.date_of_birth is not null"));
  assert.ok(sql.includes("new.date_of_birth is distinct from old.date_of_birth"));
  assert.ok(sql.includes("athleten.dob_correction"));
  assert.ok(sql.includes("select p.date_of_birth") && sql.includes("for update"));
  assert.match(sql, /revoke all on table public\.age_verifications from public, anon, authenticated/i);
  assert.match(sql, /grant select on table public\.age_verifications to authenticated/i);
  assert.match(sql, /set search_path = ''/i);
  assert.match(sql, /on conflict \(user_id\) do nothing/i);
  assert.match(sql, /v_existing_dob is distinct from p_date_of_birth/i);
  assert.match(sql, /Date of birth is locked after first submission/i);
  assert.match(sql, /v_age >= 18 and v_status in \('pending', 'rejected'\)/i);
  assert.match(sql, /set status = 'not_required'/i);
  assert.match(sql, /revoke all on function public\.prepare_parent_approval\(text\) from public, anon, authenticated/i);
  assert.doesNotMatch(sql, /on conflict\s*\(user_id\)\s*do update/i);
});

test("parent approval edge function preserves approved states and only reissues pending or rejected requests", () => {
  const source = read("../supabase/functions/start-parent-approval/index.ts");
  assert.match(source, /YYYY-MM-DD format/);
  assert.match(source, /date of birth is locked/i);
  assert.match(source, /get_age_verification_status/);
  assert.ok(source.includes(".from('profiles')") && source.includes(".select('date_of_birth')"));
  assert.ok(source.includes("currentAge?.date_of_birth && currentAge.date_of_birth !== dateOfBirth"));
  assert.ok(source.includes("currentAge?.status === 'approved' || currentAge?.status === 'not_required'"));
  assert.ok(source.indexOf('get_age_verification_status') < source.indexOf("rpc('record_age_profile'"));
  assert.match(source, /status === 'approved'/);
  assert.match(source, /status !== 'pending' && status !== 'rejected'/);
  assert.match(source, /\.in\('status', \['pending', 'rejected'\]\)/);
  assert.match(source, /\.select\('id'\)\s*\.maybeSingle\(\)/);
  assert.doesNotMatch(source, /status !== 'pending' \|\| ageYears >= 18/);
});

test("guardian approval token is atomically single-use", () => {
  const source = read("../supabase/functions/approve-parent/index.ts");
  assert.match(source, /\.eq\('status', 'pending'\)/);
  assert.match(source, /\.eq\('token_hash', tokenHash\)/);
  assert.match(source, /\.select\('id'\)\s*\.maybeSingle\(\)/);
  assert.match(source, /if \(!approvedRow\)/);
  assert.match(source, /already been used or is no longer active/);
});

test("generic admin resource editor cannot mutate or expose guardian token data", () => {
  const source = read("../src/components/admin/AdminControlCenter.tsx");
  assert.match(source, /ageVerificationReadOnly = selected === "ageVerifications"/);
  assert.match(source, /canEditCurrentSection = canManage && !ageVerificationReadOnly/);
  assert.match(source, /canCreateCurrentSection = isOwner && !ageVerificationReadOnly/);
  assert.match(source, /date_of_birth,parent_email,status,approved_at,rejected_at/);
  assert.doesNotMatch(source, /select\("id,user_id,date_of_birth,parent_email,status,token_hash/);
  assert.match(source, /if \(!canEditCurrentSection \|\| !supabase \|\| !rowHasKey/);
  assert.match(source, /Age-verification records are view-only here/);
});

test("manual policy baseline grants only age-verification reads to authenticated clients", () => {
  const source = read("../supabase/policies.sql");
  assert.match(source, /drop policy if exists "users can create own age verification"/i);
  assert.match(source, /drop policy if exists "users can update own age verification"/i);
  assert.match(source, /revoke all on table public\.age_verifications from public, anon, authenticated/i);
  assert.match(source, /grant select on table public\.age_verifications to authenticated/i);
  assert.doesNotMatch(source, /'account_entitlements','age_verifications','academy_coach_seats'/);
});

test("all profile editors lock DOB after first submission", () => {
  const mobile = read("../AthleteN-Mobile/src/app/profile.tsx");
  assert.ok(mobile.includes("profile?.date_of_birth && dob.trim()!==String(profile.date_of_birth)"));
  assert.ok(mobile.includes("editable={!profile?.date_of_birth}"));

  const web = read("../src/App.tsx");
  assert.ok(web.includes("values.date_of_birth!==undefined && String(values.date_of_birth)!==String(data.profile.date_of_birth)"));
  assert.ok(web.includes("readOnly={Boolean(profile.date_of_birth)}"));

  const gate = read("../src/components/account/AgeVerificationGate.tsx");
  assert.ok(gate.includes("dateOfBirthLocked = Boolean(profile.date_of_birth || status?.date_of_birth)"));
  assert.ok(gate.includes("readOnly={dateOfBirthLocked}"));
});

test("mobile approval UI refreshes profile when approval is already complete", () => {
  const source = read("../AthleteN-Mobile/src/components/age-verification-screen.tsx");
  assert.match(source, /data\.status==='approved'\|\|data\.status==='not_required'/);
  assert.match(source, /await refreshProfile\(\)/);
});
