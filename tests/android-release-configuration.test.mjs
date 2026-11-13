import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("mobile application identifiers are branded and consistent", () => {
  const app = JSON.parse(read("../AthleteN-Mobile/app.json"));
  assert.equal(app.expo.android.package, "com.novacode.athleten");
  assert.equal(app.expo.ios.bundleIdentifier, "com.novacode.athleten");
});

test("EAS production profile generates an Android App Bundle", () => {
  const eas = JSON.parse(read("../AthleteN-Mobile/eas.json"));
  assert.equal(eas.cli.appVersionSource, "remote");
  assert.equal(eas.build.production.autoIncrement, true);
  assert.equal(eas.build.production.android.buildType, "app-bundle");
});

test("release workflow is manual and requires the Expo token", () => {
  const workflow = read("../.github/workflows/android-production-aab.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /secrets\.EXPO_TOKEN/);
  assert.match(workflow, /--platform android/);
  assert.match(workflow, /--profile production/);
  assert.match(workflow, /--non-interactive/);
  assert.doesNotMatch(workflow, /on:\s*\n\s*push:/);
  assert.doesNotMatch(workflow, /eas submit/);
});

test("CI produces a standalone QA APK signed with the Android debug certificate", () => {
  const workflow = read("../.github/workflows/android-apk.yml");
  assert.match(workflow, /AthleteN Android CI APK \(debug-signed QA\)/);
  assert.match(workflow, /Build standalone QA APK \(release variant, debug key\)/);
  assert.match(workflow, /EXPO_PUBLIC_APP_CHANNEL: qa/);
  assert.match(workflow, /gradlew assembleRelease --no-daemon/);
  assert.match(workflow, /APKSIGNER=.*apksigner/s);
  assert.match(workflow, /verify --verbose --print-certs/);
  assert.match(workflow, /CN=Android Debug/);
  assert.match(workflow, /AthleteN-qa-debug-signed-apk/);
  assert.match(workflow, /app-release\.apk/);
  assert.doesNotMatch(workflow, /assembleDebug|app-debug\.apk/);
});

test("QA build visibly warns that it connects to the live database", () => {
  const layout = read("../AthleteN-Mobile/src/app/_layout.tsx");
  assert.match(layout, /EXPO_PUBLIC_APP_CHANNEL === 'qa'/);
  assert.match(layout, /QA BUILD • LIVE DATABASE • TEST ACCOUNT ONLY/);
  assert.match(layout, /accessibilityRole="alert"/);
});

test("release documentation distinguishes CI artifacts from store builds", () => {
  const doc = read("../docs/ANDROID_RELEASE_SIGNING_2026-11-12.md");
  assert.match(doc, /debug certificate, not a production upload key/i);
  assert.match(doc, /manual-only GitHub Actions workflow/i);
  assert.match(doc, /No production EAS AAB has been built or cryptographically verified/i);
});
