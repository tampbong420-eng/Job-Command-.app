import { NextResponse } from "next/server";
import { mapTwilioStatus } from "@/lib/delivery-log";
import { applyProviderReceipt } from "@/lib/delivery-store";
import { runWithShop } from "@/lib/shop-context";
import { shopOfProviderId } from "@/lib/shop-of";
import { candidateUrls, twilioRequestValid } from "@/lib/twilio-signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readPayload(rawBody: string, contentType: string) {
  if (contentType.includes("application/json")) {
    let json: { MessageSid?: string; MessageStatus?: string; SmsSid?: string; SmsStatus?: string } = {};
    try {
      json = JSON.parse(rawBody || "{}");
    } catch {
      json = {};
    }
    return { sid: json.MessageSid || json.SmsSid || "", status: json.MessageStatus || json.SmsStatus || "" };
  }
  const form = new URLSearchParams(rawBody);
  return {
    sid: form.get("MessageSid") || form.get("SmsSid") || "",
    status: form.get("MessageStatus") || form.get("SmsStatus") || "",
  };
}

export async function POST(request: Request) {
  // Go-public B4: only genuine Twilio requests (X-Twilio-Signature with TWILIO_AUTH_TOKEN) are read.
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() || "";
  if (!authToken) return NextResponse.json({ error: "twilio not configured" }, { status: 503 });
  const rawBody = await request.text();
  const contentType = request.headers.get("content-type") || "";
  const valid = twilioRequestValid({
    authToken,
    signature: request.headers.get("x-twilio-signature") || "",
    urls: candidateUrls(request.url, process.env.APP_ORIGIN),
    rawBody,
    contentType,
  });
  if (!valid) return NextResponse.json({ error: "invalid signature" }, { status: 403 });
  const payload = readPayload(rawBody, contentType);
  const status = mapTwilioStatus(payload.status);
  if (!status || !payload.sid) return NextResponse.json({ ok: true, applied: 0 });
  // Multi-shop B2: update the receipt in the shop that sent it.
  const shop = await shopOfProviderId(payload.sid);
  const row = shop ? await runWithShop(shop, () => applyProviderReceipt({ provider: "twilio", providerId: payload.sid, status })) : null;
  return NextResponse.json({ ok: true, applied: row ? 1 : 0 });
}
