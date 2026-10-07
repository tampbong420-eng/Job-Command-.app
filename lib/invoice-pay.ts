import "server-only";

import { invoicePayUrl, resolveConnectDestination, splitInvoicePayment } from "@/lib/invoice-split";
import { stripeRequest, stripeSecret } from "@/lib/stripe-rest";

export {
  invoicePayUrl,
  PLATFORM_FEE_RATE,
  readStripeInvoiceId,
  resolveConnectDestination,
  splitInvoicePayment,
  type InvoiceSplit,
} from "@/lib/invoice-split";

export function stripeConnectAccount() {
  return (process.env.STRIPE_CONNECT_ACCOUNT_ID || process.env.STRIPE_CONNECT_ACCOUNT || "").trim();
}

export type CheckoutSession = {
  id: string;
  url: string;
  mock: boolean;
  applicationFee: number;
};

export async function createInvoiceCheckout(input: {
  invoiceId: string;
  number: string;
  jobName: string;
  amount: number;
  token: string;
  origin: string;
  customerEmail?: string;
  connectAccountId?: string | null;
}): Promise<CheckoutSession> {
  const split = splitInvoicePayment(input.amount);
  const origin = input.origin.replace(/\/$/, "");
  const payPage = invoicePayUrl(origin, input.token);
  const destination = resolveConnectDestination(input.connectAccountId, stripeConnectAccount());
  // No payout account = the charge would land in the platform account, not the shop's.
  // Treat that as "card payments not set up" instead of opening a checkout.
  if (!stripeSecret() || split.totalCents < 50 || !destination) {
    return {
      id: `mock_${input.invoiceId}`,
      url: payPage,
      mock: true,
      applicationFee: split.feeDollars,
    };
  }

  const fields: Record<string, string> = {
    mode: "payment",
    success_url: `${payPage}?paid=1`,
    cancel_url: `${payPage}?canceled=1`,
    client_reference_id: input.invoiceId,
    "metadata[invoiceId]": input.invoiceId,
    "metadata[platformFee]": String(split.feeDollars),
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(split.totalCents),
    "line_items[0][price_data][product_data][name]": `${input.number} · ${input.jobName}`.slice(0, 120),
    "payment_intent_data[metadata][invoiceId]": input.invoiceId,
  };
  if (input.customerEmail) fields.customer_email = input.customerEmail;
  if (destination && split.feeCents > 0) {
    fields["payment_intent_data[application_fee_amount]"] = String(split.feeCents);
    fields["payment_intent_data[transfer_data][destination]"] = destination;
  }

  const payload = await stripeRequest("checkout/sessions", fields);
  const url = typeof payload.url === "string" ? payload.url : "";
  if (!url) throw new Error("Stripe could not open a card link.");
  return {
    id: typeof payload.id === "string" ? payload.id : "",
    url,
    mock: false,
    applicationFee: split.feeDollars,
  };
}
