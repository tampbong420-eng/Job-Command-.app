import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  applyCheckoutCompleted,
  applySubscriptionUpdated,
  applySignupTrial,
  billingOnSetup,
  BASE_PLAN_ANNUAL_CENTS,
  BASE_PLAN_ANNUAL_DOLLARS,
  BASE_PLAN_CENTS,
  BASE_PLAN_DOLLARS,
  annualMonthlyEquivalent,
  annualSavingsDollars,
  basePlanCents,
  formatAnnualPlanPrice,
  formatPlanForInterval,
  parseBillingInterval,
  canUseAccountantExport,
  canUseAnswering,
  classifyStripeEvent,
  formatFlatPlanPrice,
  isBaseUnlocked,
  mapBaseSubscriptionStatus,
  mapConnectAccount,
  nextBillingState,
  signupLanding,
  startTrialWindow,
  toBillingDTO,
  trialDaysLeft,
  TRIAL_DAYS,
} from "./billing";

const now = new Date("2026-09-18T16:00:00.000Z");

function row(overrides: Partial<ReturnType<typeof baseRow>> = {}) {
  return { ...baseRow(), ...overrides };
}

function baseRow() {
  const window = startTrialWindow(now);
  return {
    billingStatus: "trial",
    trialStartedAt: window.startedAt,
    trialEndsAt: window.endsAt,
    stripeCustomerId: "",
    stripeSubId: "",
    stripeAddonSubId: "",
    addonStatus: "locked",
    cardBrand: "",
    cardLast4: "",
    connectAccountId: "",
    connectStatus: "unlinked",
    connectBankLast4: "",
    setupComplete: true,
  };
}

test("new shops get a 30-day Job Command trial", () => {
  const window = startTrialWindow(now);
  assert.equal(trialDaysLeft(window.endsAt, now), TRIAL_DAYS);
  const started = billingOnSetup(null, now);
  assert.equal(started?.billingStatus, "trial");
  assert.equal(trialDaysLeft(started!.trialEndsAt, now), 30);
});

test("base app stays open on trial or paid, answering stays locked until purchased", () => {
  assert.equal(isBaseUnlocked({ status: "trial", trialEndsAt: startTrialWindow(now).endsAt }, now), true);
  assert.equal(isBaseUnlocked({ status: "active", trialEndsAt: null }, now), true);
  assert.equal(isBaseUnlocked({ status: "expired", trialEndsAt: now }, now), false);
  assert.equal(canUseAnswering("locked"), false);
  assert.equal(canUseAnswering("active"), true);
  const dto = toBillingDTO(row(), now, false);
  assert.equal(dto.baseUnlocked, true);
  assert.equal(dto.canUseAnswering, false);
  assert.equal(dto.basePrice, 199);
  assert.equal(dto.addonPrice, 59);
  assert.equal(BASE_PLAN_CENTS, 19900);
  assert.equal(BASE_PLAN_DOLLARS, 199);
  assert.equal(formatFlatPlanPrice(), "$199/mo");
  assert.equal(formatFlatPlanPrice(19.99), "$19.99/mo");
  assert.equal(canUseAccountantExport(dto), true);
});

test("trial without a card expires; a subscribed shop stays unlocked", () => {
  const ended = new Date(now.getTime() - 1000);
  assert.deepEqual(nextBillingState(row({ trialEndsAt: ended }), now), { billingStatus: "expired" });
  // A subscription id alone is not payment: the app stays locked until Stripe confirms the first charge.
  assert.deepEqual(nextBillingState(row({ trialEndsAt: ended, stripeSubId: "sub_live" }), now), {
    billingStatus: "expired",
  });
  assert.deepEqual(nextBillingState(row({ trialEndsAt: ended, stripeSubId: "mock_sub_base_1" }), now), {
    billingStatus: "expired",
  });
  // Mock mode: only a finished mock checkout (owner tapped Subscribe) stands in for the paid charge.
  assert.deepEqual(nextBillingState(row({ trialEndsAt: ended, stripeSubId: "mock_base_1" }), now), {
    billingStatus: "active",
  });
  assert.equal(toBillingDTO(row({ trialEndsAt: ended, stripeSubId: "sub_live" }), now).baseUnlocked, false);
  assert.equal(canUseAccountantExport({ status: "expired", trialEndsAt: ended }, now), false);
  assert.equal(canUseAccountantExport({ status: "active", trialEndsAt: null }, now), true);
});

test("post-signup trial verification routes to orange or Company billing", () => {
  const started = applySignupTrial(now, {
    customerId: "cus_trial",
    subscriptionId: "sub_trial",
    status: "trialing",
    verified: true,
  });
  assert.equal(started.billingStatus, "trial");
  assert.equal(started.addonStatus, "locked");
  assert.equal(started.stripeCustomerId, "cus_trial");
  assert.equal(started.stripeSubId, "sub_trial");
  assert.equal(isBaseUnlocked({ status: started.billingStatus!, trialEndsAt: started.trialEndsAt }, now), true);
  assert.equal(canUseAnswering(started.addonStatus!), false);
  assert.deepEqual(signupLanding({ verified: true, status: "trialing" }), {
    href: "/?stage=estimate",
    route: "pipeline",
    verified: true,
  });
  assert.deepEqual(signupLanding({ verified: false, status: "incomplete" }), {
    href: "/?tab=company&billing=verify",
    route: "billing",
    verified: false,
  });
  const failed = applySignupTrial(now, {
    customerId: "",
    subscriptionId: "",
    status: "incomplete",
    verified: false,
  });
  assert.equal(failed.billingStatus, "trial");
  assert.equal(failed.addonStatus, "locked");
});

