import "server-only";

import { prisma } from "@/lib/prisma";
import { canUseAnswering } from "@/lib/billing";
import { shopPlaceFor } from "@/lib/shop-place";
import { DEFAULT_SHOP_TIME_ZONE } from "@/lib/dates";
import { tradeProfile } from "@/lib/trade-profiles";
import { formatTimeLabel } from "@/lib/schedule";
import { raiseAlert } from "@/lib/alerts";
import { DEFAULT_SHOP_ID, parsePhoneVoice, type AnswerMode, type PhoneVoice } from "@/lib/answering/config";
import { capState, usageMonth } from "@/lib/answering/metering";
import { parseWorkDays, spokenDay, type ShopHours } from "@/lib/answering/slots";
import { prettyUs, toE164 } from "@/lib/answering/forwarding";
import type { ShopForAgent } from "@/lib/answering/agent-config";
import type { CallEvent, TranscriptTurn } from "@/lib/answering/events";

/* ------------------------------------------------------------------ settings + shop ------------------------------------------------------------------ */

export async function getAnsweringSettings(shopId = DEFAULT_SHOP_ID) {
  return prisma.answeringSettings.upsert({ where: { shopId }, create: { shopId }, update: {} });
}

export type AnsweringSettingsPatch = Partial<{
  enabled: boolean;
  voice: PhoneVoice;
  estimatorId: string;
  estimateMinutes: number;
  bufferMinutes: number;
  retellNumber: string;
  retellAgentId: string;
  retellLlmId: string;
  connectedAt: Date | null;
}>;

export async function saveAnsweringSettings(shopId: string, patch: AnsweringSettingsPatch) {
  const data: AnsweringSettingsPatch = { ...patch };
  if (data.voice !== undefined) data.voice = parsePhoneVoice(data.voice);
  if (data.estimateMinutes !== undefined) data.estimateMinutes = Math.min(180, Math.max(30, Math.round(data.estimateMinutes / 15) * 15));
  if (data.bufferMinutes !== undefined) data.bufferMinutes = Math.min(90, Math.max(0, Math.round(data.bufferMinutes / 15) * 15));
  if (data.retellNumber !== undefined) data.retellNumber = toE164(data.retellNumber) || "";
  return prisma.answeringSettings.upsert({ where: { shopId }, create: { shopId, ...data }, update: data });
}

/** Which shop a Retell number belongs to. Multi-shop ready: today there is one shop ("default"). */
export async function shopIdForNumber(toNumber: string) {
  const e164 = toE164(toNumber) || toNumber;
  if (e164) {
    const row = await prisma.answeringSettings.findFirst({ where: { retellNumber: e164 }, select: { shopId: true } });
    if (row) return row.shopId;
  }
  return DEFAULT_SHOP_ID;
}

const DAY_WORDS: Record<string, string> = { MON_FRI: "Monday to Friday", MON_SAT: "Monday to Saturday", EVERY_DAY: "every day" };

export type ShopContext = {
  shopId: string;
  agent: ShopForAgent;
  hours: ShopHours;
  timeZone: string;
  addonActive: boolean;
  ownerPhone: string;
  companyPhone: string;
};

/** The shop's own details for the phone agent. AppSettings is still the single "default" row (multi-shop: by shopId). */
export async function loadShopContext(shopId = DEFAULT_SHOP_ID): Promise<ShopContext> {
  const row = await prisma.appSettings.findUnique({ where: { id: "default" } });
  const place = shopPlaceFor(row?.businessAddress || "");
  const timeZone = process.env.NEXT_PUBLIC_SHOP_TIME_ZONE || place?.timeZone || DEFAULT_SHOP_TIME_ZONE;
  const profile = tradeProfile(row?.industry || "");
  let serviceIds: string[] = [];
  try {
    serviceIds = JSON.parse(row?.services || "[]");
  } catch {
    serviceIds = [];
  }
  const services = profile.services.filter((tile) => serviceIds.includes(tile.id)).map((tile) => tile.label);
  const hours: ShopHours = {
    workDays: parseWorkDays(row?.workDays),
    workStart: row?.workStart || "07:00",
    workEnd: row?.workEnd || "17:00",
  };
  const trade = (row?.tradeLabel || row?.industry || profile.label || "painting").toLowerCase();
  return {
    shopId,
    agent: {
      shopName: row?.businessName?.trim() || "the shop",
      ownerFirstName: row?.ownerFirstName?.trim() || "the owner",
      trade,
      services: services.length ? services : profile.services.filter((tile) => tile.on).map((tile) => tile.label),
      serviceArea: place ? `${place.label} and about ${row?.serviceRadiusMi || 30} miles around` : "",
      timeZone,
      hoursLine: `${DAY_WORDS[hours.workDays]}, ${formatTimeLabel(hours.workStart)} to ${formatTimeLabel(hours.workEnd)}`,
    },
    hours,
    timeZone,
    addonActive: canUseAnswering(row?.addonStatus || "locked"),
    ownerPhone: row?.ownerPhone || "",
    companyPhone: row?.companyPhone || "",
  };
}

