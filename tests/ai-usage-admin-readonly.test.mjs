import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const admin = readFileSync(new URL("../src/components/admin/AdminControlCenter.tsx", import.meta.url), "utf8");

test("AI usage is read-only in the generic admin editor", () => {
  assert.match(admin, /serverMeteredReadOnly = selected === "aiUsage"/);
  assert.match(admin, /canEditCurrentSection = canManage && !ageVerificationReadOnly && !studentVerificationReadOnly && !serverMeteredReadOnly && !financialStateReadOnly/);
  assert.match(admin, /canCreateCurrentSection = isOwner && !ageVerificationReadOnly && !studentVerificationReadOnly && !serverMeteredReadOnly && !financialStateReadOnly/);
  assert.match(admin, /AI usage records are server-metered and read-only/);
});
