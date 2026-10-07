import "server-only";
import { currentShopId } from "@/lib/shop-context";

import {
  ADDON_PLAN_CENTS,
  BASE_PLAN_CENTS,
  TRIAL_DAYS,
  basePlanCents,
  type BillingInterval,
  applySignupTrial,
  signupLanding,
  type BillingKind,
  type BillingRow,
  trialDaysLeft,
} from "@/lib/billing";
import { stripeConfigured } from "@/lib/stripe-rest";
import { stripeRequest, stripeSecret } from "@/lib/stripe-rest";

function priceFields(kind: BillingKind, interval: BillingInterval = "month"): Record<string, string> {
  // The answering add-on is monthly only; yearly applies to the base plan.
  const yearly = kind === "base" && interval === "year";
  const envPrice =
    kind === "addon"
      ? process.env.STRIPE_PRICE_ANSWERING?.trim()
      : yearly
        ? process.env.STRIPE_PRICE_BASE_ANNUAL?.trim()
        : process.env.STRIPE_PRICE_BASE?.trim();
  if (envPrice) {
    return {
      "line_items[0][price]": envPrice,
      "line_items[0][quantity]": "1",
    };
  }
  const name = kind === "addon" ? "Job Command AI Answering" : "Job Command";
  const cents = kind === "addon" ? ADDON_PLAN_CENTS : basePlanCents(yearly ? "year" : "month");
  return {
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(cents),
    "line_items[0][price_data][recurring][interval]": yearly ? "year" : "month",
    "line_items[0][price_data][product_data][name]": name,
  };
}

export async function createSubscriptionCheckout(input: {
  kind: BillingKind;
  /** Base plan only: "month" ($199/mo) or "year" ($1,990/yr). Defaults to monthly. */
  interval?: BillingInterval;
  origin: string;
  email?: string;
  name?: string;
  customerId?: string;
  trialEndsAt?: Date | string | null;
}): Promise<{ id: string; url: string; mock: boolean }> {
  const origin = input.origin.replace(/\/$/, "");
  const success = `${origin}/?tab=company&billing=success`;
  const cancel = `${origin}/?tab=company&billing=cancel`;
  if (!stripeConfigured() || !stripeSecret()) {
    return { id: `mock_${input.kind}`, url: `${origin}/?tab=company&billing=mock&kind=${input.kind}`, mock: true };
  }

  const fields: Record<string, string> = {
    mode: "subscription",
    success_url: success,
    cancel_url: cancel,
    client_reference_id: `billing:${input.kind}`,
    "metadata[kind]": input.kind,
    "subscription_data[metadata][kind]": input.kind,
    "subscription_data[metadata][interval]": input.kind === "base" ? input.interval || "month" : "month",
    // Multi-shop B2: the webhook finds the right shop from this.
    "metadata[shopId]": await currentShopId(),
    "subscription_data[metadata][shopId]": await currentShopId(),
    ...priceFields(input.kind, input.interval),
  };
  if (input.customerId) fields.customer = input.customerId;
  else if (input.email) {
    fields.customer_email = input.email;
    if (input.name) fields["customer_update[name]"] = "auto";
  }
  if (input.kind === "base" && input.trialEndsAt) {
    const left = trialDaysLeft(input.trialEndsAt, new Date());
    if (left >= 2) {
      const end = new Date(input.trialEndsAt);
      fields["subscription_data[trial_end]"] = String(Math.floor(end.getTime() / 1000));
    }
  }

  const payload = await stripeRequest("checkout/sessions", fields);
  const url = typeof payload.url === "string" ? payload.url : "";
  if (!url) throw new Error("Stripe could not open billing checkout.");
  return { id: typeof payload.id === "string" ? payload.id : "", url, mock: false };
}

export async function createBillingPortal(input: { customerId: string; origin: string }) {
  const origin = input.origin.replace(/\/$/, "");
  if (!stripeConfigured() || !input.customerId || input.customerId.startsWith("mock_")) {
    return { url: `${origin}/?tab=company&billing=portal`, mock: true };
  }
  const payload = await stripeRequest("billing_portal/sessions", {
    customer: input.customerId,
    return_url: `${origin}/?tab=company&billing=portal`,
  });
  const url = typeof payload.url === "string" ? payload.url : "";
  if (!url) throw new Error("Stripe could not open the card portal.");
  return { url, mock: false };
}

export async function createConnectAccount(input: { email?: string; country?: string }) {
  if (!stripeConfigured()) {
    return { id: "acct_mock_jobcommand", mock: true as const };
  }
  const payload = await stripeRequest("accounts", {
    type: "express",
    country: input.country || "US",
    email: input.email || "",
    "capabilities[card_payments][requested]": "true",
    "capabilities[transfers][requested]": "true",
    "metadata[app]": "job-command",
    "metadata[shopId]": await currentShopId(),
  });
  const id = typeof payload.id === "string" ? payload.id : "";
  if (!id) throw new Error("Stripe could not open a Connect account.");
  return { id, mock: false as const };
}

