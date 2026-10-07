/**
 * One free trial per business (pure logic, no DB). Values are normalized, then HMAC-hashed with
 * TRIAL_GUARD_SECRET so the claim table never holds a raw card fingerprint, phone, or email.
 *
 * Rules (Eric, Oct 2 2026): a card fingerprint or device match blocks the trial. One soft match
 * (phone, email, or business name + ZIP) is allowed but flagged; two or more soft matches block.
 */
import { createHmac } from "node:crypto";
import { formatFlatPlanPrice } from "@/lib/billing";

export type GuardKind = "CARD" | "DEVICE" | "PHONE" | "EMAIL" | "BUSINESS";
export const HARD_KINDS: readonly GuardKind[] = ["CARD", "DEVICE"];
export const SOFT_KINDS: readonly GuardKind[] = ["PHONE", "EMAIL", "BUSINESS"];

export type GuardInput = {
  /** Stripe card.fingerprint, or the SHA-256 of the card number in mock mode. */
  cardFingerprint?: string;
  /** Install/device id from the native app (stub until the Capacitor projects exist). */
  deviceId?: string;
  phone?: string;
  email?: string;
  businessName?: string;
  businessAddress?: string;
};

export type GuardClaim = { kind: GuardKind; valueHash: string };
export type PriorClaim = GuardClaim & { outcome?: string };

export type GuardReason = "card" | "device" | "shop";
export type GuardDecision =
  | { allowed: true; flagged: GuardKind[] }
  | { allowed: false; reason: GuardReason; matched: GuardKind[] };

const DEV_SECRET = "job-command-dev-trial-guard";

export function guardSecret(env: Record<string, string | undefined> = process.env) {
  return env.TRIAL_GUARD_SECRET?.trim() || DEV_SECRET;
}

/** US-first E.164: 10 digits → +1…, 11 starting with 1 → +…; anything shorter than 10 is not a signal. */
export function normalizePhone(raw = "") {
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length > 11 && digits.length <= 15) return `+${digits}`;
  return "";
}

/** Lowercase; drop any +tag; Gmail also ignores dots (and googlemail.com is gmail.com). */
export function normalizeEmail(raw = "") {
  const email = String(raw).trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return "";
  let local = email.slice(0, at).split("+")[0];
  let domain = email.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return local ? `${local}@${domain}` : "";
}

const BUSINESS_NOISE = /\b(the|llc|l\.l\.c|inc|incorporated|co|company|corp|corporation|ltd|pllc|lp)\b/g;

/** "Top Gun Painting, LLC" + "… AR 72712" → "top gun painting|72712". No ZIP → no signal. */
export function normalizeBusiness(name = "", address = "") {
  const base = String(name)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(BUSINESS_NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
  const zip = String(address).match(/\b(\d{5})(?:-\d{4})?\b(?!.*\b\d{5}\b)/)?.[1] || "";
  if (!base || !zip) return "";
  return `${base}|${zip}`;
}

export function guardHash(kind: GuardKind, value: string, secret = guardSecret()) {
  return createHmac("sha256", secret).update(`${kind}:${value}`).digest("hex");
}

/** Every signal we can hash for this signup (empty values are skipped). */
export function claimsFor(input: GuardInput, secret = guardSecret()): GuardClaim[] {
  const values: Array<[GuardKind, string]> = [
    ["CARD", String(input.cardFingerprint || "").trim()],
    ["DEVICE", String(input.deviceId || "").trim()],
    ["PHONE", normalizePhone(input.phone)],
    ["EMAIL", normalizeEmail(input.email)],
    ["BUSINESS", normalizeBusiness(input.businessName, input.businessAddress)],
  ];
  return values.filter(([, value]) => value).map(([kind, value]) => ({ kind, valueHash: guardHash(kind, value, secret) }));
}

/**
 * Compare this signup's claims with earlier trial claims. A prior claim marked "override" (Eric
 * cleared it by hand after "Think this is wrong?") never counts.
 */
export function decideTrial(claims: GuardClaim[], prior: PriorClaim[]): GuardDecision {
  const live = prior.filter((row) => row.outcome !== "override");
  const matched = Array.from(
    new Set(
      claims
        .filter((claim) => live.some((row) => row.kind === claim.kind && row.valueHash === claim.valueHash))
        .map((claim) => claim.kind)
    )
  );
  if (matched.includes("CARD")) return { allowed: false, reason: "card", matched };
  if (matched.includes("DEVICE")) return { allowed: false, reason: "device", matched };
  const soft = matched.filter((kind) => SOFT_KINDS.includes(kind));
  if (soft.length >= 2) return { allowed: false, reason: "shop", matched };
  return { allowed: true, flagged: soft };
}

/** Stored in AppSettings.trialGuard: ok | flagged:PHONE | blocked:card. */
export function guardLabel(decision: GuardDecision) {
  if (decision.allowed) return decision.flagged.length ? `flagged:${decision.flagged.join(",")}` : "ok";
  return `blocked:${decision.reason}`;
}

export function guardBlocked(label: string | null | undefined) {
  return String(label || "").startsWith("blocked:");
}

/** Plain-words blocked screen (same price helper as everywhere else). */
export function blockedCopy(reason: GuardReason) {
  const price = formatFlatPlanPrice();
  const title =
    reason === "card"
      ? "This card already used a free trial."
      : reason === "device"
        ? "This phone already started a free trial."
        : "This shop already had a free trial.";
  return { title, line: `You can subscribe now for ${price}.`, subscribe: `Subscribe ${price}` };
}

export function reasonFromLabel(label: string | null | undefined): GuardReason {
  const reason = String(label || "").split(":")[1];
  return reason === "device" || reason === "shop" ? reason : "card";
}
