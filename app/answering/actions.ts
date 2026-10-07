"use server";

import { revalidatePath } from "next/cache";
import { getLiveSession } from "@/lib/live-session";
import { can } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SHOP_ID, parsePhoneVoice } from "@/lib/answering/config";
import { saveAnsweringSettings } from "@/lib/answering/store";
import { connectRetell, pushVoiceToRetell, type ConnectResult } from "@/lib/answering/connect";

/** Office only. Crew phones and signed-out phones get nothing. Multi-shop: the shop comes from the session later. */
async function officeShop() {
  const session = await getLiveSession();
  if (!session || !can(session, "admin")) return null;
  return DEFAULT_SHOP_ID;
}

export type SaveResult = { ok: boolean; message: string };

export async function saveAnsweringAction(input: {
  enabled?: boolean;
  voice?: string;
  estimatorId?: string;
  estimateMinutes?: number;
  bufferMinutes?: number;
  retellNumber?: string;
}): Promise<SaveResult> {
  const shopId = await officeShop();
  if (!shopId) return { ok: false, message: "Office only." };
  const patch: Parameters<typeof saveAnsweringSettings>[1] = {};
  if (typeof input.enabled === "boolean") patch.enabled = input.enabled;
  if (input.voice !== undefined) patch.voice = parsePhoneVoice(input.voice);
  if (typeof input.estimatorId === "string") {
    const person = input.estimatorId ? await prisma.employee.findUnique({ where: { id: input.estimatorId }, select: { id: true } }) : null;
    patch.estimatorId = person?.id || "";
  }
  if (typeof input.estimateMinutes === "number" && Number.isFinite(input.estimateMinutes)) patch.estimateMinutes = input.estimateMinutes;
  if (typeof input.bufferMinutes === "number" && Number.isFinite(input.bufferMinutes)) patch.bufferMinutes = input.bufferMinutes;
  if (typeof input.retellNumber === "string") patch.retellNumber = input.retellNumber;
  await saveAnsweringSettings(shopId, patch);
  let message = "Saved.";
  if (patch.voice !== undefined) message = (await pushVoiceToRetell(shopId)).message;
  revalidatePath("/answering");
  return { ok: true, message };
}

export async function connectRetellAction(): Promise<ConnectResult> {
  const shopId = await officeShop();
  if (!shopId) return { ok: false, message: "Office only.", steps: [] };
  const result = await connectRetell(shopId);
  revalidatePath("/answering");
  return result;
}

export async function markCallHandledAction(id: string, handled: boolean): Promise<SaveResult> {
  const shopId = await officeShop();
  if (!shopId) return { ok: false, message: "Office only." };
  const card = await prisma.callCard.findUnique({ where: { id: String(id || "") }, select: { id: true, shopId: true } });
  if (!card || card.shopId !== shopId) return { ok: false, message: "Call not found." };
  await prisma.callCard.update({ where: { id: card.id }, data: { reviewedAt: handled ? new Date() : null } });
  revalidatePath(`/calls/${card.id}`);
  revalidatePath("/calls");
  return { ok: true, message: handled ? "Marked handled." : "Back on the list." };
}
