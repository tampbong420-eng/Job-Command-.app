import assert from "node:assert/strict";
import test from "node:test";
import { canDictate, fieldName, joinDictation, pickVoiceTarget, speechForField } from "./voice-target";

test("the mic types into text boxes, never PIN pads, passwords, or off-limits fields", () => {
  assert.equal(canDictate({ tag: "TEXTAREA" }), true);
  assert.equal(canDictate({ tag: "INPUT", type: "text" }), true);
  assert.equal(canDictate({ tag: "INPUT", type: "" }), true);
  assert.equal(canDictate({ tag: "INPUT", type: "email" }), true);
  assert.equal(canDictate({ tag: "INPUT", type: "password" }), false);
  assert.equal(canDictate({ tag: "INPUT", type: "checkbox" }), false);
  assert.equal(canDictate({ tag: "INPUT", type: "date" }), false);
  assert.equal(canDictate({ tag: "INPUT", type: "text", voice: "off" }), false);
  assert.equal(canDictate({ tag: "TEXTAREA", readOnly: true }), false);
  assert.equal(canDictate({ tag: "TEXTAREA", disabled: true }), false);
  assert.equal(canDictate({ tag: "BUTTON" }), false);
  assert.equal(canDictate({ tag: "DIV", contentEditable: true }), true);
  assert.equal(canDictate(null), false);
});

test("the pill names the box the way the screen does", () => {
  assert.equal(fieldName({ voiceLabel: "Notes", ariaLabel: "Job notes" }), "Notes");
  assert.equal(fieldName({ ariaLabel: "punch item" }), "Punch item");
  assert.equal(fieldName({ labelText: "Scope of work:" }), "Scope of work");
  assert.equal(fieldName({ placeholder: "What needs a touch-up?" }), "What needs a touch-up?");
  assert.equal(fieldName({}), "This box");
  assert.equal(fieldName({ labelText: "A very long label that keeps going and going" }).length <= 28, true);
});

test("selected box wins; a box that blurred a beat ago still counts; otherwise the helper", () => {
  assert.deepEqual(pickVoiceTarget({ active: "notes", activeOk: true, recent: null, recentOk: false, blurredAgoMs: null }), {
    mode: "field",
    field: "notes",
  });
  assert.deepEqual(pickVoiceTarget({ active: "btn", activeOk: false, recent: "notes", recentOk: true, blurredAgoMs: 120 }), {
    mode: "field",
    field: "notes",
  });
  assert.deepEqual(pickVoiceTarget({ active: null, activeOk: false, recent: "notes", recentOk: true, blurredAgoMs: 5000 }), {
    mode: "helper",
  });
  assert.deepEqual(pickVoiceTarget({ active: null, activeOk: false, recent: "pin", recentOk: false, blurredAgoMs: 50 }), {
    mode: "helper",
  });
});

test("dictation joins cleanly and number boxes get digits", () => {
  assert.equal(joinDictation("", "gate code 4417"), "Gate code 4417");
  assert.equal(joinDictation("Gate code 4417.", "board wants the deck clear"), "Gate code 4417. Board wants the deck clear");
  assert.equal(joinDictation("Two coats", "on the trim"), "Two coats on the trim");
  assert.equal(joinDictation("Keep", "  "), "Keep");
  assert.equal(speechForField("eight", "decimal"), "8");
  assert.equal(speechForField("about 6.5 hours", "decimal"), "6.5");
  assert.equal(speechForField("hello there", "numeric"), "");
  assert.equal(speechForField("blue door", null), "blue door");
});
