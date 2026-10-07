export const TRIAL_DAYS = 14;
export const BASE_PLAN_CENTS = 19900;
export const ADDON_PLAN_CENTS = 5900;
export const BASE_PLAN_DOLLARS = 199;
/** Yearly billing for the base plan: one charge a year, about 17% off 12 monthly payments. */
export const BASE_PLAN_ANNUAL_CENTS = 199000;
export const BASE_PLAN_ANNUAL_DOLLARS = 1990;
export const ADDON_PLAN_DOLLARS = 59;

export type BillingStatus = "none" | "trial" | "active" | "past_due" | "canceled" | "expired";
export type AddonStatus = "locked" | "active" | "canceled";
export type ConnectStatus = "unlinked" | "pending" | "complete";
export type BillingKind = "base" | "addon";
export type BillingInterval = "month" | "year";

export type BillingDTO = {
  status: BillingStatus;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialDaysLeft: number;
  trialExpired: boolean;
  baseUnlocked: boolean;
  canUseAnswering: boolean;
  addonStatus: AddonStatus;
  cardBrand: string;
  cardLast4: string;
  connectAccountId: string;
  connectStatus: ConnectStatus;
  connectBankLast4: string;
  stripeConfigured: boolean;
  mockMode: boolean;
  basePrice: number;
  basePriceAnnual: number;
  addonPrice: number;
};

export type BillingRow = {
  billingStatus: string;
  trialStartedAt: Date | string | null;
  trialEndsAt: Date | string | null;
  stripeCustomerId: string;
  stripeSubId: string;
  stripeAddonSubId: string;
  addonStatus: string;
  cardBrand: string;
  cardLast4: string;
  connectAccountId: string;
  connectStatus: string;
  connectBankLast4: string;
  setupComplete?: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function startTrialWindow(now: Date) {
  return {
    startedAt: new Date(now),
    endsAt: new Date(now.getTime() + TRIAL_DAYS * DAY_MS),
  };
}

export function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function trialDaysLeft(endsAt: Date | string | null | undefined, now: Date) {
  const end = asDate(endsAt);
  if (!end) return 0;
  const ms = end.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / DAY_MS);
}

export function isTrialOpen(status: string, endsAt: Date | string | null | undefined, now: Date) {
  return status === "trial" && trialDaysLeft(endsAt, now) > 0;
}

export function isBaseUnlocked(
  input: { status: string; trialEndsAt: Date | string | null | undefined },
  now: Date
) {
  if (input.status === "active" || input.status === "past_due") return true;
  return isTrialOpen(input.status, input.trialEndsAt, now);
}

/** Year-end CSV/PDF packets. Same unlock as the base plan; never gates crew clocks. */
export function canUseAccountantExport(input: {
  baseUnlocked?: boolean;
  status?: string;
  trialEndsAt?: Date | string | null;
}, now = new Date()) {
  if (typeof input.baseUnlocked === "boolean") return input.baseUnlocked;
  return isBaseUnlocked(
    { status: input.status || "none", trialEndsAt: input.trialEndsAt },
    now
  );
}

