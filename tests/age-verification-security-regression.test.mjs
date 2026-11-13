import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the applied production migration removes client writes and legacy token RPC access", () => {
  const sql = read("../supabase/migrations/20261112092215_age_verification_server_owned_approval_hardening_20261112.sql");
  assert.match(sql, /DROP POLICY IF EXISTS "users can create own age verification"/i);
  assert.match(sql, /DROP POLICY IF EXISTS "users can update own age verification"/i);
  assert.ok(sql.includes("REVOKE ALL PRIVILEGES ON TABLE public.age_verifications FROM PUBLIC, anon, authenticated"));
  assert.ok(sql.includes("REVOKE ALL PRIVILEGES ON FUNCTION public.prepare_parent_approval(text) FROM PUBLIC, anon, authenticated"));
  assert.match(sql, /v_age < 18 AND v_status = 'not_required'/i);
});

test("age verification SQL draft removes client-write paths and makes DOB immutable", () => {
  const sql = read("../supabase/security/age_verification_hardening.sql");
  assert.match(sql, /REVIEWED DRAFT ONLY — NOT A DEPLOYABLE MIGRATION/);
  assert.match(sql, /drop policy if exists "users can create own age verification"/i);
  assert.match(sql, /drop policy if exists "users can update own age verification"/i);
  assert.ok(sql.includes("create trigger prevent_profile_dob_rewrite"));
  assert.ok(sql.includes("create trigger prevent_profile_dob_mismatch_insert"));
  assert.ok(sql.includes("a.date_of_birth is distinct from new.date_of_birth"));
  assert.ok(sql.includes("old.date_of_birth is not null"));
  assert.ok(sql.includes("new.date_of_birth is distinct from old.date_of_birth"));
  assert.ok(sql.includes("current_user not in ('postgres', 'service_role')"));
  assert.ok(sql.includes("Do not use a custom GUC here"));
  assert.ok(!sql.includes("athleten.dob_correction"));
  assert.ok(sql.includes("select p.date_of_birth") && sql.includes("for update"));
  assert.ok(sql.includes("if v_profile_dob is null then"));
  assert.ok(sql.includes("Complete your profile date of birth before age verification."));
  assert.match(sql, /revoke all on table public\.age_verifications from public, anon, authenticated/i);
  assert.ok(sql.includes("grant select ("));
  assert.ok(sql.includes("token_expires_at") && sql.includes("approved_at"));
  assert.ok(!sql.includes("grant select on table public.age_verifications to authenticated"));
  const sqlRevokeStart = sql.indexOf("revoke all on table public.age_verifications");
  const sqlGrantStart = sql.indexOf("grant select (", sqlRevokeStart);
  const sqlGrantEnd = sql.indexOf(") on table public.age_verifications", sqlGrantStart);
  assert.ok(sqlRevokeStart >= 0 && sqlGrantStart > sqlRevokeStart && sqlGrantEnd > sqlGrantStart);
  assert.doesNotMatch(sql.slice(sqlGrantStart, sqlGrantEnd), /token_hash/);

  assert.match(sql, /set search_path = ''/i);
  assert.match(sql, /on conflict \(user_id\) do nothing/i);
  assert.match(sql, /v_existing_dob is distinct from p_date_of_birth/i);
  assert.match(sql, /Date of birth is locked after first submission/i);
  assert.match(sql, /v_age < 18 and v_status = 'not_required'/i);
  assert.match(sql, /set status = 'pending'/i);
  assert.match(sql, /v_age >= 18 and v_status in \('pending', 'rejected'\)/i);
  assert.match(sql, /set status = 'not_required'/i);
  assert.match(sql, /create or replace function public\\.is_age_approved\\(p_user_id uuid\\)/i);
  assert.match(sql, /a\\.status = 'not_required'[\\s\\S]*?a\\.date_of_birth <= \\(current_date - interval '18 years'\\)::date/i);
  assert.match(sql, /p_user_id = \\(select auth\\.uid\\(\\)\\)[\\s\\S]*?private\\.qa_age_verification_overrides/i);
  assert.match(sql, /revoke all on function public\\.is_age_approved\\(uuid\\) from public, anon/i);
  assert.match(sql, /revoke all on function public\.prepare_parent_approval\(text\) from public, anon, authenticated/i);
  assert.doesNotMatch(sql, /on conflict\s*\(user_id\)\s*do update/i);
});

