import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Badge Control resolves an Athlete by username before awarding", () => {
  const badges = read("../AthleteN-Mobile/src/app/admin-badges.tsx");

  assert.match(badges, /ATHLETE USERNAME/);
  assert.match(badges, /placeholder="Enter username/);
  assert.match(badges, /ilike\('username', cleanUsername\)/);
  assert.match(badges, /\.eq\('role', 'athlete'\)/);
  assert.match(badges, /p_user_id: selectedAthlete\.user_id/);
  assert.match(badges, /ATHLETE FOUND/);
  assert.doesNotMatch(badges, /placeholder="Athlete user UUID"/);
});

test("APK release UI has no hard-coded size ceiling and explains the project limit", () => {
  const release = read("../AthleteN-Mobile/src/app/admin-releases.tsx");
  const migration = read("../supabase/migrations/20261115110213_mobile_release_apk_bucket_uses_project_global_limit.sql");

  assert.doesNotMatch(release, /MAX_APK_SIZE_BYTES/);
  assert.doesNotMatch(release, /50 MB upload limit/);
  assert.match(release, /NO APP-SIDE SIZE CAP/);
  assert.match(release, /direct HTTPS APK URL/);
  assert.match(release, /50 MB global upload ceiling/);
  assert.match(migration, /set file_size_limit = null/);
});

test("APK upload still requires a signed APK and Super Admin authorization", () => {
  const release = read("../AthleteN-Mobile/src/app/admin-releases.tsx");

  assert.ok(release.includes('application/vnd.android.package-archive'));
  assert.match(release, /\.upload\(filePath, apkBytes/);
  assert.match(release, /updated_by: session\.user\.id/);
  assert.match(release, /published: true/);
  assert.match(release, /profile\?\.role === 'super_admin'/);
});
