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
  const resourceStart = sql.indexOf("create or replace function private.platform_admin_resource_allowed");
  const resourceEnd = sql.indexOf("$function$;", resourceStart);
  const resourceFn = sql.slice(resourceStart, resourceEnd);
  assert.ok(resourceFn.indexOf("if p_table='student_verifications'") < resourceFn.indexOf("if v_full_access then return true"));
  assert.ok(resourceFn.includes("elsif p_table in ('subscriptions','subscription_usage','account_entitlements','payment_orders','payment_events')"));
  assert.ok(resourceFn.includes("elsif p_table='ai_usage_events'"));
  assert.ok(resourceFn.includes("elsif p_table='audit_logs'"));
  assert.ok(resourceFn.includes("elsif p_table='age_verifications'"));
  assert.ok(resourceFn.includes("return p_action='select' and v_full_access;"));

  assert.match(sql, /as restrictive for select to authenticated/i);
  assert.match(sql, /as restrictive for insert to authenticated/i);
  assert.match(sql, /as restrictive for update to authenticated/i);
  assert.match(sql, /as restrictive for delete to authenticated/i);
  assert.ok(resourceFn.includes("if p_table='student_verifications' then"));
  assert.ok(resourceFn.includes("elsif p_table='age_verifications' then"));
  assert.ok(resourceFn.includes("elsif p_table in ('subscriptions','subscription_usage','account_entitlements','payment_orders','payment_events')"));
  assert.ok(resourceFn.includes("when 'support_tickets','feedback_items' then"));
  assert.ok(resourceFn.includes("when 'feature_flags' then"));
  assert.ok(resourceFn.includes("when 'announcements' then"));

  assert.match(sql, /p_action in \('select','update'\) and private\.platform_admin_has_permission\('flags\.manage'\)/);
  assert.match(sql, /p_action in \('select','insert','update'\) and private\.platform_admin_has_permission\('announcements\.manage'\)/);
  assert.match(sql, /create trigger platform_feature_flags_audit/i);
  assert.match(sql, /create trigger platform_announcements_audit/i);
  assert.match(webExtensions, /feature_flags/);
  assert.match(webExtensions, /announcements/);
  assert.match(webExtensions, /admin_set_user_role/);
  assert.match(mobileOperations, /announcements/);
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
  assert.match(sql, /verification\.athlete\.manage/);
  assert.match(sql, /create or replace function public\.search_athlete_verification_reviews/i);
  assert.match(sql, /create or replace function public\.admin_set_athlete_verified/i);
  assert.match(sql, /evidence-review reason \(5–500 characters\)/);
  assert.match(webExtensions, /search_athlete_verification_reviews/);
  assert.match(webExtensions, /admin_set_athlete_verified/);
  assert.match(mobileOperations, /search_athlete_verification_reviews/);
  assert.match(mobileOperations, /admin_set_athlete_verified/);

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
  assert.match(sql, /create or replace function private\.platform_account_is_active/i);
  assert.match(sql, /platform_account_is_active\(\)\) or \(select private\.is_super_admin\(\)\)/);
  assert.match(fn, /insert into public\.platform_admin_audit_log/i);
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

test("overview metrics are filtered by each administrator's permission scope", () => {
  const start = sql.indexOf("create or replace function public.get_platform_admin_overview");
  const end = sql.indexOf("$function$;", start);
  const fn = sql.slice(start, end);
  assert.ok(fn.includes("'active_subscriptions', case when private.platform_admin_has_permission('billing.read')"));
  assert.ok(fn.includes("'open_support_tickets', case when private.platform_admin_has_permission('support.read')"));
  assert.ok(fn.includes("'pending_student_verifications', case when private.platform_admin_has_permission('verification.read')"));
  assert.ok(fn.includes("'users', case when private.platform_admin_has_permission('platform.read')"));
});

