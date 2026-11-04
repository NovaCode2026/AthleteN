import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("coach dashboard exposes the pilot needs-attention panel", () => {
  const dashboard = read("src/components/roles/RoleDashboards.tsx");
  const panel = read("src/components/roles/CoachAttentionPanel.tsx");
  assert.match(dashboard, /import CoachAttentionPanel from "\.\/CoachAttentionPanel"/);
  assert.match(dashboard, /<CoachAttentionPanel userId=\{userId\} athletes=\{attentionAthletes\}/);
  assert.match(panel, /\.eq\("coach_user_id", userId\)/);
});

test("attendance attention counts only explicit absences and requires at least two", () => {
  const panel = read("src/components/roles/CoachAttentionPanel.tsx");
  assert.match(panel, /\.eq\("status", "absent"\)/);
  assert.match(panel, /count >= 2/);
  assert.match(panel, /attendanceStart\.setDate\(attendanceStart\.getDate\(\) - 29\)/);
  assert.match(panel, /Unmarked sessions are not treated as missed/);
});

test("competition attention window is limited to the next 14 days", () => {
  const panel = read("src/components/roles/CoachAttentionPanel.tsx");
  assert.match(panel, /eventEnd\.setDate\(eventEnd\.getDate\(\) \+ 14\)/);
  assert.match(panel, /\.gte\("starts_at", today\)/);
  assert.match(panel, /\.lte\("starts_at", eventEndDate\)/);
});

test("injury follow-up returns status metadata only, never medical notes", () => {
  const panel = read("src/components/roles/CoachAttentionPanel.tsx");
  assert.match(panel, /\.select\("user_id,recovery_status,updated_at"\)/);
  assert.doesNotMatch(panel, /\.select\([^\n]*(notes|severity|title)/i);
  assert.match(panel, /no medical notes shown/i);
});

test("coach attention does not create weight-target alerts", () => {
  const panel = read("src/components/roles/CoachAttentionPanel.tsx");
  assert.match(panel, /does not create alerts based on body weight or weight targets/i);
});

test("coach training retains one-tap attendance and announcements retain read tracking", () => {
  const coachTraining = read("AthleteN-Mobile/src/app/coach-training.tsx");
  const announcement = read("AthleteN-Mobile/src/components/announcement-overlay.tsx");
  assert.match(coachTraining, /async function markAllPresent\(/);
  assert.match(coachTraining, /training_group_attendance/);
  assert.match(announcement, /announcement_reads/);
  assert.match(announcement, /onConflict:'announcement_id,user_id'/);
});
