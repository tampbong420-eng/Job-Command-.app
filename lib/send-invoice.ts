import "server-only";

import { prisma } from "@/lib/prisma";
import { sendEmail, sendSms, type DeliveryResult } from "@/lib/delivery";
import { pickChannels } from "@/lib/delivery-log";
import { invoiceMail } from "@/lib/estimate-copy";
import { BRAND, documentTotals, type LineKind } from "@/lib/documents";
import { money } from "@/lib/format";
import { ensureInvoiceToken } from "@/lib/invoice-link";
import { createInvoiceCheckout, stripeConnectAccount } from "@/lib/invoice-pay";
import { invoicePayUrl, splitInvoicePayment } from "@/lib/invoice-split";
import { loadPayrollSettings } from "@/lib/queries";
import { shopPlace } from "@/lib/shop-brand";
import { cardPaymentsReady } from "@/lib/client-pay";
import { stripeConfigured } from "@/lib/stripe-rest";

export type SendInvoiceResult = {
  invoiceId: string;
  url: string;
  mock: boolean;
  applicationFee: number;
  email: DeliveryResult | null;
  sms: DeliveryResult | null;
};

export async function deliverInvoice(input: {
  invoiceId: string;
  actor: string;
  channels?: Array<"email" | "sms"> | null;
  origin: string;
}): Promise<SendInvoiceResult> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: input.invoiceId },
    include: { job: true, customer: true, lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!invoice) throw new Error("Invoice not found.");
  if (invoice.status === "PAID") {
    const token = invoice.publicToken || (await ensureInvoiceToken(invoice.id));
    return {
      invoiceId: invoice.id,
      url: invoice.payUrl || invoicePayUrl(input.origin, token),
      mock: invoice.stripeSessionId.startsWith("mock_"),
      applicationFee: invoice.applicationFee,
      email: null,
      sms: null,
    };
  }

  const settings = await loadPayrollSettings();
  const company = settings.businessName.trim() || BRAND.tradeName;
  const token = await ensureInvoiceToken(invoice.id);
  const totals = documentTotals(
    invoice.lines.map((line) => ({
      ...line,
      kind: (line.kind === "LABOR" || line.kind === "MATERIAL" ? line.kind : "OTHER") as LineKind,
    })),
    invoice.taxRate
  );
  const checkout = await createInvoiceCheckout({
    invoiceId: invoice.id,
    number: invoice.number,
    jobName: invoice.job?.name || invoice.customer.name,
    amount: totals.total || invoice.amount,
    token,
    origin: input.origin,
    customerEmail: invoice.customer.email || undefined,
    connectAccountId: settings.billing.connectAccountId,
  });
  const pageUrl = invoicePayUrl(input.origin, token);
  const payUrl = checkout.mock ? pageUrl : checkout.url;
  const split = splitInvoicePayment(totals.total || invoice.amount);
  const who = invoice.customer.name;
  const copy = invoiceMail({
    who,
    company,
    jobName: invoice.job?.name || "the job",
    number: invoice.number,
    total: money(totals.total || invoice.amount),
    url: pageUrl,
    fee: money(split.feeDollars),
    place: shopPlace(settings.businessAddress),
    cardReady: !checkout.mock,
  });

  const emailTo = invoice.customer.email.trim();
  const phoneTo = invoice.customer.phone.trim();
  const channels = pickChannels({ email: emailTo, phone: phoneTo }, input.channels);
  if (!channels.length) throw new Error("Add a phone or email on the client to send the pay link.");

  const wantEmail = channels.includes("email");
  const wantSms = channels.includes("sms");
  const statusCallback = `${input.origin.replace(/\/$/, "")}/api/webhooks/twilio`;
  const [email, sms] = await Promise.all([
    wantEmail ? sendEmail({ to: emailTo, subject: copy.subject, text: copy.text, html: copy.html }) : Promise.resolve(null),
    wantSms ? sendSms({ to: phoneTo, body: copy.sms, statusCallback }) : Promise.resolve(null),
  ]);

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      sentAt: invoice.sentAt || new Date(),
      status: invoice.status === "PAID" ? "PAID" : "PENDING",
      payUrl,
      stripeSessionId: checkout.id,
      applicationFee: checkout.applicationFee,
      amount: totals.total || invoice.amount,
    },
  });

  return {
    invoiceId: invoice.id,
    url: pageUrl,
    mock: checkout.mock,
    applicationFee: checkout.applicationFee,
    email,
    sms,
  };
}

export async function markInvoicePaid(input: {
  invoiceId: string;
  actor?: string;
  paymentIntent?: string;
  sessionId?: string;
}) {
  const invoice = await prisma.invoice.findUnique({ where: { id: input.invoiceId } });
  if (!invoice) return null;
  const now = new Date();
  const next = await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      status: "PAID",
      paidAt: invoice.paidAt || now,
      sentAt: invoice.sentAt || now,
      stripePaymentIntent: input.paymentIntent || invoice.stripePaymentIntent,
      stripeSessionId: input.sessionId || invoice.stripeSessionId,
    },
  });
  return next;
}

/** Same readiness rule the client pay page uses (lib/client-pay.ts). */
export function shopCardReady(settings: Awaited<ReturnType<typeof loadPayrollSettings>>) {
  return cardPaymentsReady({
    stripeKey: stripeConfigured(),
    connectAccountId: settings.billing.connectAccountId,
    connectStatus: settings.billing.connectStatus,
    envConnectAccountId: stripeConnectAccount(),
    acceptCard: settings.acceptCard,
  });
}

export type ClientCardStart =
  | { ok: true; url: string }
  | { ok: false; reason: "invalid" | "paid" | "not-set-up"; message: string };

/**
 * Client tapped "Pay by card" on /p/<token>. Opens a fresh Stripe Checkout
 * (stored links expire after 24 hours). NEVER marks the invoice paid: that only
 * happens from the signed Stripe webhook or the owner recording cash / check.
 */
export async function openClientCardCheckout(input: { token: string; origin: string }): Promise<ClientCardStart> {
  const invoice = await prisma.invoice.findUnique({
    where: { publicToken: input.token },
    include: { job: true, customer: true, lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!invoice) return { ok: false, reason: "invalid", message: "This pay link is not valid." };
  if (invoice.status === "PAID") return { ok: false, reason: "paid", message: "This invoice is already paid." };
  const settings = await loadPayrollSettings();
  const company = settings.businessName.trim() || "the shop";
  const notReady: ClientCardStart = {
    ok: false,
    reason: "not-set-up",
    message: `Card payments are not set up yet. Please contact ${company} to pay.`,
  };
  if (!shopCardReady(settings)) return notReady;
  const totals = documentTotals(
    invoice.lines.map((line) => ({
      ...line,
      kind: (line.kind === "LABOR" || line.kind === "MATERIAL" ? line.kind : "OTHER") as LineKind,
    })),
    invoice.taxRate
  );
  const checkout = await createInvoiceCheckout({
    invoiceId: invoice.id,
    number: invoice.number,
    jobName: invoice.job?.name || invoice.customer.name,
    amount: totals.total || invoice.amount,
    token: input.token,
    origin: input.origin,
    customerEmail: invoice.customer.email || undefined,
    connectAccountId: settings.billing.connectAccountId,
  });
  if (checkout.mock || !checkout.url || checkout.url.includes("/p/")) return notReady;
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { payUrl: checkout.url, stripeSessionId: checkout.id, applicationFee: checkout.applicationFee },
  });
  return { ok: true, url: checkout.url };
}
