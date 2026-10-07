/**
 * Client pay page (/p/<token>) rules. Pure so they can be tested without a DB.
 *
 * Hard rule (audit bug 4): the client page never marks an invoice PAID.
 * PAID comes only from a verified Stripe webhook (real money) or the owner
 * recording cash / check on the Invoice step.
 */

export type ClientPayView =
  /** The invoice row says PAID (webhook or owner-recorded). */
  | "paid"
  /** Stripe sent the client back with ?paid=1 but no webhook has landed yet. Never claims PAID. */
  | "processing"
  /** Real card checkout is possible: Stripe key + the shop's own payout account. */
  | "card"
  /** No real card path: tell the client to contact the shop. */
  | "not-set-up";

export type CardReadiness = {
  /** STRIPE_SECRET_KEY is set on the server. */
  stripeKey: boolean;
  /** The shop's linked Stripe Connect account id (settings), if any. */
  connectAccountId?: string | null;
  /** "unlinked" | "pending" | "complete" from settings.billing. */
  connectStatus?: string | null;
  /** Platform-wide Connect fallback from env (STRIPE_CONNECT_ACCOUNT_ID). */
  envConnectAccountId?: string | null;
  /** The shop's "Credit / debit cards" payment preference. */
  acceptCard?: boolean;
};

/**
 * Card payments are only "ready" when money would land in the shop's own account.
 * Without a Connect destination a checkout would charge into the platform account,
 * so that counts as not set up.
 */
export function cardPaymentsReady(input: CardReadiness): boolean {
  if (!input.stripeKey) return false;
  if (input.acceptCard === false) return false;
  const linked = (input.connectAccountId || "").trim();
  if (linked) return input.connectStatus === "complete";
  return Boolean((input.envConnectAccountId || "").trim());
}

export function clientPayView(input: {
  status: string;
  /** `?paid=1` on the URL (Stripe success_url). Untrusted: anyone can type it. */
  returnedFromCheckout: boolean;
  cardReady: boolean;
}): ClientPayView {
  if (input.status === "PAID") return "paid";
  if (input.returnedFromCheckout && input.cardReady) return "processing";
  return input.cardReady ? "card" : "not-set-up";
}

/** Digits-only tel: link, or "" when there is no usable number. */
export function telHref(phone: string | null | undefined) {
  const digits = String(phone || "").replace(/[^\d+]/g, "");
  return digits.replace(/\D/g, "").length >= 7 ? `tel:${digits}` : "";
}

/** The shop phone a client should call: the company line, then the owner's phone. */
export function shopContactPhone(settings: { companyPhone?: string | null; ownerPhone?: string | null }) {
  for (const value of [settings.companyPhone, settings.ownerPhone]) {
    if (telHref(value)) return String(value).trim();
  }
  return "";
}

export function shopContactEmail(settings: { businessEmail?: string | null; ownerEmail?: string | null }) {
  for (const value of [settings.businessEmail, settings.ownerEmail]) {
    const v = String(value || "").trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return v;
  }
  return "";
}
