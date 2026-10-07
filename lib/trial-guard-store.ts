import "server-only";

/** DB + Stripe side of the one-trial-per-business guard. Pure rules live in lib/trial-guard.ts. */
import { prisma } from "@/lib/prisma";
import { stripeConfigured } from "@/lib/stripe-rest";
import { cancelStripeSubscription, markStripeTrialCard, stripeCardTrialSeen } from "@/lib/card-check-stripe";
import { claimsFor, decideTrial, guardHash, type GuardClaim, type GuardDecision, type GuardInput, type PriorClaim } from "@/lib/trial-guard";

/** This signup's claims. The card comes in already hashed (cardCheckFingerprint) once the $1 check passed. */
export function signupClaims(input: Omit<GuardInput, "cardFingerprint"> & { cardHash?: string }): GuardClaim[] {
  const claims = claimsFor({ ...input, cardFingerprint: "" });
  if (input.cardHash) claims.unshift({ kind: "CARD", valueHash: input.cardHash });
  return claims;
}

export function cardHashFor(fingerprint: string) {
  return fingerprint ? guardHash("CARD", fingerprint) : "";
}

export async function checkTrialGuard(claims: GuardClaim[], opts: { customerId?: string } = {}): Promise<GuardDecision> {
  const rows = claims.length
    ? await prisma.trialClaim.findMany({
        where: { OR: claims.map((claim) => ({ kind: claim.kind, valueHash: claim.valueHash })) },
        select: { kind: true, valueHash: true, outcome: true },
      })
    : [];
  const prior: PriorClaim[] = rows.map((row) => ({ kind: row.kind as PriorClaim["kind"], valueHash: row.valueHash, outcome: row.outcome }));
  const card = claims.find((claim) => claim.kind === "CARD");
  // Two shops on separate servers still share one Stripe account: the card hash rides on the customer.
  if (card && stripeConfigured() && !prior.some((row) => row.kind === "CARD")) {
    if (await stripeCardTrialSeen(card.valueHash, opts.customerId || "")) prior.push({ ...card, outcome: "trial" });
  }
  return decideTrial(claims, prior);
}

/** Trial granted: remember every signal (unique per kind+hash, so a double submit writes once). */
export async function recordTrialClaims(claims: GuardClaim[], outcome: string, customerId = "") {
  for (const claim of claims) {
    await prisma.trialClaim
      .upsert({
        where: { kind_valueHash: { kind: claim.kind, valueHash: claim.valueHash } },
        create: { kind: claim.kind, valueHash: claim.valueHash, outcome },
        update: {},
      })
      .catch(() => undefined);
  }
  const card = claims.find((claim) => claim.kind === "CARD");
  if (card && customerId && stripeConfigured()) await markStripeTrialCard(customerId, card.valueHash).catch(() => undefined);
}

/**
 * Blocked repeat trial: setup is saved (nothing typed is lost) but no trial. The trial sub that
 * completeOnboarding just made is canceled, the window is closed today, and status is expired so
 * the owner lands on Subscribe ($199/mo, no trial). trialStartedAt stays set so it never re-opens.
 */
export async function endTrialNow(now = new Date()) {
  const row = await prisma.appSettings.findUnique({ where: { id: "default" } });
  if (!row) return;
  if (row.stripeSubId && !row.stripeSubId.startsWith("mock_")) await cancelStripeSubscription(row.stripeSubId).catch(() => false);
  await prisma.appSettings.update({
    where: { id: "default" },
    data: {
      billingStatus: "expired",
      trialStartedAt: row.trialStartedAt || now,
      trialEndsAt: now,
      stripeSubId: "",
      cardCheckToken: "",
    },
  });
}
