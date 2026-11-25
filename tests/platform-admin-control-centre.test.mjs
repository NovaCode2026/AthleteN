import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const sql = read("../supabase/migrations/20261125000000_platform_admin_control_centre.sql");
const webAdmin = read("../src/components/admin/AdminControlCenter.tsx");
const webExtensions = read("../src/components/admin/PlatformAdminExtensions.tsx");
const mobileAdmin = read("../AthleteN-Mobile/src/app/admin-panel.tsx");
const mobileOperations = read("../AthleteN-Mobile/src/app/admin-operations.tsx");

test("platform admin scopes are least-privilege and RLS-enforced", () => {
  assert.match(sql, /create table if not exists public\.platform_admin_assignments/i);
  assert.match(sql, /permission_role text not null check \(permission_role in \('support','verification','finance','operations'\)\)/i);
  assert.match(sql, /create or replace function private\.platform_admin_resource_allowed/i);
  assert.match(sql, /as restrictive for select to authenticated/i);
  assert.match(sql, /as restrictive for insert to authenticated/i);
  assert.match(sql, /as restrictive for update to authenticated/i);
  assert.match(sql, /as restrictive for delete to authenticated/i);
  assert.match(sql, /when 'student_verifications','age_verifications' then/i);
  assert.match(sql, /when 'subscriptions','subscription_usage','account_entitlements','payment_orders','payment_events' then/i);
  assert.match(sql, /when 'support_tickets','feedback_items' then/i);
  assert.match(sql, /when 'feature_flags' then/i);
  assert.match(sql, /when 'announcements' then/i);
  assert.match(sql, /when 'audit_logs' then/i);
  assert.match(sql, /grant execute on function private\.platform_admin_resource_allowed\(text,text\) to authenticated/i);
  assert.match(sql, /revoke all on public\.platform_admin_assignments,[\s\S]*?from public, anon, authenticated/i);
});

test("Super Admin alone can change core platform roles and every change is audited", () => {
  const start = sql.indexOf("create or replace function public.admin_set_user_role");
  const end = sql.indexOf("$function$;", start);
  const fn = sql.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(fn, /role='super_admin'/i);
  assert.match(fn, /platform\.roles\.manage/);
  assert.match(fn, /athleten\.privileged_profile_mutation/);
  assert.match(fn, /insert into public\.platform_admin_audit_log/i);
  assert.match(fn, /insert into public\.audit_logs/i);
  assert.match(sql, /revoke all on function public\.admin_set_user_role\(uuid,text\) from public, anon/i);
});

test("Student verification decisions require a reason and use an audited server RPC", () => {
  const start = sql.indexOf("create or replace function public.admin_review_student_verification");
  const end = sql.indexOf("$function$;", start);
  const fn = sql.slice(start, end);
  assert.match(fn, /verification\.review/);
  assert.match(fn, /p_reason is null/);
  assert.match(fn, /char_length\(btrim\(p_reason\)\) not between 5 and 500/);
  assert.match(fn, /for update of sv/i);
  assert.match(fn, /insert into public\.platform_admin_audit_log/i);
  assert.match(fn, /insert into public\.notifications/i);
  assert.match(sql, /create or replace function public\.get_student_verification_queue/i);
  assert.match(sql, /bucket_id='verification-proofs'[\s\S]*?platform_admin_has_permission\('verification\.review'\)/);
  assert.match(webExtensions, /admin_review_student_verification/);
  assert.match(webExtensions, /createSignedUrl\(row\.file_path, 120\)/);
  assert.match(mobileOperations, /admin_review_student_verification/);
  assert.match(mobileOperations, /createSignedUrl\(row\.file_path, 120\)/);
});

test("account restrictions require reasons and gate core data while preserving profile and support access", () => {
  const start = sql.indexOf("create or replace function public.admin_set_platform_account_access");
  const end = sql.indexOf("$function$;", start);
  const fn = sql.slice(start, end);
  assert.match(fn, /account\.manage/);
  assert.match(fn, /p_reason is null/);
  assert.match(fn, /char_length\(btrim\(p_reason\)\) not between 5 and 500/);
  assert.match(fn, /p_status='restricted'[\s\S]*?p_expires_at<=pg_catalog\.now\(\)/);
  assert.match(fn, /v_target_role='super_admin'/);
  assert.match(fn, /insert into public\.platform_admin_audit_log/i);
  assert.match(sql, /create or replace function private\.platform_account_is_active/i);
  assert.match(sql, /platform_account_is_active\(\) or \(select private\.is_super_admin\(\)\)/);
  assert.match(sql, /create or replace function public\.search_platform_accounts/i);
  assert.match(webExtensions, /admin_set_platform_account_access/);
  assert.match(mobileOperations, /admin_set_platform_account_access/);
  assert.match(webExtensions, /Login sessions are not forcibly terminated/);
  assert.match(mobileOperations, /does not forcibly terminate authentication sessions/);
});

test("billing and subscription settlement cannot be manually changed in generic admin interfaces", () => {
  assert.match(webAdmin, /financialStateReadOnly = \["subscriptions","subscriptionUsage","accountEntitlements","paymentOrders","paymentEvents"\]/);
  assert.match(webAdmin, /Payment activation, refunds, subscription state and entitlement changes are not manually editable here/);
  assert.doesNotMatch(mobileAdmin, /admin_set_user_plan/);
  assert.doesNotMatch(mobileAdmin, /setPlan\(/);
  assert.match(webExtensions, /Payment activation, refunds and subscription settlement remain provider\/webhook-controlled/);
});

test("web and mobile admin surfaces use database-returned permission scopes", () => {
  assert.match(webAdmin, /get_my_platform_admin_permissions/);
  assert.match(webAdmin, /canManage = adminPermissionLoaded && \(isSuperAdmin \|\| adminPermissions\.includes\("\*"\)\)/);
  assert.match(webAdmin, /<PlatformAdminExtensions userId=\{userId\} role=\{role\} \/>/);
  assert.match(mobileAdmin, /get_my_platform_admin_permissions/);
  assert.match(mobileAdmin, /if \(full\)/);
  assert.match(mobileAdmin, /canManageFlags/);
  assert.match(mobileOperations, /get_platform_admin_overview/);
  assert.match(mobileOperations, /get_platform_admin_assignments/);
  assert.match(mobileOperations, /get_platform_admin_audit/);
  assert.match(mobileOperations, /get_platform_account_access_controls/);
});

test("age-verification guardian approval remains separate and generic admin data stays minimised", () => {
  assert.match(webAdmin, /ageVerificationReadOnly = selected === "ageVerifications"/);
  assert.match(webAdmin, /select\("id,user_id,status,approved_at,rejected_at,created_at,updated_at"\)/);
  assert.doesNotMatch(webAdmin, /select\("id,user_id,date_of_birth,parent_email/);
  assert.match(webAdmin, /Age-verification records are view-only here/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.get_my_platform_admin_permissions\(\) FROM public, anon/i);
});
