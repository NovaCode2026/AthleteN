import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

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
  assert.match(gate, /void checkForOtaUpdate\(true\)/);
  assert.match(gate, /next\.version_code > installedCode \|\| next\.minimum_version_code > installedCode/);
  assert.match(gate, /function retryAllChecks\(\)/);
  assert.match(gate, /Linking\.openURL\(release\.download_url\)/);
  assert.match(layout, /import AppUpdateGate from '@\/components\/app-update-gate';/);
  assert.match(layout, /<AppUpdateGate \/>/);
});

test("required Android updates cannot be dismissed and the device installer remains user-approved", () => {
  const gate = read("../AthleteN-Mobile/src/components/app-update-gate.tsx");

  assert.match(gate, /onRequestClose=\{\(\) => undefined\}/);
  assert.match(gate, /!requiredApk \? <Pressable/);
  assert.match(gate, /Android’s installer/);
  assert.match(gate, /Native APK updates require your approval/);
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
  assert.match(app, /"version": "1\.0\.5"/);
  assert.match(app, /"versionCode": 6/);
});

test("manual GitHub Actions workflow builds the release APK through the production EAS profile", () => {
  const workflow = read("../.github/workflows/android-release-apk.yml");

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /secrets\.EXPO_TOKEN/);
  assert.match(workflow, /--platform android/);
  assert.match(workflow, /--profile release-apk/);
  assert.match(workflow, /--non-interactive/);
});

test("Android update checks validate release metadata, clear stale prompts and throttle transient failures", () => {
  const gate = read("../AthleteN-Mobile/src/components/app-update-gate.tsx");

  assert.match(gate, /function parseRelease\(data: unknown\): Release \| null/);
  assert.match(gate, /VERSION_PATTERN\.test\(version\)/);
  assert.match(gate, /parsedUrl\.protocol !== 'https:'/);
  assert.match(gate, /!parsedUrl\.pathname\.toLowerCase\(\)\.endsWith\('\.apk'\)/);
  assert.match(gate, /RETRY_INTERVAL_MS = 5 \* 60 \* 1000/);
  assert.match(gate, /lastApkCheckSucceeded\.current \? APK_CHECK_INTERVAL_MS : RETRY_INTERVAL_MS/);
  assert.match(gate, /lastApkCheckAt\.current = now/);
  assert.match(gate, /lastApkCheckSucceeded\.current = false/);
  assert.match(gate, /setRelease\(null\);\s*setApkVisible\(false\);/);
});


test("the exact master AthleteN logo is used for the installed launcher, adaptive icon and splash", () => {
  const app = JSON.parse(read("../AthleteN-Mobile/app.json"));
  const logoComponent = read("../AthleteN-Mobile/src/components/athleten-logo.tsx");
  assert.equal(app.expo.icon, "./assets/logo.webp");
  assert.equal(app.expo.android.adaptiveIcon.foregroundImage, "./assets/logo.webp");
  const splash = app.expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === "expo-splash-screen");
  assert.equal(splash[1].image, "./assets/logo.webp");
  assert.match(logoComponent, /require\(['"]@\/assets\/logo\.webp['"]\)/);
  assert.ok(existsSync(new URL("../AthleteN-Mobile/assets/logo.webp", import.meta.url)));
});

test("OTA updates are enabled with a fingerprint runtime and the AthleteN EAS project URL", () => {
  const app = JSON.parse(read("../AthleteN-Mobile/app.json"));
  const pkg = JSON.parse(read("../AthleteN-Mobile/package.json"));
  const eas = JSON.parse(read("../AthleteN-Mobile/eas.json"));
  assert.deepEqual(app.expo.runtimeVersion, { policy: "fingerprint" });
  assert.equal(app.expo.updates.enabled, true);
  assert.equal(app.expo.updates.url, "https://u.expo.dev/7f308f88-5459-4f51-bb76-981f381eee3c");
  assert.equal(app.expo.updates.checkAutomatically, "NEVER");
  assert.equal(app.expo.updates.fallbackToCacheTimeout, 3000);
  assert.equal(pkg.dependencies["expo-updates"], "~57.0.29");
  assert.equal(eas.build.development.channel, "development");
  assert.equal(eas.build.preview.channel, "preview");
  assert.equal(eas.build["release-apk"].channel, "production");
  assert.equal(eas.build.production.channel, "production");
});

test("OTA update lifecycle downloads compatible updates, lets the user choose a safe restart, and retains APK fallback", () => {
  const gate = read("../AthleteN-Mobile/src/components/app-update-gate.tsx");
  assert.match(gate, /import \* as Updates from 'expo-updates'/);
  assert.match(gate, /Updates\.useUpdates\(\)/);
  assert.match(gate, /!Updates\.isEnabled/);
  assert.match(gate, /Platform\.OS !== 'android' \|\| __DEV__/);
  assert.match(gate, /Updates\.checkForUpdateAsync\(\)/);
  assert.match(gate, /Updates\.fetchUpdateAsync\(\)/);
  assert.match(gate, /Updates\.reloadAsync\(\)/);
  assert.match(gate, /setOtaReady\(true\)/);
  assert.match(gate, /RESTART AND UPDATE/);
  assert.match(gate, /the next time AthleteN starts/);
  assert.match(gate, /from\('mobile_app_releases'\)/);
  assert.match(gate, /Linking\.openURL\(release\.download_url\)/);
  assert.match(gate, /requiredApk/);
  assert.match(gate, /Native APK updates require your approval/);
});

test("Firebase and AdMob native config are composed in one Expo config file", () => {
  const config = read("../AthleteN-Mobile/app.config.js");
  assert.match(config, /GOOGLE_SERVICES_FILE/);
  assert.match(config, /googleServicesFile/);
  assert.match(config, /react-native-google-mobile-ads/);
  assert.equal(existsSync(new URL("../AthleteN-Mobile/app.config.ts", import.meta.url)), false);
});

test("manual OTA publishing workflow runs mobile quality gates and publishes only to a named EAS channel", () => {
  const workflow = read("../.github/workflows/android-ota-update.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /secrets\.EXPO_TOKEN/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npx tsc --noEmit/);
  assert.match(workflow, /eas-cli@latest update/);
  assert.match(workflow, /--channel/);
  assert.match(workflow, /--platform android/);
  assert.match(workflow, /--non-interactive/);
  assert.match(workflow, /Production OTA updates may only be published from main/);
  assert.match(workflow, /Preview OTA updates must run from main or the reviewed PR #76 branch/);
  assert.match(workflow, /athleten-production-ota/);
});

test("OTA workflow blocks production publishing from PR branches and validates before publishing", () => {
  const workflow = read("../.github/workflows/android-ota-update.yml");
  assert.ok(workflow.includes('if [ "${OTA_CHANNEL}" = "production" ]'));
  assert.ok(workflow.includes('if [ "${GITHUB_REF_NAME}" != "main" ]'));
  assert.match(workflow, /npm test[\s\S]*npx tsc --noEmit[\s\S]*npm run lint[\s\S]*expo-doctor/);
  assert.match(workflow, /runtimeVersion\?\.policy!==['"]fingerprint['"]/);
});

test("Expo Updates dependency lock is generated and validated before mobile releases", () => {
  const workflow = read("../.github/workflows/mobile-lockfile-sync.yml");
  assert.match(workflow, /npm install --package-lock-only/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /package-lock\.json/);
  assert.match(workflow, /contents: write/);
  assert.match(workflow, /git push/);
});
