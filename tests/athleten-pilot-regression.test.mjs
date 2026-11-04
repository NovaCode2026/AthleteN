import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("coach group attendance has a canonical analytics mirror and database lock guard", () => {
  const migration = read("supabase/migrations/20261104110000_sync_coach_group_attendance_to_records.sql");
  assert.match(migration, /training_group_session_id uuid/i);
  assert.match(migration, /sync_training_group_attendance_to_records/i);
  assert.match(migration, /on conflict \(training_group_session_id, user_id\)/i);
  assert.match(migration, /coach inserts attendance before lock/i);
  assert.match(migration, /coach updates attendance before lock/i);
  assert.match(migration, /coach deletes attendance before lock/i);
  assert.match(migration, /s\.locked = false/i);
  assert.match(migration, /s\.status <> 'cancelled'/i);
});

test("Web coach workspace exposes class attendance controls", () => {
  const dashboard = read("src/components/roles/RoleDashboards.tsx");
  assert.match(dashboard, /function CoachAttendancePanel/);
  assert.match(dashboard, /Mark remaining present/);
  assert.match(dashboard, /\["present", "late", "absent", "excused"\]/);
  assert.match(dashboard, /Lock attendance/);
});

test("competition cockpit scopes checklist rows to the selected event", () => {
  const cockpit = read("AthleteN-Mobile/src/app/competition-mode.tsx");
  assert.match(cockpit, /\.eq\('tournament_id', nextEvent\.id\)/);
});

test("root and Android use their declared package managers independently", () => {
  const rootPackage = JSON.parse(read("package.json"));
  const mobilePackage = JSON.parse(read("AthleteN-Mobile/package.json"));
  assert.match(rootPackage.packageManager, /^pnpm@/);
  assert.equal(rootPackage.scripts.check, "pnpm run build && pnpm test");
  assert.equal(mobilePackage.name, "athleten-mobile");
  assert.ok(fs.existsSync(path.join(root, "AthleteN-Mobile/package-lock.json")));
});
