import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("website Android release publishing is restricted to Super Admin and writes the active release", () => {
  const release = read("../src/components/admin/MobileReleaseControl.tsx");
  const admin = read("../src/components/admin/AdminControlCenter.tsx");

  assert.match(release, /role === "super_admin"/);
  assert.match(release, /published: true/);
  assert.match(release, /updated_by: userId/);
  assert.match(release, /from\("mobile_app_releases"\)\.upsert/);
  assert.match(release, /parsed\.protocol !== "https:"/);
  assert.match(release, /endsWith\("\.apk"\)/);
  assert.match(release, /minimum > code/);
  assert.match(release, /code <= current\.version_code/);
  assert.match(admin, /isSuperAdmin && <MobileReleaseControl role=\{role\} userId=\{userId\} \/>/);
});

test("Android app checks published releases on launch, foreground and the scheduled interval", () => {
  const gate = read("../AthleteN-Mobile/src/components/app-update-gate.tsx");

  assert.match(gate, /Platform\.OS !== 'android'/);
  assert.match(gate, /\.eq\('published', true\)/);
  assert.match(gate, /CHECK_INTERVAL_MS = 6 \* 60 \* 60 \* 1000/);
  assert.match(gate, /state === 'active'/);
  assert.match(gate, /void checkForUpdate\(true\)/);
  assert.match(gate, /versionCode > installedCode \|\| minimumCode > installedCode/);
  assert.match(gate, /function retryCheck\(\)/);
  assert.match(gate, /Linking\.openURL\(release\.download_url\)/);
});

test("required Android updates cannot be dismissed and the device installer remains user-approved", () => {
  const gate = read("../AthleteN-Mobile/src/components/app-update-gate.tsx");

  assert.match(gate, /onRequestClose=\{\(\) => \{ if \(!required\) setVisible\(false\); \}\}/);
  assert.match(gate, /!required \? <Pressable/);
  assert.match(gate, /approve the system installer/);
  assert.match(gate, /ordinary apps cannot silently replace themselves/);
});

test("mobile Super Admin release screen publishes only and cannot overwrite the active release with a draft", () => {
  const screen = read("../AthleteN-Mobile/src/app/admin-releases.tsx");

  assert.match(screen, /profile\?\.role === 'super_admin'/);
  assert.match(screen, /async function publish\(\)/);
  assert.match(screen, /published: true/);
  assert.match(screen, /updated_by: session\.user\.id/);
  assert.match(screen, /code <= current\.version_code/);
  assert.doesNotMatch(screen, /SAVE DRAFT/);
  assert.doesNotMatch(screen, /save\(false\)/);
});

test("production release-table RLS restricts writes to the authenticated Super Admin", () => {
  const migration = read("../supabase/migrations/20261011093726_mobile_app_release_control.sql");
  const hardening = read("../supabase/migrations/20261011094653_harden_mobile_app_release_permissions.sql");

  assert.match(migration, /id boolean primary key default true check \(id = true\)/);
  assert.match(migration, /published = true/);
  assert.match(migration, /p\.role = 'super_admin'/);
  assert.match(hardening, /revoke all privileges on table public\.mobile_app_releases from public, anon, authenticated/);
  assert.match(hardening, /grant select on table public\.mobile_app_releases to anon, authenticated/);
  assert.match(hardening, /updated_by = auth\.uid\(\)/);
});
