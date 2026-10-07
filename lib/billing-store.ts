import "server-only";

import { prisma } from "@/lib/prisma";
import { syncBillingFromStripe } from "@/lib/billing-sync";
import { subscriptionEventForOtherCustomer } from "@/lib/billing-sync-rules";
import { sendEmail } from "@/lib/delivery";
import { appOrigin } from "@/lib/origin";
import { Prisma } from "@prisma/client";
import { BASE_PLAN_ANNUAL_DOLLARS, formatAnnualPlanPrice } from "@/lib/billing";
import {
  nextRenewal,
  readRenewal,
  reminderDue,
  renewalReminderDue,
  renewalReminderEmail,
  trialReminderEmail,
} from "@/lib/trial-reminder";
import {
  applyCheckoutCompleted,
  applySubscriptionUpdated,
  classifyStripeEvent,
  mapConnectAccount,
  nextBillingState,
  readCardFromStripeObject,
  readStripeKind,
  type BillingKind,
  type BillingRow,
} from "@/lib/billing";

function asRow(row: {
  billingStatus: string;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  stripeCustomerId: string;
  stripeSubId: string;
  stripeAddonSubId: string;
  addonStatus: string;
  cardBrand: string;
  cardLast4: string;
  connectAccountId: string;
  connectStatus: string;
  connectBankLast4: string;
  setupComplete: boolean;
}): BillingRow {
  return row;
}

export async function ensureBilling(now = new Date()) {
  let row = await prisma.appSettings.findUnique({ where: { id: "default" } });
  if (!row) return null;
  // Missed webhook? Ask Stripe (throttled by billingCheckedAt) before trusting the local status.
  const synced = await syncBillingFromStripe(row, now);
  if (synced) row = await prisma.appSettings.update({ where: { id: "default" }, data: synced });
  const patch = nextBillingState(asRow(row), now);
  if (patch) row = await prisma.appSettings.update({ where: { id: "default" }, data: patch });
  // Local fallback for Stripe's trial_will_end (mock mode, or the webhook never came).
  if (reminderDue(row, now)) row = (await sendTrialReminder(now)) || row;
  // Yearly plan: 30 days before each renewal (local fallback for Stripe's invoice.upcoming).
  if (renewalReminderDue(row as RenewalFields, now)) await sendRenewalReminder(now);
  return row;
}

type RenewalFields = { billingStatus: string; planInterval?: string; renewsAt?: Date | null; renewalReminderAt?: Date | null };

/**
 * planInterval / renewsAt / renewalReminderAt were added Oct 2 2026 (additive SQL). A Prisma client
 * generated before that doesn't know them; writes skip unknown columns instead of throwing.
 */
function knownColumns(): string[] {
  return Object.values((Prisma as unknown as { AppSettingsScalarFieldEnum?: Record<string, string> }).AppSettingsScalarFieldEnum || {});
}

function onlyKnown(data: Record<string, unknown>) {
  const known = knownColumns();
  return Object.fromEntries(Object.entries(data).filter(([key]) => known.includes(key)));
}

/** Base plan bought or renewed: remember monthly vs yearly and the next renewal day. */
export async function recordPlanRenewal(interval: string, renewsAt: Date | null) {
  const data = onlyKnown({ ...(interval ? { planInterval: interval } : {}), ...(renewsAt ? { renewsAt } : {}) });
  if (!Object.keys(data).length) return;
  await prisma.appSettings.update({ where: { id: "default" }, data });
}

/** Mock checkout (no Stripe key): the plan starts today, so it renews one month/year from now. */
export async function recordMockPlan(interval: string, now = new Date()) {
  await recordPlanRenewal(interval, nextRenewal(interval, now));
}

/** "Your yearly plan renews <date> for $1,990": once per renewal. Marks it sent first (no double send). */
export async function sendRenewalReminder(now = new Date(), renewsAtHint?: Date | null) {
  if (!knownColumns().includes("renewalReminderAt")) return null;
  const row = (await prisma.appSettings.findUnique({ where: { id: "default" } })) as (Record<string, unknown> & { renewsAt?: Date | null; renewalReminderAt?: Date | null }) | null;
  if (!row) return null;
  const renewsAt = renewsAtHint || row.renewsAt || null;
  if (!renewsAt) return null;
  const windowStart = new Date(renewsAt.getTime() - 31 * 24 * 60 * 60 * 1000);
  const claimed = await prisma.appSettings.updateMany({
    where: { id: "default", OR: [{ renewalReminderAt: null }, { renewalReminderAt: { lt: windowStart } }] } as unknown as Prisma.AppSettingsWhereInput,
    data: onlyKnown({ renewalReminderAt: now, renewsAt }) as unknown as Prisma.AppSettingsUpdateManyMutationInput,
  });
  if (!claimed.count) return null;
  const to = String(row.ownerEmail || row.businessEmail || "").trim();
  if (to) {
    const mail = renewalReminderEmail({
      businessName: String(row.businessName || ""),
      firstName: String(row.ownerFirstName || ""),
      renewsAt,
      origin: appOrigin(),
      cardLast4: String(row.cardLast4 || ""),
      yearlyPrice: formatAnnualPlanPrice(BASE_PLAN_ANNUAL_DOLLARS),
    });
    const sent = await sendEmail({ to, ...mail }).catch(() => null);
    await prisma.auditLog
      .create({ data: { actor: "Billing", action: "Yearly renewal reminder", field: "billing", newValue: sent?.ok ? `emailed ${to}` : "email failed" } })
      .catch(() => undefined);
  }
  return row;
}

