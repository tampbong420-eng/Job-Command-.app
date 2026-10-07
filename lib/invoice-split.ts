export const PLATFORM_FEE_RATE = 0.01;

export type InvoiceSplit = {
  totalCents: number;
  feeCents: number;
  contractorCents: number;
  feeDollars: number;
  contractorDollars: number;
};

function cents(value: number) {
  return Math.max(0, Math.round((Number(value) || 0) * 100));
}

function dollars(value: number) {
  return Math.round(value) / 100;
}

/** Job Command keeps 1%. The contractor gets the rest via Stripe Connect. */
export function splitInvoicePayment(totalDollars: number): InvoiceSplit {
  const totalCents = cents(totalDollars);
  const feeCents = Math.max(0, Math.round(totalCents * PLATFORM_FEE_RATE));
  const contractorCents = Math.max(0, totalCents - feeCents);
  return {
    totalCents,
    feeCents,
    contractorCents,
    feeDollars: dollars(feeCents),
    contractorDollars: dollars(contractorCents),
  };
}

export function invoicePayUrl(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}/p/${encodeURIComponent(token)}`;
}

export function resolveConnectDestination(linkedAccountId?: string | null, envFallback = "") {
  return (linkedAccountId || "").trim() || envFallback.trim();
}

export function readStripeInvoiceId(event: {
  type?: string;
  data?: { object?: Record<string, unknown> };
}): { invoiceId: string; sessionId: string; paymentIntent: string } | null {
  const object = event.data?.object || {};
  const meta = (object.metadata && typeof object.metadata === "object" ? object.metadata : {}) as Record<
    string,
    unknown
  >;
  const billingKind = typeof meta.kind === "string" ? meta.kind : "";
  if (billingKind === "base" || billingKind === "addon") return null;
  const invoiceId =
    (typeof object.client_reference_id === "string" && object.client_reference_id) ||
    (typeof meta.invoiceId === "string" && meta.invoiceId) ||
    "";
  if (!invoiceId || invoiceId.startsWith("billing:")) return null;
  const kind = event.type || "";
  if (
    kind &&
    !/checkout\.session\.completed|payment_intent\.succeeded|invoice\.paid|charge\.succeeded/.test(kind)
  ) {
    return null;
  }
  const sessionId = typeof object.id === "string" && kind.startsWith("checkout.session") ? object.id : "";
  const paymentIntent =
    typeof object.payment_intent === "string"
      ? object.payment_intent
      : typeof object.id === "string" && kind.startsWith("payment_intent")
        ? object.id
        : "";
  return { invoiceId, sessionId, paymentIntent };
}
