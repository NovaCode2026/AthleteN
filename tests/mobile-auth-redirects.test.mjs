import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const redirectHelper = fs.readFileSync("AthleteN-Mobile/src/lib/auth-links.ts", "utf8");
const resetScreen = fs.readFileSync("AthleteN-Mobile/src/app/reset-request.tsx", "utf8");
const authScreen = fs.readFileSync("AthleteN-Mobile/src/components/auth-screen.tsx", "utf8");
const webEntry = fs.readFileSync("index.html", "utf8");
const webApp = fs.readFileSync("src/App.tsx", "utf8");

test("Expo Go email verification uses the stable production web callback", () => {
  assert.match(redirectHelper, /Constants\.executionEnvironment === 'storeClient'/);
  assert.match(redirectHelper, /return WEB_AUTH_CALLBACK/);
  assert.match(redirectHelper, /WEB_AUTH_CALLBACK = 'https:\/\/athleten\.netlify\.app\/auth\/callback'/);
  assert.match(authScreen, /emailRedirectTo: getEmailAuthRedirect\(\)/);
});

test("Expo Go password recovery uses the stable web reset route, not a temporary LAN host", () => {
  assert.match(redirectHelper, /'https:\/\/athleten\.netlify\.app\/reset-password'/);
  assert.match(resetScreen, /getEmailAuthRedirect\('reset-password'\)/);
  assert.match(authScreen, /getEmailAuthRedirect\('reset-password'\)/);
  assert.doesNotMatch(redirectHelper, /192\.168\.|localhost|127\.0\.0\.1/);
});

test("Google OAuth uses the active Expo Go host dynamically and app scheme for installed builds", () => {
  assert.match(redirectHelper, /const hostUri = Constants\.expoConfig\?\.hostUri/);
  assert.match(redirectHelper, /return `exp:\/\/${hostUri}\/--\/${callbackPath\(next\)}`/);
  assert.match(redirectHelper, /return Linking\.createURL\(callbackPath\(next\)\)/);
  assert.match(authScreen, /const redirectTo = getOAuthRedirect\(\)/);
});

test("production web entry does not contain a hardcoded developer Expo LAN address", () => {
  assert.doesNotMatch(webEntry, /192\.168\.1\.3:8081/);
  assert.doesNotMatch(webEntry, /forwardMobileOAuthCode/);
});

test("web auth callback preserves password recovery destination", () => {
  assert.match(webApp, /params\.get\("next"\) === "reset-password" \? "\/reset-password"/);
  assert.match(webApp, /new URLSearchParams\(window\.location\.search\)\.get\("next"\)==="reset-password"/);
});