export function formatPlanDollars(dollars = BASE_PLAN_DOLLARS) {
  const value = Number(dollars);
  return Number.isInteger(value)
    ? `$${value.toLocaleString("en-US")}`
    : `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatFlatPlanPrice(dollars = BASE_PLAN_DOLLARS) {
  return `${formatPlanDollars(dollars)}/mo`;
}

export function parseBillingInterval(value: unknown): BillingInterval {
  return value === "year" ? "year" : "month";
}

export function basePlanCents(interval: BillingInterval = "month") {
  return interval === "year" ? BASE_PLAN_ANNUAL_CENTS : BASE_PLAN_CENTS;
}

export function formatAnnualPlanPrice(dollars = BASE_PLAN_ANNUAL_DOLLARS) {
  return `${formatPlanDollars(dollars)}/yr`;
}

/** "$199/mo" or "$1,990/yr" for the chosen billing interval. */
export function formatPlanForInterval(
  interval: BillingInterval,
  monthly = BASE_PLAN_DOLLARS,
  annual = BASE_PLAN_ANNUAL_DOLLARS
) {
  return interval === "year" ? formatAnnualPlanPrice(annual) : formatFlatPlanPrice(monthly);
}

/** What yearly billing saves versus 12 monthly charges ($398 at $199/mo vs $1,990/yr). */
export function annualSavingsDollars(monthly = BASE_PLAN_DOLLARS, annual = BASE_PLAN_ANNUAL_DOLLARS) {
  return Math.round((monthly * 12 - annual) * 100) / 100;
}

/** Yearly price spread over 12 months, for display only ($165.83). */
export function annualMonthlyEquivalent(annual = BASE_PLAN_ANNUAL_DOLLARS) {
  return Math.round((annual / 12) * 100) / 100;
}

export function canUseAnswering(addonStatus: string) {
  return addonStatus === "active";
}

export function parseBillingStatus(value: string | null | undefined): BillingStatus {
  if (
    value === "trial" ||
    value === "active" ||
    value === "past_due" ||
    value === "canceled" ||
    value === "expired"
  ) {
    return value;
  }
  return "none";
}

export function parseAddonStatus(value: string | null | undefined): AddonStatus {
  if (value === "active" || value === "canceled") return value;
  return "locked";
}

export function parseConnectStatus(value: string | null | undefined): ConnectStatus {
  if (value === "pending" || value === "complete") return value;
  return "unlinked";
}

export function mapBaseSubscriptionStatus(stripeStatus: string): BillingStatus {
  if (stripeStatus === "trialing") return "trial";
  if (stripeStatus === "active") return "active";
  if (stripeStatus === "past_due" || stripeStatus === "unpaid") return "past_due";
  if (stripeStatus === "canceled" || stripeStatus === "incomplete_expired") return "canceled";
  // Fail closed: incomplete, paused, or any status Stripe adds later never unlocks the app.
  return "expired";
}

export function mapAddonSubscriptionStatus(stripeStatus: string): AddonStatus {
  if (stripeStatus === "active" || stripeStatus === "trialing" || stripeStatus === "past_due") return "active";
  if (stripeStatus === "canceled" || stripeStatus === "incomplete_expired" || stripeStatus === "unpaid") {
    return "canceled";
  }
  return "locked";
}

export function mapConnectAccount(input: {
  id?: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  last4?: string;
}): { connectAccountId: string; connectStatus: ConnectStatus; connectBankLast4: string } {
  const id = (input.id || "").trim();
  const last4 = (input.last4 || "").trim();
  if (!id) return { connectAccountId: "", connectStatus: "unlinked", connectBankLast4: "" };
  if (input.charges_enabled && input.payouts_enabled) {
    return { connectAccountId: id, connectStatus: "complete", connectBankLast4: last4 };
  }
  return {
    connectAccountId: id,
    connectStatus: input.details_submitted ? "pending" : "pending",
    connectBankLast4: last4,
  };
}

export function billingOnSetup(existing: BillingRow | null | undefined, now: Date) {
  if (existing?.billingStatus === "active" || existing?.billingStatus === "past_due") return null;
  if (existing?.stripeSubId) return null;
  // One trial per shop: once a trial window has started it is never re-opened (reset setup, re-run signup).
  if (existing?.trialStartedAt) return null;
  const window = startTrialWindow(now);
  return {
    trialStartedAt: window.startedAt,
    trialEndsAt: window.endsAt,
    billingStatus: "trial" as const,
  };
}

/**
 * Mock mode only (no Stripe key): the owner tapped Subscribe and finished the mock checkout, which
 * stands in for the first paid charge. The trial sub made at sign-up (mock_sub_base_*) is not payment.
 */
export function paidByMockCheckout(stripeSubId: string | null | undefined) {
  return Boolean(stripeSubId && stripeSubId.startsWith("mock_base_"));
}

export function nextBillingState(row: BillingRow, now: Date): Partial<BillingRow> | null {
  if (row.billingStatus === "trial" && trialDaysLeft(row.trialEndsAt, now) === 0) {
    // A subscription id alone is not proof of payment. Only a Stripe-confirmed status (webhook or the
    // on-demand re-check in billing-sync) or a mock checkout the owner completed moves past the trial.
    if (paidByMockCheckout(row.stripeSubId)) return { billingStatus: "active" };
    return { billingStatus: "expired" };
  }
  if (row.setupComplete && (!row.trialStartedAt || row.billingStatus === "none")) {
    if (row.billingStatus === "active" || row.billingStatus === "past_due" || row.stripeSubId) return null;
    const started = billingOnSetup(row, now);
    return started;
  }
  return null;
}

export function toBillingDTO(row: BillingRow, now = new Date(), stripeOn = false): BillingDTO {
  const status = parseBillingStatus(row.billingStatus);
  const trialEndsAt = asDate(row.trialEndsAt);
  const trialStartedAt = asDate(row.trialStartedAt);
  const days = trialDaysLeft(trialEndsAt, now);
  const addonStatus = parseAddonStatus(row.addonStatus);
  const nextStatus: BillingStatus =
    status === "trial" && days === 0 ? (paidByMockCheckout(row.stripeSubId) ? "active" : "expired") : status;
  return {
    status: nextStatus,
    trialStartedAt: trialStartedAt?.toISOString() ?? null,
    trialEndsAt: trialEndsAt?.toISOString() ?? null,
    trialDaysLeft: days,
    trialExpired: nextStatus === "expired",
    baseUnlocked: isBaseUnlocked({ status: nextStatus, trialEndsAt }, now),
    // Go-public B4: a mock add-on (no Stripe, no phone service) never counts as "on".
    canUseAnswering: canUseAnswering(addonStatus) && !String(row.stripeAddonSubId || "").startsWith("mock_"),
    addonStatus,
    cardBrand: row.cardBrand || "",
    cardLast4: row.cardLast4 || "",
    connectAccountId: row.connectAccountId || "",
    connectStatus: parseConnectStatus(row.connectStatus),
    connectBankLast4: row.connectBankLast4 || "",
    stripeConfigured: stripeOn,
    mockMode: !stripeOn,
    basePrice: BASE_PLAN_DOLLARS,
    basePriceAnnual: BASE_PLAN_ANNUAL_DOLLARS,
    addonPrice: ADDON_PLAN_DOLLARS,
  };
}

export function emptyBillingDTO(now = new Date()): BillingDTO {
  const window = startTrialWindow(now);
  return toBillingDTO(
    {
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
    },
    now,
    false
  );
}

export function applyCheckoutCompleted(
  row: BillingRow,
  input: {
    kind: BillingKind;
    customerId?: string;
    subscriptionId?: string;
    cardBrand?: string;
    cardLast4?: string;
    now?: Date;
  }
): Partial<BillingRow> {
  const now = input.now || new Date();
  const card = {
    cardBrand: input.cardBrand || row.cardBrand || "visa",
    cardLast4: input.cardLast4 || row.cardLast4 || "4242",
  };
  if (input.kind === "addon") {
    return {
      stripeCustomerId: input.customerId || row.stripeCustomerId,
      stripeAddonSubId: input.subscriptionId || row.stripeAddonSubId || `mock_addon_${now.getTime()}`,
      addonStatus: "active",
      ...card,
    };
  }
  const stillTrial = trialDaysLeft(row.trialEndsAt, now) > 0;
  return {
    stripeCustomerId: input.customerId || row.stripeCustomerId,
    stripeSubId: input.subscriptionId || row.stripeSubId || `mock_base_${now.getTime()}`,
    billingStatus: stillTrial ? "trial" : "active",
    ...card,
  };
}

export function applySubscriptionUpdated(
  row: BillingRow,
  input: { kind: BillingKind; status: string; customerId?: string; subscriptionId?: string }
): Partial<BillingRow> {
  if (input.kind === "addon") {
    const addonStatus = mapAddonSubscriptionStatus(input.status);
    return {
      stripeCustomerId: input.customerId || row.stripeCustomerId,
      stripeAddonSubId: input.subscriptionId || row.stripeAddonSubId,
      addonStatus,
    };
  }
  return {
    stripeCustomerId: input.customerId || row.stripeCustomerId,
    stripeSubId: input.subscriptionId || row.stripeSubId,
    billingStatus: mapBaseSubscriptionStatus(input.status),
  };
}

export function readStripeKind(
  meta: Record<string, unknown> | undefined,
  clientReference?: unknown
): BillingKind | null {
  const kind = typeof meta?.kind === "string" ? meta.kind : "";
  if (kind === "base" || kind === "addon") return kind;
  const ref = typeof clientReference === "string" ? clientReference : "";
  if (ref === "billing:base" || ref === "billing:addon") {
    return ref === "billing:addon" ? "addon" : "base";
  }
  return null;
}

export function readCardFromStripeObject(object: Record<string, unknown>): { brand: string; last4: string } {
  const nested =
    (object.payment_method_details as Record<string, unknown> | undefined)?.card ||
    (object.card as Record<string, unknown> | undefined) ||
    ((object.charges as { data?: Array<Record<string, unknown>> } | undefined)?.data?.[0]
      ?.payment_method_details as Record<string, unknown> | undefined)?.card;
  const card = (nested && typeof nested === "object" ? nested : {}) as Record<string, unknown>;
  return {
    brand: typeof card.brand === "string" ? card.brand : "",
    last4: typeof card.last4 === "string" ? card.last4 : "",
  };
}

export type SignupLanding = {
  href: string;
  route: "pipeline" | "billing";
  verified: boolean;
};

export function isTrialingOrActive(status: string) {
  return status === "trialing" || status === "trial" || status === "active";
}

export function applySignupTrial(
  now: Date,
  stripe: {
    customerId: string;
    subscriptionId: string;
    status: string;
    trialEnd?: number | Date | string | null;
    verified: boolean;
  },
  /** The shop's first trial window, if one already ran. It is kept, never restarted or extended. */
  first?: { trialStartedAt?: Date | string | null; trialEndsAt?: Date | string | null } | null
): Partial<BillingRow> {
  const firstStart = asDate(first?.trialStartedAt ?? null);
  const firstEnd = asDate(first?.trialEndsAt ?? null);
  if (firstStart) {
    const ended = trialDaysLeft(firstEnd, now) === 0;
    return {
      stripeCustomerId: stripe.customerId,
      stripeSubId: stripe.subscriptionId,
      billingStatus: ended ? "expired" : "trial",
      addonStatus: "locked",
      trialStartedAt: firstStart,
      trialEndsAt: firstEnd || firstStart,
    };
  }
  const window = startTrialWindow(now);
  const fromUnix =
    typeof stripe.trialEnd === "number" && stripe.trialEnd > 1_000_000
      ? new Date(stripe.trialEnd * 1000)
      : asDate(typeof stripe.trialEnd === "number" ? null : stripe.trialEnd);
  const mapped = mapBaseSubscriptionStatus(stripe.status);
  const billingStatus: BillingStatus =
    stripe.status === "trialing" || mapped === "trial" ? "trial" : stripe.verified ? mapped : "trial";
  return {
    stripeCustomerId: stripe.customerId,
    stripeSubId: stripe.subscriptionId,
    billingStatus,
    addonStatus: "locked",
    trialStartedAt: window.startedAt,
    trialEndsAt: fromUnix || window.endsAt,
  };
}

export function signupLanding(input: { verified: boolean; status: string }): SignupLanding {
  if (input.verified && isTrialingOrActive(input.status)) {
    return { href: "/?stage=estimate", route: "pipeline", verified: true };
  }
  return { href: "/?tab=company&billing=verify", route: "billing", verified: false };
}

function stripeSubscriptionRef(object: Record<string, unknown>) {
  if (typeof object.subscription === "string" && object.subscription) return object.subscription;
  const reason = typeof object.billing_reason === "string" ? object.billing_reason : "";
  return reason.startsWith("subscription");
}

export function classifyStripeEvent(event: {
  type?: string;
  data?: { object?: Record<string, unknown> };
}): "invoice" | "billing" | "connect" | "ignore" {
  const object = event.data?.object || {};
  const meta = (object.metadata && typeof object.metadata === "object" ? object.metadata : {}) as Record<
    string,
    unknown
  >;
  const type = event.type || "";
  if (type.startsWith("account.")) return "connect";
  const invoiceId =
    (typeof object.client_reference_id === "string" && object.client_reference_id) ||
    (typeof meta.invoiceId === "string" && meta.invoiceId) ||
    "";
  const paymentHit =
    /checkout\.session\.completed|payment_intent\.succeeded|invoice\.paid|invoice\.payment_succeeded|charge\.succeeded/.test(
      type
    );
  if (invoiceId && paymentHit) return "invoice";
  if (readStripeKind(meta, object.client_reference_id) || type.startsWith("customer.subscription")) return "billing";
  if (
    (type === "invoice.payment_succeeded" || type === "invoice.payment_failed" || type === "invoice.paid" || type === "invoice.upcoming") &&
    stripeSubscriptionRef(object)
  ) {
    return "billing";
  }
  return "ignore";
}

export const TRIAL_LOCK_MESSAGE =
  "Your 30-day trial ended. Open Company to keep sending estimates and invoices.";
