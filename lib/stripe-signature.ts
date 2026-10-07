import { createHmac, timingSafeEqual } from "crypto";

/**
 * Stripe webhook signature check — the same algorithm as stripe.webhooks.constructEvent (Stripe-Signature:
 * "t=<unix>,v1=<hex HMAC-SHA256(secret, `${t}.${rawBody}`)>", any v1 may match during a secret roll,
 * 5-minute replay window). The app talks to Stripe over plain REST (no stripe npm package), so this stays
 * dependency-free; lib/webhook-verify.test.ts checks it against vectors built exactly like Stripe's
 * generateTestHeaderString.
 */
export function stripeSignatureValid(
  rawBody: string,
  header: string,
  secret: string,
  options: { toleranceSec?: number; nowSec?: number } = {}
) {
  if (!secret || !header) return false;
  let timestamp = "";
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, ...rest] = part.trim().split("=");
    const value = rest.join("=");
    if (key === "t") timestamp = value;
    if (key === "v1" && value) signatures.push(value);
  }
  if (!/^\d+$/.test(timestamp) || !signatures.length) return false;
  if (options.toleranceSec) {
    // Replay guard: Stripe's own libraries reject signatures older than 5 minutes.
    const nowSec = options.nowSec ?? Math.floor(Date.now() / 1000);
    const age = Math.abs(nowSec - Number(timestamp));
    if (!Number.isFinite(age) || age > options.toleranceSec) return false;
  }
  const digest = Buffer.from(createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex"), "hex");
  return signatures.some((expected) => {
    try {
      const given = Buffer.from(expected, "hex");
      return given.length === digest.length && timingSafeEqual(given, digest);
    } catch {
      return false;
    }
  });
}

/** constructEvent-style: verify, then parse. Throws on a bad/missing signature or secret. */
export function constructStripeEvent<T = unknown>(rawBody: string, header: string, secret: string, nowSec?: number): T {
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  if (!stripeSignatureValid(rawBody, header, secret, { toleranceSec: 300, nowSec })) throw new Error("invalid Stripe signature");
  return JSON.parse(rawBody) as T;
}
