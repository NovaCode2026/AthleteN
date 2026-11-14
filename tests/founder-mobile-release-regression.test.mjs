import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const founderMenu = readFileSync(new URL("../src/components/admin/FounderMenu.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261114194500_founder_mobile_release_manager.sql", import.meta.url), "utf8");
const updateGate = readFileSync(new URL("../AthleteN-Mobile/src/components/app-update-gate.tsx", import.meta.url), "utf8");

test("Founder Menu gates release management to Super Admin", () => {
  assert.match(founderMenu, /role === "super_admin"/);
  assert.match(founderMenu, /Publish Android release/);
  assert.match(founderMenu, /mobile_app_releases/);
});

test("release drafts are stored separately and do not overwrite the live release", () => {
  assert.match(founderMenu, /mobile_app_release_drafts/);
  assert.match(founderMenu, /currently published release remains live and unchanged/);
  assert.match(migration, /create table if not exists public\.mobile_app_release_drafts/);
});

test("APK storage is public for downloads but Super Admin-only for uploads", () => {
  assert.match(migration, /'athleten-mobile-releases'[\s\S]*true[\s\S]*262144000/);
  assert.match(migration, /bucket_id = 'athleten-mobile-releases'[\s\S]*role = 'super_admin'/);
});

test("Android update gate only opens direct HTTPS APK releases and requires Android approval", () => {
  assert.match(updateGate, /parsedUrl\.protocol === 'https:'/);
  assert.match(updateGate, /pathname\.toLowerCase\(\)\.endsWith\('\.apk'\)/);
  assert.match(updateGate, /Android requires your approval to install an APK/);
});
