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

test("parseVoiceCommand recognizes desk intents (EN + RO)", () => {
  assert.equal(parseVoiceCommand("note buy milk").intent, "desk_note");
  assert.equal(parseVoiceCommand("note buy milk").payload.text, "buy milk");

  assert.equal(parseVoiceCommand("notă verifică email").intent, "desk_note");
  assert.match(parseVoiceCommand("notă verifică email").payload.text, /verific/i);

  assert.equal(parseVoiceCommand("prioritate sună la medic").intent, "desk_add_priority");
  assert.match(parseVoiceCommand("prioritate sună la medic").payload.text, /medic/);

  assert.equal(parseVoiceCommand("open Safari").intent, "desk_open_app");
  assert.equal(parseVoiceCommand("open Safari").payload.app, "Safari");

  assert.equal(parseVoiceCommand("deschide Notes").intent, "desk_open_app");
  assert.equal(parseVoiceCommand("deschide Notes").payload.app, "Notes");

  assert.equal(parseVoiceCommand("add priority call doctor").intent, "desk_add_priority");
  assert.match(parseVoiceCommand("add priority call doctor").payload.text, /doctor/iu);
});
