import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("web Student verification review uses the audited RPC, not direct table updates", () => {
  const source = read("../src/components/admin/AdminControlCenter.tsx");
  assert.match(source, /studentVerificationReadOnly/);
  assert.match(source, /verificationStatusFilter/);
  assert.match(source, /supabase\.rpc\("admin_review_student_verification"/);
  assert.match(source, /createSignedUrl\(path, 300\)/);
  assert.match(source, /required for rejection/i);
  assert.doesNotMatch(source, /from\("student_verifications"\)\s*\.update/);
});

test("database review RPC enforces platform admin, pending-only decisions and audit logging", () => {
  const sql = read("../supabase/migrations/20261125090000_admin_verification_center_audit.sql");
  assert.match(sql, /security definer/i);
  assert.match(sql, /private\.is_platform_admin\(\)/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /v_row\.status <> 'pending'/i);
  assert.match(sql, /p_status = 'rejected' and v_notes is null/i);
  assert.match(sql, /VERIFICATION_PROOF_REQUIRED/);
  assert.match(sql, /insert into public\.audit_logs/i);
  assert.match(sql, /revoke all on function public\.admin_review_student_verification/i);
  assert.match(sql, /grant execute on function public\.admin_review_student_verification[\s\S]*to authenticated/i);
  assert.match(sql, /Platform admins can read verification proofs/i);
  assert.match(sql, /bucket_id = 'verification-proofs'[\s\S]*private\.is_platform_admin/i);
});

test("mobile Student verification center has role guards and the same audited decision path", () => {
  const screen = read("../AthleteN-Mobile/src/app/admin-verifications.tsx");
  const panel = read("../AthleteN-Mobile/src/app/admin-panel.tsx");
  assert.match(screen, /support_admin.*admin.*super_admin/);
  assert.match(screen, /admin_review_student_verification/);
  assert.match(screen, /createSignedUrl\(path, 300\)/);
  assert.match(screen, /required for rejection/i);
  assert.match(panel, /Student Verification Queue/);
  assert.match(panel, /admin-verifications/);
});

test("mobile generic admin CRUD cannot edit Student verification workflow records", () => {
  const source = read("../AthleteN-Mobile/src/app/admin.tsx");
  assert.match(source, /workflowManagedResource = selected === "student_verifications"/);
  assert.match(source, /if \(workflowManagedResource\) \{ router\.push\("\/admin-verifications"\)/);
  assert.match(source, /createOpen && !workflowManagedResource/);
});

test("age verification remains on the guardian approval workflow", () => {
  const source = read("../src/components/admin/AdminControlCenter.tsx");
  assert.match(source, /ageVerificationReadOnly = selected === "ageVerifications"/);
  assert.match(source, /DOB corrections and guardian approval decisions/);
  assert.match(source, /!ageVerificationReadOnly/);
});
