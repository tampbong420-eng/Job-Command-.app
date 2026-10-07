import "server-only";

/**
 * Stripe side of the $1 card check: Option A from the mockup notes (hold, then release).
 * Own fetch (not stripeRequest) so we get Stripe's error code/decline_code and can send an
 * Idempotency-Key on every POST. Test mode only in this repo; there are no live keys.
 */
import { CARD_CHECK_CENTS } from "@/lib/card-check";
import { formBody, stripeSecret } from "@/lib/stripe-rest";

type StripeError = { code?: string; decline_code?: string; message?: string; payment_intent?: { id?: string } };
export type StripeResult = { ok: true; body: Record<string, unknown> } | { ok: false; status: number; error: StripeError };

export async function stripeCall(path: string, fields?: Record<string, string>, idempotencyKey?: string, method?: "GET" | "POST" | "DELETE"): Promise<StripeResult> {
  const secret = stripeSecret();
  if (!secret) return { ok: false, status: 503, error: { code: "not_configured", message: "Stripe is not configured." } };
  const verb = method || (fields ? "POST" : "GET");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (idempotencyKey && verb !== "GET") headers["Idempotency-Key"] = idempotencyKey;
  try {
    const response = await fetch(`https://api.stripe.com/v1/${path.replace(/^\//, "")}`, {
      method: verb,
      headers,
      body: verb === "GET" || !fields ? undefined : formBody(fields),
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown> & { error?: StripeError };
    if (!response.ok) return { ok: false, status: response.status, error: body.error || {} };
    return { ok: true, body };
  } catch (error) {
    return { ok: false, status: 502, error: { code: "processing_error", message: error instanceof Error ? error.message : "Stripe timed out." } };
  }
}

const str = (value: unknown) => (typeof value === "string" ? value : "");

export async function ensureCheckCustomer(input: { existing?: string; email?: string; name?: string; attemptId: string }) {
  const existing = (input.existing || "").trim();
  if (existing && existing.startsWith("cus_")) return { ok: true as const, id: existing };
  const created = await stripeCall(
    "customers",
    { email: input.email || "", name: input.name || "", "metadata[app]": "job-command", "metadata[source]": "signup-card-check" },
    `jc-cardcheck-cus-${input.attemptId}`
  );
  if (!created.ok) return { ok: false as const, error: created.error };
  return { ok: true as const, id: str(created.body.id) };
}

export type HoldOutcome =
  | { kind: "held"; paymentIntentId: string }
  | { kind: "action"; paymentIntentId: string; clientSecret: string }
  | { kind: "declined"; code: string; declineCode: string };

function readHold(body: Record<string, unknown>): HoldOutcome {
  const id = str(body.id);
  const status = str(body.status);
  if (status === "requires_capture") return { kind: "held", paymentIntentId: id };
  if (status === "requires_action") return { kind: "action", paymentIntentId: id, clientSecret: str(body.client_secret) };
  const last = (body.last_payment_error || {}) as StripeError;
  return { kind: "declined", code: last.code || "card_declined", declineCode: last.decline_code || "" };
}

/** $1 authorization, manual capture (never captured), card saved for the subscription. */
export async function placeHold(input: { customerId: string; paymentMethodId: string; attemptId: string }): Promise<HoldOutcome> {
  const result = await stripeCall(
    "payment_intents",
    {
      amount: String(CARD_CHECK_CENTS),
      currency: "usd",
      customer: input.customerId,
      payment_method: input.paymentMethodId,
      "payment_method_types[]": "card",
      capture_method: "manual",
      setup_future_usage: "off_session",
      confirm: "true",
      description: "Job Command $1 card check (released right away)",
      statement_descriptor_suffix: "CARD CHECK",
      "metadata[kind]": "card_check",
    },
    `jc-cardcheck-pi-${input.attemptId}`
  );
  if (!result.ok) return { kind: "declined", code: result.error.code || "card_declined", declineCode: result.error.decline_code || "" };
  return readHold(result.body);
}

/** After 3-D Secure on the phone: the PI must now be held (requires_capture) for this customer. */
export async function readHoldAfterAction(paymentIntentId: string, customerId: string): Promise<HoldOutcome> {
  const result = await stripeCall(`payment_intents/${encodeURIComponent(paymentIntentId)}`);
  if (!result.ok) return { kind: "declined", code: result.error.code || "processing_error", declineCode: "" };
  if (str(result.body.customer) !== customerId) return { kind: "declined", code: "processing_error", declineCode: "" };
  const hold = readHold(result.body);
  return hold.kind === "action" ? { kind: "declined", code: "authentication_required", declineCode: "" } : hold;
}

export type HeldCard = { paymentMethodId: string; fingerprint: string; brand: string; last4: string; wallet: string; funding: string };

/** Release the $1 right away, then make the card the customer's default for the trial subscription. */
export async function releaseHold(input: { paymentIntentId: string; customerId: string; attemptId: string }): Promise<{ ok: true; card: HeldCard } | { ok: false; code: string }> {
  const intent = await stripeCall(`payment_intents/${encodeURIComponent(input.paymentIntentId)}?expand[]=payment_method`);
  if (!intent.ok) return { ok: false, code: intent.error.code || "processing_error" };
  const cancel = await stripeCall(
    `payment_intents/${encodeURIComponent(input.paymentIntentId)}/cancel`,
    { cancellation_reason: "requested_by_customer" },
    `jc-cardcheck-cancel-${input.attemptId}`
  );
  if (!cancel.ok && str(cancel.error.code) !== "payment_intent_unexpected_state") return { ok: false, code: cancel.error.code || "processing_error" };
  const pm = (intent.body.payment_method || {}) as Record<string, unknown>;
  const pmId = typeof intent.body.payment_method === "string" ? intent.body.payment_method : str(pm.id);
  const card = (pm.card || {}) as Record<string, unknown>;
  if (str(pm.customer) !== input.customerId) {
    const attach = await stripeCall(`payment_methods/${encodeURIComponent(pmId)}/attach`, { customer: input.customerId }, `jc-cardcheck-attach-${input.attemptId}`);
    if (!attach.ok) return { ok: false, code: attach.error.code || "processing_error" };
  }
  const setDefault = await stripeCall(
    `customers/${encodeURIComponent(input.customerId)}`,
    { "invoice_settings[default_payment_method]": pmId },
    `jc-cardcheck-default-${input.attemptId}`
  );
  if (!setDefault.ok) return { ok: false, code: setDefault.error.code || "processing_error" };
  const wallet = (card.wallet || {}) as Record<string, unknown>;
  return {
    ok: true,
    card: {
      paymentMethodId: pmId,
      fingerprint: str(card.fingerprint),
      brand: str(card.brand),
      last4: str(card.last4),
      wallet: str(wallet.type),
      funding: str(card.funding),
    },
  };
}

/** Has any customer on this Stripe account already started a trial with this card? (metadata search) */
export async function stripeCardTrialSeen(cardHash: string, exceptCustomer = "") {
  if (!/^[a-f0-9]{64}$/.test(cardHash)) return false;
  const query = encodeURIComponent(`metadata['trial_card_fp']:'${cardHash}'`);
  const result = await stripeCall(`customers/search?query=${query}&limit=5`);
  if (!result.ok) return false;
  const rows = Array.isArray(result.body.data) ? (result.body.data as Array<Record<string, unknown>>) : [];
  return rows.some((row) => str(row.id) && str(row.id) !== exceptCustomer);
}

export async function markStripeTrialCard(customerId: string, cardHash: string) {
  if (!customerId.startsWith("cus_")) return;
  await stripeCall(`customers/${encodeURIComponent(customerId)}`, { "metadata[trial_card_fp]": cardHash }, `jc-trial-fp-${customerId}`);
}

export async function cancelStripeSubscription(subscriptionId: string) {
  if (!subscriptionId.startsWith("sub_")) return true;
  const result = await stripeCall(`subscriptions/${encodeURIComponent(subscriptionId)}`, undefined, undefined, "DELETE");
  return result.ok;
}
