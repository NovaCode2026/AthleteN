import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("package metadata is valid", () => {
  assert.equal(packageJson.name, "athleten-taekwondo");
  assert.ok(packageJson.version);
  assert.equal(packageJson.packageManager, "pnpm@10.30.3");
  assert.ok(fs.existsSync(new URL("../pnpm-lock.yaml", import.meta.url)));
});

test("required build and test scripts exist", () => {
  assert.equal(packageJson.scripts.build, "vite build && node scripts/write-netlify-redirects.mjs");
  assert.equal(packageJson.scripts.test, "node --test");
  assert.equal(packageJson.scripts.check, "pnpm run build && pnpm test");
});
