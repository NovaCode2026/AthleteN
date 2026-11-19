import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
);

test("the AthleteN application package cannot be published to a registry", () => {
  assert.equal(
    packageJson.private,
    true,
    "The application root package must set private: true to prevent accidental npm publication."
  );
});
