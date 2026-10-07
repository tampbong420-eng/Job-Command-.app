/**
 * Account deletion (Apple App Store guideline 5.1.1(v)) — pure rules shared by the server action,
 * the Settings screen, and tests. No database, no Stripe, no Node APIs here.
 *
 * Office/owner: "Delete shop account" wipes every shop record (jobs, clients, estimates, invoices,
 * crew, hours, payroll, photos, receipts, alerts, logins) and returns the app to a fresh sign-up.
 * Crew: "Delete my login" removes only that person's own login (PIN, invite link, location ping,
 * profile photo). Their hours and pay stay with the shop, because employers must keep payroll records.
 */

/** What the person types to confirm (the second step). */
export const DELETE_PHRASE = "DELETE";

export function deletePhraseOk(value: unknown) {
  return String(value ?? "").trim().toUpperCase() === DELETE_PHRASE;
}

/**
 * Live Stripe cancel on delete is NOT wired (decision for Eric). With this false, deleting a shop never
 * calls Stripe: the screen tells the owner to cancel in Billing first, and the server leaves a billing
 * note (Stripe ids only, no personal data) so a paid plan can still be found and cancelled.
 */
export const STRIPE_CANCEL_ON_DELETE = false;

/** Tombstone for a crew login the person deleted. verifyPin() can never match it (no "salt:hash"). */
export const REMOVED_PIN_HASH = "REMOVED";

export function loginRemoved(account: { pinHash?: string | null } | null | undefined) {
  return account?.pinHash === REMOVED_PIN_HASH;
}

const LIVE_BASE = new Set(["trial", "active", "past_due"]);

export type BillingForDelete = {
  billingStatus?: string | null;
  stripeSubId?: string | null;
  stripeAddonSubId?: string | null;
  addonStatus?: string | null;
  stripeCustomerId?: string | null;
};

/** A plan that would keep charging after the shop is gone (mock checkouts never charge). */
export function liveSubscription(row: BillingForDelete | null | undefined) {
  const subId = String(row?.stripeSubId || "");
  const addonId = String(row?.stripeAddonSubId || "");
  const base = Boolean(subId) && !subId.startsWith("mock_") && LIVE_BASE.has(String(row?.billingStatus || ""));
  const addon = Boolean(addonId) && !addonId.startsWith("mock_") && String(row?.addonStatus || "") === "active";
  return { live: base || addon, base, addon };
}

/** Plain steps to cancel before deleting. Shown on the delete screen. */
export const CANCEL_STEPS = [
  "Scroll up to Billing on this Company page.",
  "Tap Update card. It opens your secure Stripe billing page.",
  "Tap Cancel plan (and cancel the AI answering add-on if you have it).",
  "Come back here and delete the shop.",
];

/** Everything a shop delete removes — the words on the screen. */
export const SHOP_DELETE_LIST = [
  "Jobs, clients, estimates, invoices, and payment records",
  "Crew profiles, hours, schedules, pay periods, and every crew login",
  "Job photos, receipts, and your logo",
  "Alerts, notes, change orders, price memory, and the activity log",
  "Your company settings, PIN, and sign-in on every phone",
];

/** What a shop delete keeps (and why) — honest about what is not erased. */
export const SHOP_DELETE_KEEPS = [
  "One-way scrambled trial checks (no names, phones, or cards) so a free trial can't be claimed twice.",
  "If a paid plan is still on: the Stripe customer and plan ids only, so the plan can still be cancelled.",
  "Payment records Stripe must keep under the law. Stripe holds those, not Job Command.",
];

export const CREW_DELETE_LIST = [
  "Your sign-in (PIN) and your invite link",
  "Your last shared location",
  "Your profile photo",
];

export const CREW_DELETE_KEEPS = [
  "Your hours and pay records stay with the shop, because employers must keep payroll records and pay final wages.",
  "Ask the office if you also want your name and phone number taken off the crew list.",
];

/**
 * Delete order for a shop wipe: children before parents, so SQLite foreign keys never block a step.
 * TrialClaim is intentionally absent (hashed anti-abuse record, see SHOP_DELETE_KEEPS).
 */
export const SHOP_WIPE_ORDER = [
  "crewPing",
  "pushDevice",
  "alert",
  "callCard",
  "answeringSlotLock",
  "answeringUsage",
  "answeringSettings",
  "auditLog",
  "pinReset",
  "account",
  "payAdjustment",
  "payPeriod",
  "timeEntry",
  "jobCost",
  "jobPhoto",
  "receipt",
  "docLine",
  "deliveryEvent",
  "invoice",
  "estimate",
  "job",
  "customer",
  "employee",
  "boss",
  "serviceCode",
  "priceMemory",
  "appSettings",
] as const;

/** Prisma model names that are kept on purpose. Anything else a future schema adds must join the list. */
export const SHOP_WIPE_KEEPS = ["trialClaim", "loginThrottle"] as const;

/** A note left after a shop delete: billing ids only, so a forgotten paid plan can still be cancelled. */
export function billingNoteAfterDelete(row: BillingForDelete | null | undefined, at: Date) {
  const live = liveSubscription(row);
  if (!live.live) return null;
  const ids = [
    row?.stripeCustomerId ? `customer ${row.stripeCustomerId}` : "",
    live.base ? `plan ${row?.stripeSubId}` : "",
    live.addon ? `add-on ${row?.stripeAddonSubId}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  return {
    actor: "Account deletion",
    action: "Shop deleted with a paid plan still on — cancel it in Stripe",
    field: "billing",
    newValue: `${at.toISOString()} · ${ids}${STRIPE_CANCEL_ON_DELETE ? "" : " · auto-cancel not wired (STRIPE_CANCEL_ON_DELETE=false)"}`,
  };
}

/** Upload URLs this app writes (/uploads/...) → paths under the uploads folder. Never escapes it. */
export function uploadRelPath(url: string | null | undefined) {
  const raw = String(url || "").split("?")[0];
  if (!raw.startsWith("/uploads/")) return null;
  const rel = raw.slice("/uploads/".length);
  if (!rel || rel.split("/").some((part) => part === ".." || part === "" || part === ".")) return null;
  return rel;
}
