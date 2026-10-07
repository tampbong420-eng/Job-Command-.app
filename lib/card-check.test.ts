import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CARD_CHECK_CENTS,
  cardBrand,
  cardCheckOnFile,
  cardCheckPassed,
  cardFieldsProblem,
  declineCopy,
  formatCardNumber,
  formatExpiry,
  luhnValid,
  mockCardOutcome,
  sha256Hex,
} from "./card-check";
import { billingSyncDue, billingSyncPatch, subscriptionEventForOtherCustomer } from "./billing-sync-rules";

const NOW = new Date("2026-10-02T11:00:00Z");

test("$1 hold, card helpers", () => {
  assert.equal(CARD_CHECK_CENTS, 100);
  assert.ok(luhnValid("4242 4242 4242 4242"));
  assert.ok(!luhnValid("4242 4242 4242 4241"));
  assert.equal(cardBrand("4000"), "visa");
  assert.equal(cardBrand("5555555555554444"), "mastercard");
  assert.equal(cardBrand("378282246310005"), "amex");
  assert.equal(formatCardNumber("4242424242424242"), "4242 4242 4242 4242");
  assert.equal(formatCardNumber("378282246310005"), "3782 822463 10005");
  assert.equal(formatExpiry("1129"), "11/29");
});

test("card fields: plain-words problems, expiry, CVC length", () => {
  const ok = { number: "4242424242424242", expiry: "1129", cvc: "123", zip: "72712" };
  assert.equal(cardFieldsProblem(ok, NOW), "");
  assert.match(cardFieldsProblem({ ...ok, number: "4242" }, NOW), /whole card number/);
  assert.match(cardFieldsProblem({ ...ok, number: "4242424242424241" }, NOW), /doesn’t look right/);
  assert.match(cardFieldsProblem({ ...ok, expiry: "0924" }, NOW), /expired/);
  assert.match(cardFieldsProblem({ ...ok, number: "378282246310005" }, NOW), /4-digit/);
  assert.match(cardFieldsProblem({ ...ok, zip: "727" }, NOW), /ZIP/);
});

test("mock cards: 0002 declines, 9995 insufficient funds, 4242 passes", () => {
  assert.deepEqual(mockCardOutcome("4242"), { ok: true });
  assert.deepEqual(mockCardOutcome("0002"), { ok: false, code: "card_declined" });
  assert.deepEqual(mockCardOutcome("9995"), { ok: false, code: "insufficient_funds" });
});

test("decline codes → 'That card didn’t work' + one plain line", () => {
  assert.equal(declineCopy("card_declined").title, "That card didn’t work");
  assert.equal(declineCopy("card_declined").line, "Your bank said no to the $1 check.");
  assert.match(declineCopy("card_declined", "insufficient_funds").line, /isn’t enough/);
  assert.match(declineCopy("expired_card").line, /expired/);
  assert.match(declineCopy("incorrect_cvc").line, /code didn’t match/);
  assert.match(declineCopy("incorrect_zip").line, /ZIP/);
  assert.equal(declineCopy("something_new").line, "Your bank said no to the $1 check.");
});

test("JS sha256 matches node crypto (card number never leaves the phone raw)", () => {
  for (const value of ["", "4242424242424242", "x".repeat(130)]) {
    assert.equal(sha256Hex(value), createHash("sha256").update(value).digest("hex"));
  }
});

test("finish needs the same one-use token within 2 hours; blocked guard fails the backstop", () => {
  const row = { cardCheckAt: new Date(NOW.getTime() - 60_000), cardCheckToken: "abc123" };
  assert.ok(cardCheckPassed(row, "abc123", NOW));
  assert.ok(!cardCheckPassed(row, "abc124", NOW));
  assert.ok(!cardCheckPassed(row, "", NOW));
  assert.ok(!cardCheckPassed({ ...row, cardCheckAt: new Date(NOW.getTime() - 3 * 3600_000) }, "abc123", NOW));
  assert.ok(!cardCheckPassed(null, "abc123", NOW));
  assert.ok(cardCheckOnFile(row, NOW));
  assert.ok(!cardCheckOnFile({ ...row, cardCheckToken: "" }, NOW), "token used up");
  assert.ok(!cardCheckOnFile({ ...row, trialGuard: "blocked:card" }, NOW));
});

