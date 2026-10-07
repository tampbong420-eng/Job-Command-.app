import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { refreshJobCost } from "@/lib/job-cost";
import { associateJobClient } from "@/lib/client-store";
import { classifyStripeEvent } from "@/lib/billing";
import { applyStripeBillingEvent, applyStripeConnectEvent } from "@/lib/billing-store";
import { readStripeInvoiceId } from "@/lib/invoice-split";
import { markInvoicePaid } from "@/lib/send-invoice";
import { constructStripeEvent } from "@/lib/stripe-signature";
import { runWithShop } from "@/lib/shop-context";
import { shopOfStripeEvent } from "@/lib/shop-of";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function applyPaid(invoiceId: string, sessionId?: string, paymentIntent?: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return false;
  await markInvoicePaid({ invoiceId, sessionId, paymentIntent, actor: "stripe" });
  if (invoice.jobId) {
    const job = await prisma.job.findUnique({ where: { id: invoice.jobId } });
    if (job && job.pipeline < 6 && job.pipeline >= 4) {
      await prisma.job.update({
        where: { id: job.id },
        data: { pipeline: Math.max(job.pipeline, 5) },
      });
    }
    await associateJobClient(invoice.jobId);
    await refreshJobCost(invoice.jobId);
  }
  return true;
}

export async function POST(request: Request) {
  const raw = await request.text();
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || "";
  const signature = request.headers.get("stripe-signature") || "";
  // Go-public B4: fail closed everywhere (local too). An unsigned event could mark invoices paid or billing active.
  if (!secret) return NextResponse.json({ error: "webhook secret not configured" }, { status: 503 });
  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = constructStripeEvent(raw, signature, secret);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }
  const lane = classifyStripeEvent(event);
  const hit = lane === "invoice" ? readStripeInvoiceId(event) : null;
  // Multi-shop B2: apply the event inside the shop it belongs to; never guess between shops.
  const shop = await shopOfStripeEvent(event, hit?.invoiceId);
  if (!shop) return NextResponse.json({ ok: true, applied: 0, billing: 0, connect: 0, lane, shop: "none" });
  return runWithShop(shop, async () => {
    const billing = lane === "billing" ? await applyStripeBillingEvent(event) : 0;
    const connect = lane === "connect" ? await applyStripeConnectEvent(event) : 0;
    const applied = hit ? ((await applyPaid(hit.invoiceId, hit.sessionId, hit.paymentIntent)) ? 1 : 0) : 0;
    return NextResponse.json({ ok: true, applied, billing, connect, lane });
  });
}
