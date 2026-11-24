import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const mobile = read("../AthleteN-Mobile/src/app/(tabs)/academy.tsx");
const navigation = read("../AthleteN-Mobile/src/app/navigation-settings.tsx");
const navigationConfig = read("../AthleteN-Mobile/src/lib/academy-navigation.ts");
const web = read("../src/components/coach/CoachAcademyDashboard.tsx");

test("Academy navigation exposes the complete operations workspace without changing athlete shortcuts", () => {
  for (const section of ["Dashboard", "People", "Coaches", "Training", "Attendance", "Events", "Calendar", "Intelligence", "Achievements", "Approvals", "Communication", "Finance", "AI"]) {
    assert.match(navigationConfig, new RegExp(`id:'${section}'`));
  }
  assert.match(navigation, /mode.*academy/);
  assert.match(navigation, /ACADEMY_NAV_KEY/);
  assert.match(navigation, /set_my_navigation_preferences/);
  assert.match(navigation, /athleten-academy-navigation-updated/);
  assert.match(mobile, /athleten-academy-navigation-updated/);
});

test("Academy roster and coach workload queries stay inside active Academy memberships", () => {
  assert.match(mobile, /from\('academy_memberships'\)[\s\S]*?eq\('academy_id',profile\.academy_id\)/);
  assert.match(mobile, /const activeAthleteIds=base\.filter\(x=>x\.role==='athlete'&&x\.status==='active'\)/);
  assert.match(mobile, /const coachIds=base\.filter\(x=>x\.role==='coach'&&x\.status==='active'\)/);
  assert.match(mobile, /in\('coach_user_id',coachIds\)\.in\('athlete_user_id',activeAthleteIds\)/);
  assert.match(web, /in\("coach_user_id",academyCoachIds\)\.in\("athlete_user_id",academyAthleteIds\)/);
});

test("Academy competitions, training history, medals and certificates use active athlete IDs", () => {
  assert.match(mobile, /from\('tournaments'\)[\s\S]*?in\('user_id',activeAthleteIds\)/);
  assert.match(mobile, /from\('training_sessions'\)[\s\S]*?in\('user_id',activeAthleteIds\)/);
  assert.match(mobile, /from\('medals'\)[\s\S]*?in\('user_id',activeAthleteIds\)/);
  assert.match(mobile, /from\('certificates'\)[\s\S]*?in\('user_id',activeAthleteIds\)/);
});

test("Attendance oversight is read-only and joins attendance to Academy group sessions", () => {
  assert.match(mobile, /from\('training_group_sessions'\)[\s\S]*?in\('group_id',groupIds\)/);
  assert.match(mobile, /from\('training_group_attendance'\)[\s\S]*?in\('session_id'/);
  assert.match(mobile, /Coach.*record attendance in their assigned training groups/);
  assert.doesNotMatch(mobile, /from\('training_group_attendance'\)\.update\(/);
  assert.doesNotMatch(mobile, /from\('training_group_attendance'\)\.insert\(/);
});

test("Academy approval oversight never lets an administrator review another Coach's request", () => {
  assert.match(mobile, /request\.coach_user_id!==session\?\.user\?\.id/);
  assert.match(mobile, /row\.coach_user_id===session\?\.user\?\.id/);
  assert.match(web, /r\.coach_user_id===userId/);
  assert.match(web, /Assigned Coach review/);
  assert.match(mobile, /rpc\('review_coach_approval'/);
});

test("Academy communication opens existing group conversations without inventing a broadcast pipeline", () => {
  assert.match(mobile, /conversation_id/);
  assert.match(mobile, /pathname:'\/messages',params:\{conversationId:g\.conversation_id\}/);
  assert.match(mobile, /Direct conversations, group management, replies and notifications/);
  assert.match(mobile, /broadcast\/announcement feature.*not enabled in this release/);
});

test("Academy AI and finance summaries use existing ledger and subscription usage records", () => {
  assert.match(mobile, /reserve_ai_usage/);
  assert.match(mobile, /training logs in the last 90 days/);
  assert.match(mobile, /finance_transactions/);
  assert.match(mobile, /financeIncome-financeExpense/);
  assert.match(mobile, /not a payment gateway/);
});
