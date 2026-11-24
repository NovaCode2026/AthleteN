import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261124235000_academy_management_suite.sql");
const mobile = read("../AthleteN-Mobile/src/app/academy-operations.tsx");
const team = read("../AthleteN-Mobile/src/app/team.tsx");
const web = read("../src/components/coach/AcademyManagementSuite.tsx");
const dashboard = read("../src/components/coach/CoachAcademyDashboard.tsx");

test("Academy Management Suite has all ten server-backed data domains", () => {
  for (const table of [
    "academy_fee_invoices", "academy_fee_payments", "academy_coach_attendance",
    "academy_coach_availability", "academy_athlete_transfer_requests",
    "academy_announcements", "academy_guardian_links", "academy_report_exports",
    "academy_seat_requests", "academy_notification_preferences",
    "academy_staff_assignments", "academy_audit_log"
  ]) assert.match(migration, new RegExp("create table if not exists public\\." + table + "\\b"));
});

test("new tables use RLS and deny inherited direct client writes by default", () => {
  for (const table of [
    "academy_staff_assignments", "academy_fee_invoices", "academy_fee_payments",
    "academy_coach_attendance", "academy_coach_availability",
    "academy_athlete_transfer_requests", "academy_announcements",
    "academy_guardian_links", "academy_report_exports", "academy_seat_requests",
    "academy_notification_preferences", "academy_audit_log"
  ]) assert.match(migration, new RegExp("alter table public\\." + table + " enable row level security"));
  assert.match(migration, /from public,anon,authenticated/);
  assert.match(migration, /grant insert,update on public\.academy_coach_attendance,public\.academy_coach_availability,public\.academy_notification_preferences to authenticated/);
  assert.doesNotMatch(migration, /grant insert,update,delete on public\.academy_audit_log/);
});

test("fee invoices validate Academy membership and partial payments cannot exceed the invoice", () => {
  assert.match(migration, /academy_create_fee_invoice/);
  assert.match(migration, /m\.role='athlete' and m\.status='active'/);
  assert.match(migration, /academy_record_fee_payment/);
  assert.match(migration, /v_paid\+p_amount>v_invoice\.amount/);
  assert.match(mobile, /academy_create_fee_invoice/);
  assert.match(web, /academy_record_fee_payment/);
  assert.match(mobile, /RECORD MANUAL PAYMENT/);
  assert.match(web, /Record payment/);
});

test("Coach attendance and availability writes are constrained to active Coach members", () => {
  assert.match(migration, /academy_coach_attendance_insert/);
  assert.match(migration, /m\.user_id=academy_coach_attendance\.coach_user_id and m\.role='coach' and m\.status='active'/);
  assert.match(migration, /academy_coach_availability_write/);
  assert.match(mobile, /academy_coach_attendance/);
  assert.match(mobile, /academy_coach_availability/);
});

test("Athlete transfers require athlete initiation, both Coach stages and Academy approval", () => {
  assert.match(migration, /Only an active Academy athlete can request a transfer/);
  assert.match(migration, /pending_current_coach/);
  assert.match(migration, /pending_target_coach/);
  assert.match(migration, /pending_academy_review/);
  assert.match(migration, /Only the requesting athlete can withdraw this request/);
  assert.match(migration, /update public\.coach_athlete_links set status='ended'/);
  assert.match(mobile, /academy_request_athlete_transfer/);
  assert.match(team, /Open Academy Portal/);
});

test("Guardian access requires guardian acceptance and athlete-approved limited scopes", () => {
  assert.match(migration, /pending_guardian/);
  assert.match(migration, /guardian_accepted_at is not null/);
  assert.match(migration, /Only an active Academy athlete can request a transfer/);
  assert.match(migration, /array\['announcements','calendar','attendance_summary','fee_status'\]/);
  assert.match(migration, /e\.event_type not in \('medical','recovery'\)/);
  assert.match(mobile, /academy_accept_guardian_link/);
  assert.match(mobile, /academy_approve_guardian_link/);
  assert.match(mobile, /adult-authorized consent review/);
});

test("Academy announcements respect account and Academy notification preferences", () => {
  assert.match(migration, /coalesce\(np\.coach_academy,true\)=true/);
  assert.match(migration, /coalesce\(anp\.announcements,true\)=true/);
  assert.match(migration, /academy_publish_announcement/);
  assert.match(migration, /private\.enqueue_academy_notification/);
  assert.match(migration, /academy_management_notify_event/);
  assert.match(migration, /academy_fee_invoice_notify/);
  assert.match(migration, /academy_transfer_notify/);
  assert.match(migration, /academy_seat_request_notify/);
  assert.match(mobile, /academy_publish_announcement/);
  assert.match(web, /academy_publish_announcement/);
});

test("Reports and Coach seats are logged and paid seats remain pending without provider confirmation", () => {
  assert.match(migration, /academy_record_report_export/);
  assert.match(migration, /payment_pending/);
  assert.match(migration, /verified payment-provider webhook/);
  assert.match(mobile, /Share\.share/);
  assert.match(web, /createObjectURL/);
});

test("Staff assignments are bounded and the audit table has no direct client write policy", () => {
  assert.match(migration, /p_permissions <@ v_allowed/);
  assert.match(migration, /Only an active Academy Coach can be assigned a staff permission set/);
  assert.match(migration, /academy_audit_sensitive_change/);
  assert.match(migration, /changed_fields/);
  assert.match(migration, /There are intentionally no direct INSERT\/UPDATE\/DELETE policies for the audit log/);
  assert.match(mobile, /academy_set_staff_assignment/);
  assert.match(web, /academy_set_staff_assignment/);
});

test("Mobile and web Academy workspaces expose the operations module", () => {
  assert.match(team, /router\.push\('\/academy-operations'\)/);
  assert.match(dashboard, /AcademyManagementSuite/);
  assert.match(dashboard, /"operations","Operations"/);
  for (const id of ["fees","coach","transfers","announcements","guardians","reports","seats","notifications","roles","audit"]) {
    assert.match(mobile, new RegExp("section==='"+id+"'"));
    assert.match(web, new RegExp('section==="'+id+'"'));
  }
});