export async function createConnectOnboardingLink(input: {
  accountId: string;
  origin: string;
}) {
  const origin = input.origin.replace(/\/$/, "");
  const refresh = `${origin}/?tab=company&connect=refresh`;
  const ret = `${origin}/?tab=company&connect=return`;
  if (!stripeConfigured() || input.accountId.startsWith("acct_mock")) {
    return { url: ret, mock: true };
  }
  const payload = await stripeRequest("account_links", {
    account: input.accountId,
    refresh_url: refresh,
    return_url: ret,
    type: "account_onboarding",
  });
  const url = typeof payload.url === "string" ? payload.url : "";
  if (!url) throw new Error("Stripe could not start bank linking.");
  return { url, mock: false };
}

function subscriptionPriceFields(): Record<string, string> {
  const envPrice = process.env.STRIPE_PRICE_BASE?.trim();
  if (envPrice) return { "items[0][price]": envPrice };
  return {
    "items[0][price_data][currency]": "usd",
    "items[0][price_data][unit_amount]": String(BASE_PLAN_CENTS),
    "items[0][price_data][recurring][interval]": "month",
    "items[0][price_data][product_data][name]": "Job Command",
  };
}

export async function retrieveSubscription(subscriptionId: string) {
  if (!subscriptionId) return null;
  if (!stripeConfigured() || subscriptionId.startsWith("mock_")) {
    return {
      id: subscriptionId,
      status: "trialing",
      customer: "",
      trial_end: Math.floor(Date.now() / 1000) + TRIAL_DAYS * 24 * 60 * 60,
    };
  }
  const payload = await stripeRequest(`subscriptions/${subscriptionId}`);
  return {
    id: typeof payload.id === "string" ? payload.id : subscriptionId,
    status: typeof payload.status === "string" ? payload.status : "",
    customer: typeof payload.customer === "string" ? payload.customer : "",
    trial_end: typeof payload.trial_end === "number" ? payload.trial_end : null,
  };
}

export async function provisionSignupTrial(input: {
  email?: string;
  name?: string;
  existingCustomerId?: string;
  existingSubId?: string;
  now?: Date;
}): Promise<{
  landing: ReturnType<typeof signupLanding> & { mock: boolean };
  rowPatch: Partial<BillingRow>;
}> {
  const now = input.now || new Date();
  const existingCustomer = (input.existingCustomerId || "").trim();
  const existingSub = (input.existingSubId || "").trim();
  let customerId = existingCustomer && !existingCustomer.startsWith("mock_") ? existingCustomer : "";
  let subscriptionId = existingSub && !existingSub.startsWith("mock_") ? existingSub : "";

  if (!stripeConfigured()) {
    customerId = existingCustomer || `mock_cus_${now.getTime()}`;
    subscriptionId = existingSub || `mock_sub_base_${now.getTime()}`;
    const rowPatch = applySignupTrial(now, {
      customerId,
      subscriptionId,
      status: "trialing",
      verified: true,
    });
    return {
      landing: { ...signupLanding({ verified: true, status: "trialing" }), mock: true },
      rowPatch,
    };
  }

  try {
    if (!customerId) {
      const customer = await stripeRequest("customers", {
        email: input.email || "",
        name: input.name || "",
        "metadata[app]": "job-command",
        "metadata[base_app]": "active",
        "metadata[ai_answering]": "locked",
      });
      customerId = typeof customer.id === "string" ? customer.id : "";
    }
    if (!customerId) throw new Error("Stripe did not return a customer id.");

    if (!subscriptionId) {
      const created = await stripeRequest("subscriptions", {
        customer: customerId,
        trial_period_days: String(TRIAL_DAYS),
        "metadata[kind]": "base",
        "metadata[base_app]": "active",
        "metadata[ai_answering]": "locked",
        "payment_settings[save_default_payment_method]": "on_subscription",
        "trial_settings[end_behavior][missing_payment_method]": "cancel",
        ...subscriptionPriceFields(),
      });
      subscriptionId = typeof created.id === "string" ? created.id : "";
    }
    if (!subscriptionId) throw new Error("Stripe did not start a trial subscription.");

    const live = await retrieveSubscription(subscriptionId);
    const status = live?.status || "";
    const verified = status === "trialing" || status === "active";
    const rowPatch = applySignupTrial(now, {
      customerId: live?.customer || customerId,
      subscriptionId,
      status: status || "trialing",
      trialEnd: live?.trial_end,
      verified,
    });
    return {
      landing: { ...signupLanding({ verified, status: status || "trialing" }), mock: false },
      rowPatch,
    };
  } catch {
    const rowPatch = applySignupTrial(now, {
      customerId,
      subscriptionId,
      status: "incomplete",
      verified: false,
    });
    return {
      landing: { ...signupLanding({ verified: false, status: "incomplete" }), mock: false },
      rowPatch,
    };
  }
}

export async function retrieveConnectAccount(accountId: string) {
  if (!accountId) return null;
  if (!stripeConfigured() || accountId.startsWith("acct_mock")) {
    return {
      id: accountId,
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      last4: "6789",
    };
  }
  const payload = await stripeRequest(`accounts/${accountId}`);
  const external = payload.external_accounts as
    | { data?: Array<Record<string, unknown>> }
    | undefined;
  const last4 = typeof external?.data?.[0]?.last4 === "string" ? external.data[0].last4 : "";
  return {
    id: typeof payload.id === "string" ? payload.id : accountId,
    charges_enabled: Boolean(payload.charges_enabled),
    payouts_enabled: Boolean(payload.payouts_enabled),
    details_submitted: Boolean(payload.details_submitted),
    last4,
  };
}
