import test from "node:test";
import assert from "node:assert/strict";
import { extractBearerToken } from "../netlify/payment-common.mjs";

test("extracts a standard Bearer token", () => {
  assert.equal(extractBearerToken("Bearer eyJhbGciOi.test.signature"), "eyJhbGciOi.test.signature");
});

test("accepts case-insensitive Bearer scheme and extra header whitespace", () => {
  assert.equal(extractBearerToken("bEaReR    access-token  "), "access-token");
});

test("rejects missing, malformed, or multi-token authorization headers", () => {
  assert.equal(extractBearerToken(null), null);
  assert.equal(extractBearerToken(""), null);
  assert.equal(extractBearerToken("Basic credentials"), null);
  assert.equal(extractBearerToken("Bearer token extra"), null);
});
