import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { cancelTrialUrl, reminderDue, trialEndingNotice, trialReminderEmail } from "./trial-reminder";
import { formatFlatPlanPrice } from "./billing";

const END = new Date("2026-11-01T17:00:00Z");

test("local fallback: due once, in the last 3 days of a running trial", () => {
  const row = { billingStatus: "trial", trialEndsAt: END, trialReminderSentAt: null };
  assert.ok(!reminderDue(row, new Date("2026-10-25T17:00:00Z")));
  assert.ok(reminderDue(row, new Date("2026-10-29T18:00:00Z")));
  assert.ok(!reminderDue({ ...row, trialReminderSentAt: new Date() }, new Date("2026-10-30T17:00:00Z")), "only once");
  assert.ok(!reminderDue({ ...row, billingStatus: "active" }, new Date("2026-10-30T17:00:00Z")));
  assert.ok(!reminderDue(row, new Date("2026-11-02T17:00:00Z")), "already ended");
});

test("email: conversion date, live price, one-tap cancel", () => {
  const mail = trialReminderEmail({ businessName: "Top Gun Painting", firstName: "Eric", trialEndsAt: END, origin: "https://app.example/", cardLast4: "4242" });
  assert.match(mail.subject, /trial ends Sunday, November 1/);
  assert.ok(mail.text.includes(formatFlatPlanPrice()));
  assert.ok(mail.text.includes("card ending 4242"));
  assert.ok(mail.text.includes(cancelTrialUrl("https://app.example")));
  assert.match(mail.html, /Cancel — no charge/);
  assert.equal(cancelTrialUrl("https://app.example/"), "https://app.example/?tab=company&billing=cancel-trial");
});

test("banner: only trial, only last 3 days", () => {
  const now = new Date("2026-10-30T12:00:00Z");
  const notice = trialEndingNotice({ status: "trial", trialEndsAt: END.toISOString(), trialDaysLeft: 2 }, now);
  assert.ok(notice);
  assert.match(notice!.title, /Your free trial ends Sun, Nov 1/);
  assert.equal(notice!.line, `Then it’s ${formatFlatPlanPrice()} until you cancel.`);
  assert.equal(trialEndingNotice({ status: "trial", trialEndsAt: END.toISOString(), trialDaysLeft: 20 }, new Date("2026-10-12T12:00:00Z")), null);
  assert.equal(trialEndingNotice({ status: "active", trialEndsAt: END.toISOString(), trialDaysLeft: 2 }, now), null);
});

test("webhook + ensureBilling wiring", () => {
  const store = readFileSync(new URL("./billing-store.ts", import.meta.url), "utf8");
  assert.match(store, /customer\.subscription\.trial_will_end/);
  assert.match(store, /reminderDue\(row, now\)/);
  assert.match(store, /trialReminderSentAt: null/, "claims the send before emailing (no double send)");
  assert.match(store, /syncBillingFromStripe/);
  assert.match(store, /subscriptionEventForOtherCustomer/);
});

import { nextRenewal, readRenewal, renewalReminderDue, renewalReminderEmail } from "./trial-reminder";
import { BASE_PLAN_ANNUAL_DOLLARS, classifyStripeEvent, formatAnnualPlanPrice } from "./billing";

test("yearly renewal reminder: due 30 days before, once per renewal, yearly + active only", () => {
  const renewsAt = new Date("2027-10-02T17:00:00Z");
  const row = { billingStatus: "active", planInterval: "year", renewsAt, renewalReminderAt: null as Date | null };
  assert.ok(!renewalReminderDue(row, new Date("2027-08-20T17:00:00Z")), "too early");
  assert.ok(renewalReminderDue(row, new Date("2027-09-03T18:00:00Z")), "inside 30 days");
  assert.ok(!renewalReminderDue({ ...row, renewalReminderAt: new Date("2027-09-03T18:00:00Z") }, new Date("2027-09-10T00:00:00Z")), "sent for this renewal");
  assert.ok(renewalReminderDue({ ...row, renewalReminderAt: new Date("2026-09-03T18:00:00Z") }, new Date("2027-09-10T00:00:00Z")), "last year's send doesn't count");
  assert.ok(!renewalReminderDue({ ...row, planInterval: "month" }, new Date("2027-09-20T00:00:00Z")), "monthly: no yearly notice");
  assert.ok(!renewalReminderDue({ ...row, billingStatus: "canceled" }, new Date("2027-09-20T00:00:00Z")));
});

test("renewal email: date, $1,990 from lib/billing, cancel path", () => {
  const mail = renewalReminderEmail({
    businessName: "Top Gun Painting",
    renewsAt: new Date("2027-10-02T17:00:00Z"),
    origin: "https://app.example",
    yearlyPrice: formatAnnualPlanPrice(BASE_PLAN_ANNUAL_DOLLARS),
  });
  assert.match(mail.subject, /yearly plan renews Saturday, October 2/);
  assert.ok(mail.text.includes(formatAnnualPlanPrice(BASE_PLAN_ANNUAL_DOLLARS)));
  assert.ok(mail.text.includes("https://app.example/?tab=company&billing=portal"));
  assert.match(mail.text, /unless you cancel before then/);
});

test("renewal fields from Stripe objects (old + new API shapes) and mock checkout", () => {
  assert.deepEqual(readRenewal({ current_period_end: 1822500000, items: { data: [{ price: { recurring: { interval: "year" } } }] } }), {
    interval: "year",
    renewsAt: new Date(1822500000 * 1000),
  });
  assert.deepEqual(readRenewal({ items: { data: [{ current_period_end: 1822500000, plan: { interval: "month" } }] } }).interval, "month");
  assert.equal(readRenewal({ next_payment_attempt: 1822500000, lines: { data: [{ price: { recurring: { interval: "year" } } }] } }).interval, "year");
  assert.equal(nextRenewal("year", new Date("2026-10-02T12:00:00Z")).toISOString(), "2027-10-02T12:00:00.000Z");
  assert.equal(nextRenewal("month", new Date("2026-10-02T12:00:00Z")).toISOString(), "2026-11-02T12:00:00.000Z");
  assert.equal(classifyStripeEvent({ type: "invoice.upcoming", data: { object: { subscription: "sub_1" } } }), "billing");
  const store = readFileSync(new URL("./billing-store.ts", import.meta.url), "utf8");
  assert.match(store, /invoice\.upcoming/);
  assert.match(store, /renewalReminderDue\(/);
  const actions = readFileSync(new URL("../app/actions.ts", import.meta.url), "utf8");
  // Go-public B4: no mock checkout. Without Stripe nothing writes a plan or turns the add-on on.
  assert.doesNotMatch(actions, /recordMockPlan\(|applyCheckoutCompleted\(/);
});
