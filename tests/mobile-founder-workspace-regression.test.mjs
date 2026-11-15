import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("mobile home exposes a separate Founder Workspace only to Super Admin", () => {
  const home = read("../AthleteN-Mobile/src/app/home.tsx");
  const panel = read("../AthleteN-Mobile/src/app/admin-panel.tsx");
  const founder = read("../AthleteN-Mobile/src/app/founder.tsx");

  assert.match(home, /profile\?\.role\s*===\s*'super_admin'/);
  assert.match(home, /router\.push\('\/founder'\)/);
  assert.match(panel, /title="Founder Workspace"/);
  assert.match(panel, /router\.push\('\/founder'\)/);
  assert.match(founder, /profile\?\.role\s*===\s*'super_admin'/);
  assert.match(founder, /feature_flags/);
  assert.match(founder, /founder_badge/);
  assert.match(founder, /audit_logs/);
});

test("mobile Android release control uploads signed APKs from the device", () => {
  const release = read("../AthleteN-Mobile/src/app/admin-releases.tsx");

  assert.match(release, /expo-document-picker/);
  assert.match(release, /mobile-release-apks/);
  assert.match(release, /50 \* 1024 \* 1024/);
  assert.match(release, /response\.arrayBuffer\(\)/);
  assert.match(release, /application\/vnd\.android\.package-archive/);
  assert.match(release, /\.upload\(filePath, apkBytes/);
  assert.match(release, /getPublicUrl\(filePath\)/);
  assert.match(release, /updated_by: session\.user\.id/);
  assert.match(release, /published: true/);
  assert.match(release, /remove\(\[uploadedPath\]\)/);
  assert.match(release, /profile\?\.role === 'super_admin'/);
});

test("failed release-feed checks retry periodically while the app stays open", () => {
  const gate = read("../AthleteN-Mobile/src/components/app-update-gate.tsx");

  assert.match(gate, /CHECK_RETRY_INTERVAL_MS = 5 \* 60 \* 1000/);
  assert.match(gate, /setInterval\(\(\) => void checkForUpdate\(\), CHECK_RETRY_INTERVAL_MS\)/);
  assert.match(gate, /state === 'active'/);
  assert.match(gate, /Linking\.openURL\(release\.download_url\)/);
  assert.match(gate, /if \(!required\) setVisible\(false\)/);
});