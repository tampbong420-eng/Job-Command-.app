"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { clearSessionCookie, getSession } from "@/lib/session";
import { hit } from "@/lib/rate-limit";
import { deletePhraseOk, liveSubscription, loginRemoved } from "@/lib/account-delete-core";
import { removeCrewLogin, wipeShop } from "@/lib/account-delete";

async function slowDown() {
  const result = hit("/", "POST", headers(), true);
  if (!result.ok) throw new Error("Too many requests. Wait a moment.");
}

/** What the delete screen needs to know before step two (office only). */
export async function shopDeletePreview() {
  await slowDown();
  const session = await getSession();
  if (session?.role !== "ADMIN") throw new Error("Only the office can delete the shop.");
  const row = await prisma.appSettings.findUnique({ where: { id: "default" } });
  const sub = liveSubscription(row);
  return {
    shop: row?.businessName || "",
    subscriptionLive: sub.live,
    addonLive: sub.addon,
  };
}

/**
 * Office/owner: delete the whole shop. Needs the typed word DELETE, a live office session whose login still
 * exists, and — when a paid plan is still on — the owner's tick that they cancelled it (Stripe is never
 * called from here).
 */
export async function deleteShopAccount(input: { confirm: string; cancelledPlan?: boolean }) {
  await slowDown();
  const session = await getSession();
  if (session?.role !== "ADMIN") throw new Error("Only the office can delete the shop.");
  if (!deletePhraseOk(input.confirm)) throw new Error("Type DELETE to confirm.");
  const account = await prisma.account.findUnique({ where: { id: session.accountId } });
  if (!account || account.role !== "ADMIN") throw new Error("Sign in again, then try.");
  const row = await prisma.appSettings.findUnique({ where: { id: "default" } });
  if (liveSubscription(row).live && !input.cancelledPlan) {
    throw new Error("Cancel your plan in Billing first, then tick the box.");
  }
  const result = await wipeShop(prisma);
  clearSessionCookie();
  revalidatePath("/");
  return { ok: true as const, files: result.files, billingNote: result.billingNote };
}

/** Crew: delete my own login. Hours and pay records stay with the shop. */
export async function deleteMyCrewLogin(input: { confirm: string }) {
  await slowDown();
  const session = await getSession();
  if (session?.role !== "CREW" || !session.employeeId) throw new Error("Sign in on your own phone first.");
  if (!deletePhraseOk(input.confirm)) throw new Error("Type DELETE to confirm.");
  const account = await prisma.account.findUnique({ where: { id: session.accountId } });
  if (!account || loginRemoved(account)) {
    clearSessionCookie();
    return { ok: true as const };
  }
  const result = await removeCrewLogin(prisma, { accountId: session.accountId });
  if (!result.ok) throw new Error("That login is not a crew login.");
  clearSessionCookie();
  revalidatePath("/");
  return { ok: true as const };
}
