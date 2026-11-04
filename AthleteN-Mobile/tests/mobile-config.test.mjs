import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const readJson = (file) => JSON.parse(read(file));

test("mobile app identity and Android release metadata are valid", () => {
  const app = readJson("app.json").expo;
  assert.equal(app.name, "AthleteN");
  assert.equal(app.scheme, "athleten");
  assert.match(app.version, /^\d+\.\d+\.\d+$/);
  assert.match(app.android.package, /^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/);
  assert.ok(Number.isInteger(app.android.versionCode) && app.android.versionCode > 0);
  assert.match(app.extra.eas.projectId, /^[0-9a-f-]{36}$/i);
});

test("password recovery and email confirmation routes stay public before login", () => {
  const layout = read("src/app/_layout.tsx");
  for (const route of ["/auth/callback", "/reset-request", "/reset-password"]) {
    assert.ok(layout.includes(`'${route}'`) || layout.includes(`"${route}"`), `Missing public route: ${route}`);
  }
  assert.match(layout, /if\s*\(loading\s*\|\|\s*session\)\s*return/);
});

test("sign-out attempts cleanup of only the current account push token", () => {
  const auth = read("src/context/AuthContext.tsx");
  const push = read("src/lib/push-notifications.ts");
  assert.match(auth, /unregisterPushNotifications\(userId\)/);
  assert.match(auth, /await\s+supabase\.auth\.signOut\(\)/);
  assert.match(push, /\.eq\('user_id',\s*userId\)/);
  assert.match(push, /\.eq\('token',\s*token\)/);
});

test("push registration is physical-device and permission aware", () => {
  const push = read("src/lib/push-notifications.ts");
  assert.match(push, /if\s*\(!Device\.isDevice\)/);
  assert.match(push, /requestPermissionsAsync\(\)/);
  assert.match(push, /getExpoPushTokenAsync\(\{\s*projectId\s*\}\)/);
  assert.match(push, /from\('device_push_tokens'\)\.upsert/);
});

test("competition workspace scopes checklist reads and writes to the signed-in athlete", () => {
  const compete = read("src/app/compete.tsx");
  assert.match(compete, /from\('competition_checklists'\)/);
  assert.match(compete, /\.eq\('user_id',\s*uid\)/);
  assert.match(compete, /toggleCheck/);
  assert.match(compete, /from\('tournaments'\)/);
});

test("mobile package exposes deterministic test, lint and type-check commands", () => {
  const pkg = readJson("package.json");
  assert.equal(pkg.scripts.test, "node --test tests/*.test.mjs");
  assert.equal(pkg.scripts.lint, "expo lint");
});
