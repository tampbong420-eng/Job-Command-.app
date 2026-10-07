import { currentShopId } from "@/lib/shop-context";
import { randomBytes, randomUUID } from "node:crypto";
import { can } from "@/lib/access";
import { declineCopy, isSha256Hex, mockCardOutcome, brandLabel } from "@/lib/card-check";
import { ensureCheckCustomer, placeHold, readHoldAfterAction, releaseHold } from "@/lib/card-check-stripe";
import { prisma } from "@/lib/prisma";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { getLiveSession } from "@/lib/live-session";
import { stripeConfigured } from "@/lib/stripe-rest";
import { blockedCopy, guardLabel } from "@/lib/trial-guard";
import { cardHashFor, checkTrialGuard, signupClaims } from "@/lib/trial-guard-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * $1 card check before the 30-day trial (Option A: hold, then release right away).
 *   POST { attemptId, mock: { notConnected: true } }             no Stripe keys: no card check at all (go-public B4)
 *   POST { attemptId, mock: { last4, brand, panHash } }          old dev mock (kept for older clients; no money moves)
 *   POST { attemptId, paymentMethodId }                          Stripe: card element / Apple Pay / Google Pay
 *   POST { attemptId, paymentIntentId }                          Stripe: finish after 3-D Secure
 * plus { phone, email, businessName, businessAddress, deviceId } for the one-trial-per-business guard.
 * Never receives a card number. Card-testing guard: per-IP and per-shop limits, one check at a time.
 */
const limits = createRateLimiter();
const inflight = new Set<string>();

type Body = {
  attemptId?: string;
  mock?: { last4?: string; brand?: string; panHash?: string; notConnected?: boolean };
  paymentMethodId?: string;
  paymentIntentId?: string;
  phone?: string;
  email?: string;
  name?: string;
  businessName?: string;
  businessAddress?: string;
  deviceId?: string;
};

const text = (value: unknown, max = 200) => (typeof value === "string" ? value.trim().slice(0, max) : "");

async function setupOpen() {
  const session = await getLiveSession();
  if (can(session, "admin")) return true;
  const admin = await prisma.account.findFirst({ where: { role: "ADMIN" } });
  if (!admin) return true;
  const row = await prisma.appSettings.findUnique({ where: { id: "default" } });
  return !(row?.setupComplete && row.businessName);
}