/** "Your trial ends <date>": email once (Resend, or the mock log without a key). Marks it sent first. */
export async function sendTrialReminder(now = new Date()) {
  const claimed = await prisma.appSettings.updateMany({
    where: { id: "default", trialReminderSentAt: null },
    data: { trialReminderSentAt: now },
  });
  if (!claimed.count) return null;
  const row = await prisma.appSettings.findUnique({ where: { id: "default" } });
  if (!row) return null;
  const to = (row.ownerEmail || row.businessEmail || "").trim();
  if (to && row.trialEndsAt) {
    const mail = trialReminderEmail({
      businessName: row.businessName,
      firstName: row.ownerFirstName,
      trialEndsAt: row.trialEndsAt,
      origin: appOrigin(),
      cardLast4: row.cardLast4,
    });
    const sent = await sendEmail({ to, ...mail }).catch(() => null);
    await prisma.auditLog
      .create({
        data: { actor: "Billing", action: "Trial-ending reminder", field: "billing", newValue: sent?.ok ? `emailed ${to}` : "email failed" },
      })
      .catch(() => undefined);
  }
  return row;
}

export async function loadBillingRow() {
  const row = (await ensureBilling()) || (await prisma.appSettings.findUnique({ where: { id: "default" } }));
  if (!row) return null;
  return asRow(row);
}

export async function applyStripeBillingEvent(event: {
  type?: string;
  data?: { object?: Record<string, unknown> };
}) {
  const classKind = classifyStripeEvent(event);
  if (classKind !== "billing") return 0;
  const object = event.data?.object || {};
  const meta = (object.metadata && typeof object.metadata === "object" ? object.metadata : {}) as Record<
    string,
    unknown
  >;
  const subscriptionHint =
    (typeof object.subscription === "string" && object.subscription) ||
    (event.type?.startsWith("customer.subscription") && typeof object.id === "string" ? object.id : "");
  const kind: BillingKind =
    readStripeKind(meta, object.client_reference_id) ||
    (subscriptionHint ? await inferKindFromSubscription(subscriptionHint) : null) ||
    "base";
  const row = await loadBillingRow();
  if (!row) return 0;

  const customerId =
    typeof object.customer === "string"
      ? object.customer
      : typeof object.id === "string" && event.type === "checkout.session.completed"
        ? ""
        : "";
  const subscriptionId =
    typeof object.subscription === "string"
      ? object.subscription
      : event.type?.startsWith("customer.subscription") && typeof object.id === "string"
        ? object.id
        : "";
  const card = readCardFromStripeObject(object);
  const type = event.type || "";
  // A subscription event for someone else's customer never touches this shop's billing.
  if (subscriptionEventForOtherCustomer(type, object, row.stripeCustomerId)) return 0;
  if (type === "invoice.upcoming") {
    // Stripe's "upcoming renewal" notice (set it to 30 days in Dashboard › Billing › Subscriptions).
    if (kind !== "base") return 0;
    const renewal = readRenewal(object);
    const interval = renewal.interval || String((row as unknown as RenewalFields).planInterval || "");
    if (interval !== "year") return 0;
    return (await sendRenewalReminder(new Date(), renewal.renewsAt)) ? 1 : 0;
  }
  if (type.startsWith("customer.subscription") && kind === "base") {
    const renewal = readRenewal(object);
    await recordPlanRenewal(renewal.interval, renewal.renewsAt).catch(() => undefined);
  }
  if (type === "customer.subscription.trial_will_end") {
    // Stripe's 3-days-before notice: send our reminder (once). Status doesn't change here.
    if (kind !== "base") return 0;
    return (await sendTrialReminder()) ? 1 : 0;
  }

  let patch: Partial<BillingRow> = {};
  if (type === "checkout.session.completed" || type === "invoice.paid" || type === "invoice.payment_succeeded") {
    patch = applyCheckoutCompleted(row, {
      kind,
      customerId: typeof object.customer === "string" ? object.customer : customerId,
      subscriptionId,
      cardBrand: card.brand,
      cardLast4: card.last4,
    });
  } else if (type === "invoice.payment_failed") {
    patch = applySubscriptionUpdated(row, {
      kind,
      status: "past_due",
      customerId: typeof object.customer === "string" ? object.customer : undefined,
      subscriptionId,
    });
  } else if (type.startsWith("customer.subscription")) {
    patch = applySubscriptionUpdated(row, {
      kind,
      status: typeof object.status === "string" ? object.status : "canceled",
      customerId: typeof object.customer === "string" ? object.customer : undefined,
      subscriptionId,
    });
  } else {
    return 0;
  }

  await prisma.appSettings.update({ where: { id: "default" }, data: patch });
  return 1;
}

async function inferKindFromSubscription(subscriptionId: string): Promise<BillingKind | null> {
  if (!subscriptionId) return null;
  const row = await prisma.appSettings.findUnique({ where: { id: "default" } });
  if (!row) return null;
  if (row.stripeAddonSubId && row.stripeAddonSubId === subscriptionId) return "addon";
  if (row.stripeSubId && row.stripeSubId === subscriptionId) return "base";
  return "base";
}

export async function applyStripeConnectEvent(event: {
  type?: string;
  data?: { object?: Record<string, unknown> };
}) {
  if (classifyStripeEvent(event) !== "connect") return 0;
  const object = event.data?.object || {};
  const id = typeof object.id === "string" ? object.id : "";
  if (!id) return 0;
  const external = object.external_accounts as { data?: Array<Record<string, unknown>> } | undefined;
  const last4 = typeof external?.data?.[0]?.last4 === "string" ? external.data[0].last4 : "";
  const mapped = mapConnectAccount({
    id,
    charges_enabled: Boolean(object.charges_enabled),
    payouts_enabled: Boolean(object.payouts_enabled),
    details_submitted: Boolean(object.details_submitted),
    last4,
  });
  await prisma.appSettings.update({
    where: { id: "default" },
    data: mapped,
  });
  return 1;
}
