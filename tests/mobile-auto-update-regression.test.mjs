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

test("website publisher uploads signed APKs to the protected release bucket before publishing", () => {
  const release = read("../src/components/admin/MobileReleaseControl.tsx");
  const migration = read("../supabase/migrations/20261115080229_mobile_release_apk_storage.sql");

  assert.match(release, /APK_BUCKET = "mobile-release-apks"/);
  assert.match(release, /MAX_APK_SIZE_BYTES = 50 \* 1024 \* 1024/);
  assert.match(release, /storage\s*\.from\(APK_BUCKET\)\s*\.upload\(filePath, apkFile/);
  assert.match(release, /contentType: APK_MIME_TYPE/);
  assert.match(release, /upsert: false/);
  assert.match(release, /getPublicUrl\(filePath\)/);
  assert.match(release, /if \(uploadedPath\)[\s\S]*?remove\(\[uploadedPath\]\)/);
  assert.match(migration, /'mobile-release-apks'[\s\S]*?true,[\s\S]*?52428800/);
  assert.match(migration, /for insert\s+to authenticated[\s\S]*?p\.role = 'super_admin'/);
  assert.match(migration, /for delete\s+to authenticated[\s\S]*?p\.role = 'super_admin'/);
});

test("a new APK release cannot accidentally reuse the previous build's download URL", () => {
  const release = read("../src/components/admin/MobileReleaseControl.tsx");
  assert.match(release, /code > current\.version_code && releaseDownloadUrl === current\.download_url/);
  assert.match(release, /Upload the new APK or enter a new direct link/);
});

test("Android app checks published releases on launch, foreground and the scheduled interval", () => {
  const gate = read("../AthleteN-Mobile/src/components/app-update-gate.tsx");
  const layout = read("../AthleteN-Mobile/src/app/_layout.tsx");

  assert.match(gate, /Platform\.OS !== 'android'/);
  assert.match(gate, /\.eq\('published', true\)/);
  assert.match(gate, /CHECK_INTERVAL_MS = 6 \* 60 \* 60 \* 1000/);
  assert.match(gate, /state === 'active'/);
  assert.match(gate, /void checkForUpdate\(true\)/);
  assert.match(gate, /versionCode > installedCode \|\| minimumCode > installedCode/);
  assert.match(gate, /function retryCheck\(\)/);
  assert.match(gate, /Linking\.openURL\(release\.download_url\)/);
  assert.match(layout, /import AppUpdateGate from '@\/components\/app-update-gate';/);
  assert.match(layout, /<AppUpdateGate \/>/);
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

test("EAS release profile builds an APK and increments the remote Android version code", () => {
  const eas = read("../AthleteN-Mobile/eas.json");
  const app = read("../AthleteN-Mobile/app.json");

  assert.match(eas, /"appVersionSource": "remote"/);
  assert.match(eas, /"release-apk": \{/);
  assert.match(eas, /"environment": "production"/);
  assert.match(eas, /"autoIncrement": true/);
  assert.match(eas, /"buildType": "apk"/);
  assert.match(app, /"version": "1\.0\.4"/);
  assert.match(app, /"versionCode": 5/);
});

test("manual GitHub Actions workflow builds the release APK through the production EAS profile", () => {
  const workflow = read("../.github/workflows/android-release-apk.yml");

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /secrets\.EXPO_TOKEN/);
  assert.match(workflow, /--platform android/);
  assert.match(workflow, /--profile release-apk/);
  assert.match(workflow, /--non-interactive/);
});