test("checkout and subscription webhooks split base vs answering", () => {
  const paid = applyCheckoutCompleted(row(), {
    kind: "base",
    customerId: "cus_1",
    subscriptionId: "sub_base",
    cardBrand: "visa",
    cardLast4: "4242",
    now,
  });
  assert.equal(paid.billingStatus, "trial");
  assert.equal(paid.stripeSubId, "sub_base");
  assert.equal(paid.cardLast4, "4242");
  const addon = applyCheckoutCompleted(row(), {
    kind: "addon",
    subscriptionId: "sub_ai",
    now,
  });
  assert.equal(addon.addonStatus, "active");
  const canceled = applySubscriptionUpdated(row({ addonStatus: "active", stripeAddonSubId: "sub_ai" }), {
    kind: "addon",
    status: "canceled",
    subscriptionId: "sub_ai",
  });
  assert.equal(canceled.addonStatus, "canceled");
});

test("Connect onboarding maps to a linked bank for the 1% split destination", () => {
  const pending = mapConnectAccount({ id: "acct_1", details_submitted: true });
  assert.equal(pending.connectStatus, "pending");
  const live = mapConnectAccount({
    id: "acct_1",
    charges_enabled: true,
    payouts_enabled: true,
    last4: "6789",
  });
  assert.equal(live.connectStatus, "complete");
  assert.equal(live.connectBankLast4, "6789");
});

test("stripe events route billing, invoices, and connect without mixing", () => {
  assert.equal(
    classifyStripeEvent({
      type: "checkout.session.completed",
      data: { object: { metadata: { kind: "addon" } } },
    }),
    "billing"
  );
  assert.equal(
    classifyStripeEvent({
      type: "checkout.session.completed",
      data: { object: { metadata: { invoiceId: "inv_1" }, client_reference_id: "inv_1" } },
    }),
    "invoice"
  );
  assert.equal(
    classifyStripeEvent({
      type: "account.updated",
      data: { object: { id: "acct_1" } },
    }),
    "connect"
  );
  assert.equal(
    classifyStripeEvent({
      type: "customer.subscription.created",
      data: { object: { id: "sub_1", status: "trialing", metadata: { kind: "base" } } },
    }),
    "billing"
  );
  assert.equal(
    classifyStripeEvent({
      type: "customer.subscription.updated",
      data: { object: { id: "sub_1", status: "active", metadata: { kind: "base" } } },
    }),
    "billing"
  );
  assert.equal(
    classifyStripeEvent({
      type: "invoice.payment_succeeded",
      data: { object: { subscription: "sub_1" } },
    }),
    "billing"
  );
  assert.equal(
    classifyStripeEvent({
      type: "invoice.payment_succeeded",
      data: { object: { metadata: { invoiceId: "inv_1" }, client_reference_id: "inv_1" } },
    }),
    "invoice"
  );
  assert.equal(
    classifyStripeEvent({
      type: "customer.created",
      data: { object: {} },
    }),
    "ignore"
  );
});

test("yearly base plan: $1,990/yr, saves $398 vs 12 monthly charges", () => {
  assert.equal(BASE_PLAN_ANNUAL_CENTS, 199000);
  assert.equal(BASE_PLAN_ANNUAL_DOLLARS, 1990);
  assert.equal(basePlanCents("month"), BASE_PLAN_CENTS);
  assert.equal(basePlanCents("year"), 199000);
  assert.equal(formatAnnualPlanPrice(), "$1,990/yr");
  assert.equal(formatPlanForInterval("month"), "$199/mo");
  assert.equal(formatPlanForInterval("year"), "$1,990/yr");
  assert.equal(annualSavingsDollars(), 398);
  assert.equal(annualMonthlyEquivalent(), 165.83);
  assert.equal(parseBillingInterval("year"), "year");
  assert.equal(parseBillingInterval("month"), "month");
  assert.equal(parseBillingInterval("weekly"), "month");
  assert.equal(parseBillingInterval(undefined), "month");
  assert.equal(toBillingDTO(row(), now, false).basePriceAnnual, 1990);
});

test("yearly checkout uses STRIPE_PRICE_BASE_ANNUAL or interval=year price_data", () => {
  const src = readFileSync(new URL("./billing-stripe.ts", import.meta.url), "utf8");
  assert.match(src, /STRIPE_PRICE_BASE_ANNUAL/);
  assert.match(src, /\[recurring\]\[interval\]": yearly \? "year" : "month"/);
  assert.match(src, /basePlanCents\(yearly \? "year" : "month"\)/);
  const desk = readFileSync(new URL("../components/command/BillingDesk.tsx", import.meta.url), "utf8");
  assert.match(desk, /startBillingCheckout\(kind, kind === "base" \? planInterval : undefined\)/);
  assert.match(desk, /data-plan-interval/);
});

test("free-forever guards: unknown Stripe status fails closed and a trial never re-opens", () => {
  assert.equal(mapBaseSubscriptionStatus("incomplete"), "expired");
  assert.equal(mapBaseSubscriptionStatus("paused"), "expired");
  assert.equal(mapBaseSubscriptionStatus("something_new"), "expired");
  assert.equal(mapBaseSubscriptionStatus("active"), "active");
  const ended = new Date(now.getTime() - 1000);
  const started = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);
  assert.equal(
    billingOnSetup(row({ billingStatus: "expired", trialStartedAt: started, trialEndsAt: ended }), now),
    null
  );
  assert.equal(nextBillingState(row({ billingStatus: "expired", trialStartedAt: started, trialEndsAt: ended }), now), null);
  const again = applySignupTrial(
    now,
    { customerId: "cus_2", subscriptionId: "sub_2", status: "trialing", verified: true },
    { trialStartedAt: started, trialEndsAt: ended }
  );
  assert.equal(again.billingStatus, "expired");
  assert.equal((again.trialStartedAt as Date).getTime(), started.getTime());
});