function declined(code: string, declineCode = "") {
  return Response.json({ ok: false, declined: declineCopy(code, declineCode) }, { status: 402 });
}

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  const perIp = limits.consume(`ip:${ip}`, 6, 15 * 60_000);
  const perShop = limits.consume("shop:default", 20, 60 * 60_000);
  if (!perIp.ok || !perShop.ok) {
    return Response.json({ ok: false, declined: declineCopy("rate_limited") }, { status: 429, headers: { "Retry-After": "900" } });
  }
  if (!(await setupOpen())) return Response.json({ error: "Sign in as the owner first." }, { status: 403 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }
  const attemptId = /^[A-Za-z0-9-]{8,64}$/.test(body.attemptId || "") ? (body.attemptId as string) : randomUUID();

  const inflightKey = await currentShopId(); // one card check at a time per shop (multi-shop B2)
  if (inflight.has(inflightKey)) return Response.json({ ok: false, busy: true, error: "Still checking your card…" }, { status: 409 });
  inflight.add(inflightKey);
  try {
    const row = await prisma.appSettings.findUnique({ where: { id: "default" } });
    let customerId = row?.stripeCustomerId || "";
    let card: { pm: string; fingerprint: string; brand: string; last4: string; wallet: string };

    const skipped = !stripeConfigured() && body.mock?.notConnected === true;
    if (skipped) {
      // Card check isn't connected: record that honestly. No card, no hold, no fingerprint.
      if (!customerId.startsWith("mock_")) customerId = "";
      card = { pm: "", fingerprint: "", brand: "", last4: "", wallet: "" };
    } else if (!stripeConfigured()) {
      const last4 = text(body.mock?.last4, 4);
      const panHash = text(body.mock?.panHash, 64);
      if (!/^\d{4}$/.test(last4) || !isSha256Hex(panHash)) return Response.json({ error: "Bad card details." }, { status: 400 });
      const outcome = mockCardOutcome(last4);
      if (!outcome.ok) return declined(outcome.code);
      if (!customerId.startsWith("mock_")) customerId = `mock_cus_${Date.now()}`;
      card = { pm: `mock_pm_${last4}`, fingerprint: panHash, brand: text(body.mock?.brand, 20) || "card", last4, wallet: "" };
    } else {
      const customer = await ensureCheckCustomer({ existing: customerId, email: text(body.email), name: text(body.name), attemptId });
      if (!customer.ok || !customer.id) return declined(customer.ok ? "processing_error" : customer.error.code || "processing_error");
      customerId = customer.id;
      const pmId = text(body.paymentMethodId, 80);
      const piId = text(body.paymentIntentId, 80);
      const hold = piId.startsWith("pi_")
        ? await readHoldAfterAction(piId, customerId)
        : pmId.startsWith("pm_")
          ? await placeHold({ customerId, paymentMethodId: pmId, attemptId })
          : null;
      if (!hold) return Response.json({ error: "Bad card details." }, { status: 400 });
      if (hold.kind === "declined") return declined(hold.code, hold.declineCode);
      if (hold.kind === "action") {
        // Save the customer now so the 3-D Secure round trip comes back to the same one.
        await saveCustomer(customerId);
        return Response.json({ ok: false, action: { clientSecret: hold.clientSecret, paymentIntentId: hold.paymentIntentId } });
      }
      const released = await releaseHold({ paymentIntentId: hold.paymentIntentId, customerId, attemptId });
      if (!released.ok) return declined(released.code);
      card = {
        pm: released.card.paymentMethodId,
        fingerprint: released.card.fingerprint,
        brand: released.card.brand,
        last4: released.card.last4,
        wallet: released.card.wallet,
      };
    }

    const cardHash = cardHashFor(card.fingerprint);
    const claims = signupClaims({
      cardHash,
      deviceId: text(body.deviceId, 120),
      phone: text(body.phone, 40),
      email: text(body.email, 200),
      businessName: text(body.businessName, 120),
      businessAddress: text(body.businessAddress, 240),
    });
    const decision = await checkTrialGuard(claims, { customerId });
    const token = randomBytes(24).toString("hex");
    const now = new Date();
    const data = {
      stripeCustomerId: customerId,
      cardBrand: card.brand,
      cardLast4: card.last4,
      cardCheckAt: now,
      cardCheckToken: token,
      cardCheckPm: card.pm,
      cardCheckFingerprint: cardHash,
      trialGuard: guardLabel(decision),
    };
    await prisma.appSettings.upsert({ where: { id: "default" }, create: { id: "default", periodAnchor: now, ...data }, update: data });
    await prisma.auditLog
      .create({
        data: {
          actor: "Signup",
          action: skipped
            ? decision.allowed
              ? "Card check skipped (not connected yet)"
              : "Card check skipped (not connected yet), free trial blocked"
            : decision.allowed
              ? "Card check passed ($1 hold released)"
              : "Card check passed, free trial blocked",
          field: "billing",
          newValue: skipped ? `No card · ${guardLabel(decision)}` : `${brandLabel(card.brand)} •••• ${card.last4} · ${guardLabel(decision)}`,
        },
      })
      .catch(() => undefined);
    const base = { token, brand: skipped ? "" : brandLabel(card.brand), last4: card.last4, wallet: card.wallet, notConnected: skipped || undefined };
    if (!decision.allowed) return Response.json({ ok: false, blocked: { reason: decision.reason, ...blockedCopy(decision.reason) }, ...base });
    return Response.json({ ok: true, ...base });
  } finally {
    inflight.delete(inflightKey);
  }
}

async function saveCustomer(customerId: string) {
  const now = new Date();
  await prisma.appSettings.upsert({
    where: { id: "default" },
    create: { id: "default", periodAnchor: now, stripeCustomerId: customerId },
    update: { stripeCustomerId: customerId },
  });
}
