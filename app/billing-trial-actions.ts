"use server";

/** One-tap cancel from the trial-ending email/banner. Admin only. Nothing is charged. */
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { can } from "@/lib/access";
import { cancelStripeSubscription } from "@/lib/card-check-stripe";
import { prisma } from "@/lib/prisma";
import { hit } from "@/lib/rate-limit";
import { getLiveSession } from "@/lib/live-session";

export async function cancelTrial() {
  const limited = hit("/", "POST", headers(), true);
  if (!limited.ok) throw new Error("Too many requests. Wait a moment.");
  const session = await getLiveSession();
  if (!can(session, "admin")) return { ok: false as const, error: "Only the owner can cancel." };
  const row = await prisma.appSettings.findUnique({ where: { id: "default" } });
  if (!row) return { ok: false as const, error: "No plan to cancel." };
  if (row.billingStatus !== "trial") return { ok: false as const, error: "The trial already ended. Use Office › Billing." };
  if (row.stripeSubId.startsWith("sub_") && !(await cancelStripeSubscription(row.stripeSubId))) {
    return { ok: false as const, error: "Stripe didn’t answer. Try again in a minute." };
  }
  const now = new Date();
  await prisma.appSettings.update({
    where: { id: "default" },
    data: { billingStatus: "canceled", trialEndsAt: now, stripeSubId: "", trialReminderSentAt: row.trialReminderSentAt || now },
  });
  await prisma.auditLog
    .create({ data: { actor: session?.name || "Owner", action: "Canceled during free trial (no charge)", field: "billing", newValue: "canceled" } })
    .catch(() => undefined);
  revalidatePath("/");
  return { ok: true as const };
}
