/**
 * "Your free trial ends soon" (pure). Sent once, about 3 days before the first charge: by Stripe's
 * customer.subscription.trial_will_end webhook, or by the local fallback in ensureBilling when no
 * webhook arrives (mock mode, missed event). Same words in the email and the in-app banner.
 */
import { formatFlatPlanPrice } from "@/lib/billing";

export const REMINDER_DAYS = 3;

type ReminderRow = {
  billingStatus: string;
  trialEndsAt: Date | string | null;
  trialReminderSentAt?: Date | string | null;
  stripeSubId?: string;
};

function asDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Local fallback: trial still running, ends within 3 days, and no reminder sent yet. */
export function reminderDue(row: ReminderRow, now: Date) {
  if (row.billingStatus !== "trial" || asDate(row.trialReminderSentAt)) return false;
  const end = asDate(row.trialEndsAt);
  if (!end) return false;
  const ms = end.getTime() - now.getTime();
  return ms > 0 && ms <= REMINDER_DAYS * 24 * 60 * 60 * 1000;
}

export function conversionDate(end: Date | string | null | undefined) {
  const date = asDate(end);
  return date ? date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/Chicago" }) : "";
}

export function cancelTrialUrl(origin: string) {
  return `${origin.replace(/\/$/, "")}/?tab=company&billing=cancel-trial`;
}

