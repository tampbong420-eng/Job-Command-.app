"use server";

import { currentShopId } from "@/lib/shop-context";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getLiveSession } from "@/lib/live-session";
import { hit } from "@/lib/rate-limit";
import { changePinFor, pinSafetyFor, type PinChangeResult } from "@/lib/pin-change";
import { can } from "@/lib/access";
import { crewLoginsFor, resetCrewPinFor, saveRecoveryEmailsFor } from "@/lib/pin-recovery";
import { emailConnected } from "@/lib/delivery";

async function slowDown() {
  const result = hit("/", "POST", headers(), true);
  if (!result.ok) throw new Error("Too many requests. Wait a moment.");
}

/** Office › Change PIN (and crew › My account). Current PIN, then the new PIN twice. Stored hashed. */
export async function changeMyPin(input: { current: string; next: string; again: string }): Promise<PinChangeResult> {
  await slowDown();
  const session = await getLiveSession();
  if (!session) return { ok: false, error: "Sign in again." };
  return changePinFor(prisma, { accountId: session.accountId, shopId: await currentShopId(), ...input });
}

/** "Please change your PIN" banner: is my PIN still the end of a phone number? (office also gets a crew count) */
export async function myPinSafety() {
  const session = await getLiveSession();
  if (!session) return { mine: "ok" as const, crewOnPhonePin: 0 };
  return pinSafetyFor(prisma, { accountId: session.accountId, role: session.role, shopId: await currentShopId() });
}

async function officeOnly() {
  const session = await getLiveSession();
  return can(session, "admin") ? session : null;
}

/** Office › PIN recovery emails (owner email + backup email for "Forgot PIN?"). Office only. */
export async function getRecoveryEmails() {
  if (!(await officeOnly())) return null;
  const row = await prisma.appSettings.findUnique({ where: { id: "default" } });
  return { ownerEmail: row?.ownerEmail || "", recoveryEmail: row?.recoveryEmail || "", emailConnected: emailConnected() };
}

export async function saveRecoveryEmails(input: { ownerEmail: string; recoveryEmail: string }) {
  await slowDown();
  const session = await officeOnly();
  if (!session) return { ok: false as const, error: "Office only." };
  return saveRecoveryEmailsFor(prisma, { shopId: await currentShopId(), actor: session.name || "Office", ...input });
}

/** Office › Reset a crew PIN: the list of crew logins (names only). Office only. */
export async function listCrewLogins() {
  if (!(await officeOnly())) return [];
  return crewLoginsFor(prisma);
}

export async function resetCrewPin(input: { accountId: string; next: string; again: string }) {
  await slowDown();
  const session = await officeOnly();
  if (!session) return { ok: false as const, error: "Office only." };
  return resetCrewPinFor(prisma, { shopId: await currentShopId(), actor: session.name || "Office", ...input });
}
