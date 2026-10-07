import { NextResponse } from "next/server";
import { mapResendType } from "@/lib/delivery-log";
import { applyProviderReceipt } from "@/lib/delivery-store";
import { runWithShop } from "@/lib/shop-context";
import { shopOfProviderId } from "@/lib/shop-of";
import { svixSignatureValid } from "@/lib/svix-signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ResendEvent = {
  type?: string;
  data?: { email_id?: string; id?: string };
};

export async function POST(request: Request) {
  // Only genuine Resend (Svix-signed) events can change a delivery status.
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim() || "";
  if (!secret) return NextResponse.json({ error: "webhook secret not configured" }, { status: 503 });
  const rawBody = await request.text();
  const valid = svixSignatureValid({
    secret,
    id: request.headers.get("svix-id") || "",
    timestamp: request.headers.get("svix-timestamp") || "",
    signature: request.headers.get("svix-signature") || "",
    rawBody,
  });
  if (!valid) return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  let body: ResendEvent | ResendEvent[] | null = null;
  try {
    body = JSON.parse(rawBody) as ResendEvent | ResendEvent[];
  } catch {
    body = null;
  }
  const events = Array.isArray(body) ? body : body ? [body] : [];
  let applied = 0;
  for (const event of events) {
    const status = mapResendType(event.type || "");
    const providerId = event.data?.email_id || event.data?.id || "";
    if (!status || !providerId) continue;
    // Multi-shop B2: update the receipt in the shop that sent it.
    const shop = await shopOfProviderId(providerId);
    const row = shop ? await runWithShop(shop, () => applyProviderReceipt({ provider: "resend", providerId, status })) : null;
    if (row) applied += 1;
  }
  return NextResponse.json({ ok: true, applied });
}