export function trialReminderEmail(input: { businessName?: string; firstName?: string; trialEndsAt: Date | string; origin: string; cardLast4?: string }) {
  const when = conversionDate(input.trialEndsAt);
  const price = formatFlatPlanPrice();
  const cancel = cancelTrialUrl(input.origin);
  const card = input.cardLast4 ? `the card ending ${input.cardLast4}` : "your card on file";
  const hi = input.firstName?.trim() ? `Hi ${input.firstName.trim()},` : "Hi,";
  const shop = input.businessName?.trim() || "your shop";
  const subject = `Your Job Command trial ends ${when}`;
  const lines = [
    hi,
    `Your free trial for ${shop} ends ${when}. On that day we’ll charge ${card} ${price} for the Base App, then ${price} every month until you cancel.`,
    `Don’t want it? Cancel in one tap — you won’t be charged: ${cancel}`,
    "AI answering (+$59/mo) is separate and stays off unless you turned it on.",
    "— Job Command",
  ];
  const text = lines.join("\n\n");
  const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<div style="font-family:system-ui,sans-serif;font-size:17px;line-height:1.5;color:#111">
<p>${esc(hi)}</p>
<p>Your free trial for <b>${esc(shop)}</b> ends <b>${esc(when)}</b>. On that day we’ll charge ${esc(card)} <b>${esc(price)}</b> for the Base App, then ${esc(price)} every month until you cancel.</p>
<p><a href="${esc(cancel)}" style="display:inline-block;padding:14px 22px;background:#111;color:#fff;border-radius:10px;text-decoration:none;font-weight:700">Cancel — no charge</a></p>
<p style="color:#555;font-size:15px">AI answering (+$59/mo) is separate and stays off unless you turned it on.</p>
</div>`;
  return { subject, text, html };
}

/** In-app banner for the owner (status trial, 1–3 days left). */
export function trialEndingNotice(billing: { status: string; trialEndsAt: string | null; trialDaysLeft: number }, now = new Date()) {
  if (billing.status !== "trial" || !billing.trialEndsAt) return null;
  const end = asDate(billing.trialEndsAt);
  if (!end || end.getTime() <= now.getTime()) return null;
  if (end.getTime() - now.getTime() > REMINDER_DAYS * 24 * 60 * 60 * 1000) return null;
  const when = end.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return {
    title: `Your free trial ends ${when}`,
    line: `Then it’s ${formatFlatPlanPrice()} until you cancel.`,
  };
}

/* ---------- yearly renewal reminder (30 days before each yearly renewal) ---------- */

export const RENEWAL_REMINDER_DAYS = 30;

type RenewalRow = {
  billingStatus: string;
  planInterval?: string | null;
  renewsAt?: Date | string | null;
  renewalReminderAt?: Date | string | null;
};

/** Yearly plan, active, renewing within 30 days, and no reminder sent for this renewal yet. */
export function renewalReminderDue(row: RenewalRow, now: Date) {
  if (row.billingStatus !== "active" || row.planInterval !== "year") return false;
  const renews = asDate(row.renewsAt);
  if (!renews) return false;
  const ms = renews.getTime() - now.getTime();
  if (ms <= 0 || ms > RENEWAL_REMINDER_DAYS * 24 * 60 * 60 * 1000) return false;
  const sent = asDate(row.renewalReminderAt);
  // A reminder sent for an earlier renewal (more than ~31 days before this one) doesn't count.
  return !sent || sent.getTime() < renews.getTime() - (RENEWAL_REMINDER_DAYS + 1) * 24 * 60 * 60 * 1000;
}

/** Next renewal after a checkout/charge today: one month or one year out. */
export function nextRenewal(interval: string, from: Date) {
  const next = new Date(from.getTime());
  if (interval === "year") next.setUTCFullYear(next.getUTCFullYear() + 1);
  else next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

export function renewalReminderEmail(input: { businessName?: string; firstName?: string; renewsAt: Date | string; origin: string; cardLast4?: string; yearlyPrice: string }) {
  const when = conversionDate(input.renewsAt);
  const billing = `${input.origin.replace(/\/$/, "")}/?tab=company&billing=portal`;
  const card = input.cardLast4 ? `the card ending ${input.cardLast4}` : "your card on file";
  const hi = input.firstName?.trim() ? `Hi ${input.firstName.trim()},` : "Hi,";
  const shop = input.businessName?.trim() || "your shop";
  const subject = `Your Job Command yearly plan renews ${when}`;
  const lines = [
    hi,
    `Your yearly Job Command plan for ${shop} renews ${when}. On that day we’ll charge ${card} ${input.yearlyPrice} for the next year, unless you cancel before then.`,
    `To cancel or switch to monthly, open Company › Billing (no call needed): ${billing}`,
    "— Job Command",
  ];
  const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<div style="font-family:system-ui,sans-serif;font-size:17px;line-height:1.5;color:#111">
<p>${esc(hi)}</p>
<p>Your yearly Job Command plan for <b>${esc(shop)}</b> renews <b>${esc(when)}</b>. On that day we’ll charge ${esc(card)} <b>${esc(input.yearlyPrice)}</b> for the next year, unless you cancel before then.</p>
<p><a href="${esc(billing)}" style="display:inline-block;padding:14px 22px;background:#111;color:#fff;border-radius:10px;text-decoration:none;font-weight:700">Cancel or change plan</a></p>
</div>`;
  return { subject, text: lines.join("\n\n"), html };
}

/** Stripe subscription / invoice object → base-plan interval + next renewal (both API shapes). */
export function readRenewal(object: Record<string, unknown>): { interval: string; renewsAt: Date | null } {
  const items = (object.items as { data?: Array<Record<string, unknown>> } | undefined)?.data || [];
  const lines = (object.lines as { data?: Array<Record<string, unknown>> } | undefined)?.data || [];
  const first = (items[0] || lines[0] || {}) as Record<string, unknown>;
  const price = (first.price || first.plan || object.plan || {}) as Record<string, unknown>;
  const recurring = (price.recurring || {}) as Record<string, unknown>;
  const meta = (object.metadata || {}) as Record<string, unknown>;
  const rawInterval = recurring.interval || price.interval || meta.interval || "";
  const interval = rawInterval === "year" || rawInterval === "month" ? String(rawInterval) : "";
  const unix =
    (typeof object.current_period_end === "number" && object.current_period_end) ||
    (typeof first.current_period_end === "number" && first.current_period_end) ||
    (typeof object.next_payment_attempt === "number" && object.next_payment_attempt) ||
    0;
  return { interval, renewsAt: unix ? new Date(unix * 1000) : null };
}
