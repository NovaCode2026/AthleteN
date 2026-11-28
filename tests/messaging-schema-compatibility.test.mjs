import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/messaging/MessagingPage.tsx", import.meta.url), "utf8");

test("messaging falls back to the base messages schema when optional lifecycle columns are absent", () => {
  assert.match(source, /isMissingOptionalMessagingSchema/);
  assert.match(source, /setMessageAdvancedSchema\(false\)/);
  assert.match(source, /select\("id, conversation_id, sender_id, body, message_type, created_at, client_message_id, attachment_path, attachment_name, attachment_type, attachment_size"\)/);
});

test("optional hidden, reactions, and saved-message tables do not block core chat loading", () => {
  assert.match(source, /hiddenResult\.error&&isMissingOptionalMessagingSchema/);
  assert.match(source, /reactionResult\.error&&isMissingOptionalMessagingSchema/);
  assert.match(source, /savedResult\.error&&isMissingOptionalMessagingSchema/);
});

test("lifecycle controls are disabled when the live schema is older", () => {
  assert.match(source, /disabled={!messageAdvancedSchema/);
  assert.match(source, /messageAdvancedSchema&&canEditTextMessage/);
  assert.match(source, /messageAdvancedSchema&&canDeleteMessageForEveryone/);
});