test("parent approval edge function preserves approved states and only reissues pending or rejected requests", () => {
  const source = read("../supabase/functions/start-parent-approval/index.ts");
  assert.match(source, /YYYY-MM-DD format/);
  assert.match(source, /date of birth is locked/i);
  assert.match(source, /get_age_verification_status/);
  assert.ok(source.includes(".from('profiles')") && source.includes(".select('date_of_birth')"));
  assert.ok(source.includes("if (!profileRow)"));
  assert.ok(source.includes("if (!profileRow.date_of_birth)"));
  assert.ok(source.includes(".update({ date_of_birth: dateOfBirth })"));
  assert.ok(source.includes(".is('date_of_birth', null)"));
  assert.ok(!source.includes("if (!profileRow?.date_of_birth)"));
  assert.ok(source.includes("currentAge?.date_of_birth && currentAge.date_of_birth !== dateOfBirth"));
  assert.ok(source.includes("currentAge?.status === 'approved'"));
  assert.ok(!source.includes("currentAge?.status === 'approved' || currentAge?.status === 'not_required'"));
  assert.ok(source.includes("if (currentAge?.status === 'approved')"));
  assert.ok(!source.includes("currentAge?.status === 'not_required'"), "legacy not_required records must reach the database re-check instead of short-circuiting in the Edge Function");
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
  assert.match(source, /\.gt\('token_expires_at', now\)/);
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
  assert.ok(source.includes("grant select ("));
  assert.ok(!source.includes("grant select on table public.age_verifications to authenticated"));
  const policyRevokeStart = source.indexOf("revoke all on table public.age_verifications");
  const policyGrantStart = source.indexOf("grant select (", policyRevokeStart);
  const policyGrantEnd = source.indexOf(") on table public.age_verifications", policyGrantStart);
  assert.ok(policyRevokeStart >= 0 && policyGrantStart > policyRevokeStart && policyGrantEnd > policyGrantStart);
  assert.doesNotMatch(source.slice(policyGrantStart, policyGrantEnd), /token_hash/);

  assert.doesNotMatch(source, /'account_entitlements','age_verifications','academy_coach_seats'/);
});

test("all profile editors lock DOB after first submission", () => {
  const mobile = read("../AthleteN-Mobile/src/app/profile.tsx");
  assert.ok(mobile.includes("profile?.date_of_birth && dob.trim()!==String(profile.date_of_birth)"));
  assert.ok(mobile.includes("editable={!profile?.date_of_birth}"));
  const mobileGate = read("../AthleteN-Mobile/src/components/age-verification-screen.tsx");
  assert.ok(mobileGate.includes("setDobLocked(true)"));
  assert.ok(mobileGate.includes("editable={!dobLocked}"));
  assert.ok(mobileGate.includes("!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)"));
  assert.ok(mobileGate.includes("d.getFullYear()!==year||d.getMonth()!==month-1||d.getDate()!==day"));

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


test("guardian approval link requires an explicit guardian action and never approves on page load", () => {
  const source = read("../src/components/account/AgeVerificationGate.tsx");
  const approvalPage = source.slice(source.indexOf("export function ParentApprovalPage()"));
  assert.ok(approvalPage.includes("Confirm parent/guardian approval"));
  assert.match(approvalPage, /onClick=\{\(\) => void confirmApproval\(\)\}/);
  assert.match(approvalPage, /async function confirmApproval\(\)/);
  assert.match(approvalPage, /supabase\.functions\.invoke\("approve-parent"/);
  assert.doesNotMatch(approvalPage, /useEffect\s*\(/);
});

test("adult age verification completes without requiring a guardian email", () => {
  const source = read("../supabase/functions/start-parent-approval/index.ts");
  const adultNoGuardianReturn = source.indexOf("if (ageYears >= 18) return json({ status: 'not_required'");
  const guardianEmailValidation = source.indexOf("if (!parentEmail || parentEmail.length > 254");
  assert.ok(adultNoGuardianReturn >= 0, "adult flow should complete without a guardian");
  assert.ok(guardianEmailValidation > adultNoGuardianReturn, "guardian email validation must run only after the adult early return");
});

test("legacy profiles can save DOB exactly once before age verification", () => {
  const source = read("../supabase/functions/start-parent-approval/index.ts");
  const ageStatusRead = source.indexOf("get_age_verification_status");
  const firstDobWrite = source.indexOf(".update({ date_of_birth: dateOfBirth })");
  const nullCompareAndSet = source.indexOf(".is('date_of_birth', null)");
  const approvedReturn = source.indexOf("if (currentAge?.status === 'approved')");
  const ageRecordWrite = source.indexOf("rpc('record_age_profile'");
  assert.ok(ageStatusRead >= 0 && ageStatusRead < firstDobWrite, "existing age record must be checked before locking the first profile DOB");
  assert.ok(firstDobWrite >= 0, "missing profile DOB should be saved once");
  assert.ok(nullCompareAndSet > firstDobWrite, "first DOB save must be conditional on NULL");
  assert.ok(approvedReturn > nullCompareAndSet, "matching profile DOB must be saved before returning an existing approval");
  assert.ok(ageRecordWrite > approvedReturn, "approval should be preserved before re-recording the age profile");
});
