import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("age verification rows are read-only to authenticated clients", () => {
  const sql = read("../supabase/migrations/20261112092215_age_verification_server_owned_approval_hardening_20261112.sql");
  assert.ok(sql.includes('DROP POLICY IF EXISTS "users can create own age verification"'));
  assert.ok(sql.includes('DROP POLICY IF EXISTS "users can update own age verification"'));
  assert.ok(sql.includes("REVOKE ALL PRIVILEGES ON TABLE public.age_verifications FROM PUBLIC, anon, authenticated"));
  assert.ok(sql.includes("GRANT SELECT ON TABLE public.age_verifications TO authenticated"));
});

test("DOB cannot be overwritten and approval state is not reset by profile resubmission", () => {
  const sql = read("../supabase/migrations/20261112092215_age_verification_server_owned_approval_hardening_20261112.sql");
  assert.ok(sql.includes("ON CONFLICT (user_id) DO NOTHING"));
  assert.ok(sql.includes("v_existing_dob IS DISTINCT FROM p_date_of_birth"));
  assert.ok(sql.includes("Date of birth is already recorded"));
  assert.equal(sql.includes("DO UPDATE SET date_of_birth=excluded.date_of_birth"), false);
  assert.ok(sql.includes("v_age < 18 AND v_status = 'not_required'"));
  assert.ok(sql.includes("v_age >= 18 AND v_status = 'pending'"));
});

test("guardian raw-token RPC is not callable by ordinary authenticated clients", () => {
  const sql = read("../supabase/migrations/20261112092215_age_verification_server_owned_approval_hardening_20261112.sql");
  assert.ok(sql.includes("REVOKE ALL PRIVILEGES ON FUNCTION public.prepare_parent_approval(text) FROM PUBLIC, anon, authenticated"));
});

test("parent approval start validates input and only updates the current pending record", () => {
  const source = read("../supabase/functions/start-parent-approval/index.ts");
  assert.ok(source.includes("parsedDob.toISOString().slice(0, 10) !== dateOfBirth"));
  assert.ok(source.includes("Parent or guardian email must be different from the account email."));
  assert.ok(source.includes(".eq('date_of_birth', dateOfBirth)"));
  assert.ok(source.includes(".eq('status', 'pending')"));
  assert.ok(source.includes(".select('user_id')"));
});

test("parent approval atomically consumes only the current, unexpired token", () => {
  const source = read("../supabase/functions/approve-parent/index.ts");
  assert.ok(source.includes(".eq('token_hash', tokenHash)"));
  assert.ok(source.includes(".gt('token_expires_at', now)"));
  assert.ok(source.includes(".select('id')"));
  assert.ok(source.includes("if (!approvedRow)"));
});