test("server wiring: finish + completeOnboarding require the check; mock path never sees a card number", () => {
  const route = readFileSync(new URL("../app/api/setup/card-check/route.ts", import.meta.url), "utf8");
  const actions = readFileSync(new URL("../app/actions.ts", import.meta.url), "utf8");
  const signup = readFileSync(new URL("../app/signup-actions.ts", import.meta.url), "utf8");
  const stripe = readFileSync(new URL("./card-check-stripe.ts", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../components/signup/CardCheck.tsx", import.meta.url), "utf8");
  assert.match(actions, /cardCheckOnFile\(existing\)/);
  assert.match(signup, /cardCheckPassed\(before, input\.cardCheckToken\)/);
  assert.match(signup, /endTrialNow\(\)/);
  assert.match(route, /createRateLimiter/);
  assert.match(route, /inflight/);
  assert.doesNotMatch(route, /\bpan\b|cardNumber|number:/i);
  assert.match(stripe, /capture_method: "manual"/);
  assert.match(stripe, /setup_future_usage: "off_session"/);
  assert.match(stripe, /Idempotency-Key/);
  assert.match(stripe, /\/cancel`/);
  assert.match(stripe, /invoice_settings\[default_payment_method\]/);
  // Go-public B4: with no Stripe key there is no card form at all; it posts only "not connected".
  assert.match(ui, /mock: \{ notConnected: true \}/);
  assert.match(route, /Card check skipped \(not connected yet\)/);
});

test("free-forever: on-demand Stripe re-check rules", () => {
  const row = {
    billingStatus: "trial",
    trialStartedAt: new Date("2026-09-02T00:00:00Z"),
    trialEndsAt: new Date("2026-10-02T12:00:00Z"),
    stripeCustomerId: "cus_A",
    stripeSubId: "sub_A",
    stripeAddonSubId: "",
    addonStatus: "locked",
    cardBrand: "visa",
    cardLast4: "4242",
    connectAccountId: "",
    connectStatus: "unlinked",
    connectBankLast4: "",
    setupComplete: true,
    billingCheckedAt: null as Date | null,
  };
  assert.ok(billingSyncDue(row, NOW, true));
  assert.ok(!billingSyncDue(row, NOW, false), "mock mode never calls Stripe");
  assert.ok(!billingSyncDue({ ...row, stripeSubId: "mock_sub_base_1" }, NOW, true));
  assert.ok(!billingSyncDue({ ...row, billingCheckedAt: new Date(NOW.getTime() - 5 * 60_000) }, NOW, true), "throttled");
  assert.ok(billingSyncDue({ ...row, billingCheckedAt: new Date(NOW.getTime() - 20 * 60_000) }, NOW, true), "fast near trial end");
  assert.ok(
    !billingSyncDue({ ...row, trialEndsAt: new Date("2026-10-20T00:00:00Z"), billingCheckedAt: new Date(NOW.getTime() - 60 * 60_000) }, NOW, true),
    "slow mid-trial"
  );
  assert.deepEqual(billingSyncPatch(row, { status: "canceled", customer: "cus_A" }, NOW), { billingCheckedAt: NOW, billingStatus: "canceled" });
  assert.deepEqual(billingSyncPatch(row, { status: "active", customer: "cus_OTHER" }, NOW), { billingCheckedAt: NOW });
  assert.deepEqual(billingSyncPatch(row, { status: "paused", customer: "cus_A" }, NOW).billingStatus, "expired");
  assert.ok(subscriptionEventForOtherCustomer("customer.subscription.updated", { customer: "cus_B" }, "cus_A"));
  assert.ok(!subscriptionEventForOtherCustomer("customer.subscription.updated", { customer: "cus_A" }, "cus_A"));
  assert.ok(!subscriptionEventForOtherCustomer("invoice.paid", { customer: "cus_B" }, "cus_A"));
});