test("Support Admin actions are audited and Finance Admin data is read-only", () => {
  assert.ok(sql.includes("create or replace function private.audit_platform_support_change"));
  assert.ok(sql.includes("create trigger platform_support_ticket_audit"));
  assert.ok(sql.includes("create trigger platform_feedback_audit"));
  assert.ok(webExtensions.includes("support_tickets"));
  assert.ok(webExtensions.includes("feedback_items"));
  assert.ok(webExtensions.includes("canManageSupport"));
  assert.ok(webExtensions.includes("payment_events"));
  assert.ok(webExtensions.includes("canReadFinance"));
  assert.ok(mobileOperations.includes("support_tickets"));
  assert.ok(mobileOperations.includes("feedback_items"));
  assert.ok(mobileOperations.includes("payment_events"));
  assert.ok(webExtensions.includes("cannot change plan entitlements, mark a payment successful, issue refunds"));
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

test("Athlete profile verification is scoped, reasoned, notified and audited", () => {
  const searchStart = sql.indexOf("create or replace function public.search_athlete_verification_reviews");
  const reviewStart = sql.indexOf("create or replace function public.admin_set_athlete_verified");
  const reviewEnd = sql.indexOf("$function$;", reviewStart);
  const reviewFn = sql.slice(reviewStart, reviewEnd);
  assert.ok(searchStart >= 0 && reviewStart > searchStart && reviewEnd > reviewStart);
  assert.ok(sql.slice(searchStart, reviewStart).includes("verification.read"));
  assert.ok(reviewFn.includes("verification.athlete.manage"));
  assert.ok(reviewFn.includes("p_reason is null"));
  assert.ok(sql.includes("create or replace function public.enforce_profile_entitlement_security"));
  assert.ok(reviewFn.includes("set_config('athleten.platform_athlete_verification_mutation','1',true)"));
  assert.ok(reviewFn.includes("char_length(btrim(p_reason)) not between 5 and 500"));
  assert.ok(reviewFn.includes("p.role='athlete'"));
  assert.ok(reviewFn.includes("insert into public.platform_admin_audit_log"));
  assert.ok(reviewFn.includes("insert into public.notifications"));
  assert.ok(webExtensions.includes("search_athlete_verification_reviews"));
  assert.ok(webExtensions.includes("admin_set_athlete_verified"));
  assert.ok(mobileOperations.includes("search_athlete_verification_reviews"));
  assert.ok(mobileOperations.includes("admin_set_athlete_verified"));
});

test("platform overview only returns metrics within the caller's permission scope", () => {
  const start = sql.indexOf("create or replace function public.get_platform_admin_overview");
  const end = sql.indexOf("$function$;", start);
  const fn = sql.slice(start, end);
  assert.ok(fn.includes("'active_subscriptions', case when private.platform_admin_has_permission('billing.read')"));
  assert.ok(fn.includes("'pending_student_verifications', case when private.platform_admin_has_permission('verification.read')"));
  assert.ok(fn.includes("'open_support_tickets', case when private.platform_admin_has_permission('support.read')"));
  assert.ok(fn.includes("'restricted_accounts', case when private.platform_admin_has_permission('account.manage')"));
  assert.ok(webExtensions.includes("filter(([,value])=>value!==null&&value!==undefined)"));
  assert.ok(mobileOperations.includes("filter(([,value])=>value!==null&&value!==undefined)"));
});

test("Support and Finance workspaces enforce scoped read/write boundaries", () => {
  assert.match(sql, /revoke update on public\.support_tickets, public\.feedback_items from public, anon, authenticated/i);
  assert.match(sql, /grant update \(status,priority,assigned_to,updated_at\) on public\.support_tickets to authenticated/i);
  assert.match(sql, /create trigger support_tickets_admin_audit/i);
  assert.match(sql, /create trigger feedback_items_admin_audit/i);
  assert.match(sql, /Support Admins may assign tickets only to themselves/);
  assert.match(webExtensions, /canReadSupport = has\("support\.read"\)/);
  assert.match(webExtensions, /canReadFinance = has\("billing\.read"\)/);
  assert.match(webExtensions, /updateSupportTicket/);
  assert.match(webExtensions, /updateFeedbackItem/);
  assert.match(webExtensions, /Read-only provider-backed records/);
  assert.match(mobileOperations, /Support & Dispute Queue/);
  assert.match(mobileOperations, /Subscription & Payment Ledger/);
});

test("age-verification guardian approval remains separate and generic admin data stays minimised", () => {
  assert.match(webAdmin, /ageVerificationReadOnly = selected === "ageVerifications"/);
  assert.match(webAdmin, /select\("id,user_id,status,approved_at,rejected_at,created_at,updated_at"\)/);
  assert.doesNotMatch(webAdmin, /select\("id,user_id,date_of_birth,parent_email/);
  assert.match(webAdmin, /Age-verification records are view-only here/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.get_my_platform_admin_permissions\(\) FROM public, anon/i);
});