/** Who goes to estimate visits: the saved pick if still active, else the first active crew member. */
export async function resolveEstimator(estimatorId: string) {
  const people = await prisma.employee.findMany({
    where: { employmentStatus: { in: ["ACTIVE", "TEMPORARY"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, firstName: true, lastName: true, jobTitle: true },
  });
  return people.find((person) => person.id === estimatorId) || people[0] || null;
}

/* ------------------------------------------------------------------ minutes ------------------------------------------------------------------ */

export async function usageNow(shopId: string, timeZone: string, now = new Date()) {
  const month = usageMonth(now, timeZone);
  const row = await prisma.answeringUsage.findUnique({ where: { shopId_month: { shopId, month } } });
  return { month, seconds: row?.seconds || 0, calls: row?.calls || 0, messageCalls: row?.messageCalls || 0 };
}

/** Count a finished call's seconds once (Retell retries webhooks; meteredMonth makes this idempotent). */
export async function meterCall(cardId: string, timeZone: string) {
  const card = await prisma.callCard.findUnique({ where: { id: cardId } });
  if (!card || card.meteredMonth || card.durationSec <= 0) return false;
  const month = usageMonth(card.endedAt || card.startedAt || new Date(), timeZone);
  const claimed = await prisma.callCard.updateMany({ where: { id: card.id, meteredMonth: "" }, data: { meteredMonth: month } });
  if (claimed.count !== 1) return false;
  const message = card.mode === "message" ? 1 : 0;
  await prisma.answeringUsage.upsert({
    where: { shopId_month: { shopId: card.shopId, month } },
    create: { shopId: card.shopId, month, seconds: card.durationSec, calls: 1, messageCalls: message },
    update: { seconds: { increment: card.durationSec }, calls: { increment: 1 }, messageCalls: { increment: message } },
  });
  return true;
}

export async function minutesSummary(shopId = DEFAULT_SHOP_ID) {
  const [settings, shop] = await Promise.all([getAnsweringSettings(shopId), loadShopContext(shopId)]);
  const usage = await usageNow(shopId, shop.timeZone);
  return { ...capState(usage.seconds, settings.minutesCap), month: usage.month, calls: usage.calls, messageCalls: usage.messageCalls };
}

/* ------------------------------------------------------------------ call cards ------------------------------------------------------------------ */

export function transcriptJson(turns: TranscriptTurn[]) {
  return JSON.stringify(turns.slice(0, 400).map((turn) => ({ role: turn.role, text: turn.text.slice(0, 2000) })));
}

export function readTranscript(raw: string): TranscriptTurn[] {
  try {
    const list = JSON.parse(raw || "[]");
    return Array.isArray(list)
      ? list.filter((t) => t && typeof t.text === "string").map((t) => ({ role: t.role === "agent" ? "agent" : "user", text: t.text }))
      : [];
  } catch {
    return [];
  }
}

export async function openCard(input: { shopId: string; callId: string; from: string; to: string; agentId?: string; mode: AnswerMode; simulated?: boolean }) {
  return prisma.callCard.upsert({
    where: { retellCallId: input.callId },
    create: {
      shopId: input.shopId,
      retellCallId: input.callId,
      fromNumber: input.from,
      toNumber: input.to,
      agentId: input.agentId || "",
      mode: input.mode,
      callerPhone: input.from,
      simulated: Boolean(input.simulated),
    },
    update: {},
  });
}

/** Apply call_started / call_ended / call_analyzed. Later events never move status backwards. */
export async function applyCallEvent(shopId: string, event: CallEvent, simulated = false) {
  const existing = await prisma.callCard.findUnique({ where: { retellCallId: event.callId } });
  const mode: AnswerMode = existing?.mode === "full" || event.dynamic.answer_mode === "full" ? "full" : "message";
  const card = existing || (await openCard({ shopId, callId: event.callId, from: event.from, to: event.to, agentId: event.agentId, mode, simulated }));
  const rank: Record<string, number> = { ringing: 0, live: 1, ended: 2, analyzed: 3 };
  const next = event.event === "call_started" ? "live" : event.event === "call_ended" ? "ended" : event.event === "call_analyzed" ? "analyzed" : card.status;
  const status = (rank[next] ?? 0) > (rank[card.status] ?? 0) ? next : card.status;
  const f = event.fields;
  const data: Record<string, unknown> = { status, agentId: event.agentId || card.agentId };
  if (event.from && !card.fromNumber) data.fromNumber = event.from;
  if (event.startedAt) data.startedAt = event.startedAt;
  if (event.endedAt) data.endedAt = event.endedAt;
  if (event.durationSec) data.durationSec = event.durationSec;
  if (event.endReason) data.endReason = event.endReason;
  if (event.recordingUrl) data.recordingUrl = event.recordingUrl;
  if (event.transcript.length) data.transcript = transcriptJson(event.transcript);
  if (event.summary) data.summary = event.summary.slice(0, 2000);
  // Analysis fields fill blanks; what book_estimate saved (read back to the caller) wins.
  if (f.callerName && !card.callerName) data.callerName = f.callerName.slice(0, 120);
  if (f.callbackNumber && (!card.callerPhone || card.callerPhone === card.fromNumber)) data.callerPhone = f.callbackNumber.slice(0, 40);
  if (f.address && !card.address) data.address = f.address.slice(0, 300);
  if (f.jobType && !card.jobType) data.jobType = f.jobType.slice(0, 120);
  if (f.details && !card.details) data.details = f.details.slice(0, 1000);
  if (f.preferredTime && !card.preferredTime) data.preferredTime = f.preferredTime.slice(0, 200);
  if (event.event === "call_analyzed") data.urgency = f.urgency;
  if (event.event === "call_analyzed" || event.event === "call_ended") {
    if (card.outcome !== "BOOKED") data.outcome = f.isSpam ? "SPAM" : card.mode === "message" ? "MESSAGE" : "NO_BOOKING";
  }
  return prisma.callCard.update({ where: { id: card.id }, data });
}

export function callCardTitle(card: { outcome: string; callerName: string; callerPhone: string; fromNumber: string }) {
  const who = card.callerName || prettyUs(card.callerPhone || card.fromNumber) || "Unknown caller";
  if (card.outcome === "BOOKED") return { title: "AI booked an estimate", who };
  if (card.outcome === "SPAM") return { title: "Spam call blocked", who };
  return { title: "New call · call back", who };
}

/** "Linda Parker · Exterior repaint · Tue Oct 6, 9 AM" */
export function callCardBody(card: { callerName: string; callerPhone: string; fromNumber: string; jobType: string; bookedDate: string; bookedStart: string; outcome: string; summary: string }) {
  const { who } = callCardTitle(card);
  const when = card.bookedDate && card.bookedStart ? `${spokenDay(card.bookedDate).replace(/^(\w{3})\w*, (\w{3})\w* /, "$1 $2 ")}, ${formatTimeLabel(card.bookedStart)}` : "";
  if (card.outcome === "BOOKED") return [who, card.jobType, when].filter(Boolean).join(" · ");
  return [who, card.jobType || card.summary.slice(0, 70), "wants a call back"].filter(Boolean).join(" · ");
}

/** Push alert + bell entry, once per call. Booked calls ping at call_ended; others once the summary is in. Spam stays quiet. */
export async function pingBoss(cardId: string) {
  const card = await prisma.callCard.findUnique({ where: { id: cardId } });
  if (!card || card.alertId || card.outcome === "SPAM") return null;
  const ready = card.outcome === "BOOKED" ? card.status === "ended" || card.status === "analyzed" : card.status === "analyzed";
  if (!ready) return null;
  const claimed = await prisma.callCard.updateMany({ where: { id: card.id, alertId: null }, data: { alertId: "pending" } });
  if (claimed.count !== 1) return null;
  const { title } = callCardTitle(card);
  const alert = await raiseAlert({
    kind: card.outcome === "BOOKED" ? "CALL_BOOKED" : "CALL_MESSAGE",
    priority: "urgent",
    title,
    body: callCardBody(card),
    href: `/calls/${card.id}`,
    jobId: card.jobId,
  });
  await prisma.callCard.update({ where: { id: card.id }, data: { alertId: alert?.id || "failed" } });
  return alert;
}

export async function listCallCards(shopId = DEFAULT_SHOP_ID, take = 50) {
  return prisma.callCard.findMany({ where: { shopId, status: { not: "ringing" } }, orderBy: { createdAt: "desc" }, take });
}

export async function getCallCard(id: string, shopId = DEFAULT_SHOP_ID) {
  if (!id) return null;
  const card = await prisma.callCard.findUnique({ where: { id } });
  return card && card.shopId === shopId ? card : null;
}
