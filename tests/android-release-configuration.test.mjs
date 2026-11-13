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

test("CI APK artifact is explicitly labelled debug-signed", () => {
  const workflow = read("../.github/workflows/android-apk.yml");
  assert.match(workflow, /AthleteN Android CI APK \(debug-signed\)/);
  assert.match(workflow, /AthleteN-ci-debug-signed-apk/);
});

test("release documentation distinguishes CI artifacts from store builds", () => {
  const doc = read("../docs/ANDROID_RELEASE_SIGNING_2026-11-12.md");
  assert.match(doc, /debug certificate, not a production upload key/i);
  assert.match(doc, /manual-only GitHub Actions workflow/i);
  assert.match(doc, /No production EAS AAB has been built or cryptographically verified/i);
});
