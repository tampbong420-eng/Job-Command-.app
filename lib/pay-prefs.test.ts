import assert from "node:assert/strict";
import test from "node:test";
import { BLANK_SETUP_PAY_PREFS, depositIsChosen, parsePayPrefs, parsePayTalk, payPrefsSummary } from "./pay-prefs";

test("payment prefs default to cards and cash with no deposit", () => {
  const prefs = parsePayPrefs(undefined);
  assert.equal(prefs.acceptCard, true);
  assert.equal(prefs.acceptCash, true);
  assert.equal(prefs.acceptAch, false);
  assert.equal(prefs.depositPercent, 0);
  assert.match(payPrefsSummary(prefs), /cards/);
  assert.match(payPrefsSummary(prefs), /no deposit/);
});

test("pay talk sets ACH and a 50% deposit", () => {
  const draft = parsePayTalk("take cards and ACH, fifty percent deposit");
  assert.equal(draft.acceptCard, true);
  assert.equal(draft.acceptAch, true);
  assert.equal(draft.depositPercent, 50);
});

test("first-run setup payment prefs start unselected", () => {
  assert.equal(BLANK_SETUP_PAY_PREFS.acceptCard, false);
  assert.equal(BLANK_SETUP_PAY_PREFS.acceptAch, false);
  assert.equal(BLANK_SETUP_PAY_PREFS.acceptCash, false);
  assert.equal(depositIsChosen(BLANK_SETUP_PAY_PREFS.depositPercent), false);
  assert.equal(depositIsChosen(0), true);
  assert.equal(depositIsChosen(25), true);
});
