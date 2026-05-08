import { test } from "node:test";
import assert from "node:assert/strict";

import { parseVoiceCommand } from "../apps/web/src/components/voice-orb.js";

test("parseVoiceCommand recognizes premium inbox commands", () => {
  const showMessages = parseVoiceCommand("show new messages");
  const approveLast = parseVoiceCommand("approve last");
  const readSelected = parseVoiceCommand("read aloud selected item");

  assert.equal(showMessages.intent, "show_new_messages");
  assert.equal(approveLast.intent, "approve_last");
  assert.equal(readSelected.intent, "read_aloud");
  assert.equal(readSelected.target, "selected");
});
