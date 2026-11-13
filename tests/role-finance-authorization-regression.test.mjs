import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("role and finance authorization draft stays review-only and disables unverified role self-enrollment", () => {
  const sql = read("../supabase/security/role_and_finance_authorization_hardening.sql");
  assert.match(sql, /REVIEW DRAFT ONLY — NOT A DEPLOYABLE MIGRATION/);
  assert.match(sql, /revoke all on function public\.switch_my_product_role\(text\) from public, anon, authenticated/i);
  assert.match(sql, /public\.can_manage_finance_account\(account uuid\)/i);
  assert.match(sql, /public\.is_age_approved\(auth\.uid\(\)\)/i);
  assert.match(sql, /p\.role = 'coach'/i);
  assert.match(sql, /p\.role = 'academy_admin'/i);
  assert.match(sql, /am\.role = 'academy_admin'/i);
  assert.match(sql, /am\.status = 'active'/i);
  assert.match(sql, /drop policy if exists "finance accounts owner"/i);
  assert.match(sql, /drop policy if exists "finance transactions owner"/i);
  assert.match(sql, /with check \([\s\S]*public\.is_age_approved\(auth\.uid\(\)\)/i);
  assert.match(sql, /using \(public\.can_manage_finance_account\(account_id\)\)/i);
  assert.match(sql, /with check \(public\.can_manage_finance_account\(account_id\)\)/i);
  assert.match(sql, /Only approved Coach accounts can use Coach Finance/i);
  assert.match(sql, /revoke all on function public\.get_or_create_my_coach_finance_account\(\) from public, anon/i);
});

test("finance helper remains executable by authenticated only because RLS calls it", () => {
  const sql = read("../supabase/security/role_and_finance_authorization_hardening.sql");
  assert.match(sql, /revoke all on function public\.can_manage_finance_account\(uuid\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.can_manage_finance_account\(uuid\) to authenticated/i);
  assert.doesNotMatch(sql, /grant execute on function public\.can_manage_finance_account\(uuid\) to anon/i);
});
