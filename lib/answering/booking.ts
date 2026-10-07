import "server-only";

import { prisma } from "@/lib/prisma";
import { fromDayString, toDayString } from "@/lib/dates";
import { findOrCreateCustomer } from "@/lib/client-store";
import { nextJobCode } from "@/lib/shop-brand";
import { hoursBetween, parseMinutes, toHhmm } from "@/lib/schedule";
import { formatTimeLabel } from "@/lib/schedule";
import { getAnsweringSettings, loadShopContext, resolveEstimator, openCard } from "@/lib/answering/store";
import { openSlots, parsePartOfDay, parseSlotId, slotIsOpen, slotLabel, addDays, type BusyRow } from "@/lib/answering/slots";
import { BOOKING_HORIZON_DAYS, type AnswerMode } from "@/lib/answering/config";
import { argText, type ToolCall } from "@/lib/answering/events";

/**
 * The two Retell custom functions. Slots always come from the server (never from what the AI "remembers"),
 * the booking re-checks the slot inside a transaction, and a unique slot lock stops two callers at once
 * from getting the same time.
 */

async function busyRowsFor(employeeId: string, fromDay: string, days: number): Promise<BusyRow[]> {
  const rows = await prisma.timeEntry.findMany({
    where: { employeeId, date: { gte: fromDayString(fromDay), lte: fromDayString(addDays(fromDay, days + 1)) } },
    select: { date: true, scheduledStart: true, scheduledEnd: true, scheduledHours: true, notes: true },
  });
  return rows.map((row) => ({
    date: toDayString(row.date),
    start: row.scheduledStart,
    end: row.scheduledEnd,
    scheduledHours: row.scheduledHours,
    notes: row.notes,
  }));
}

async function cardMode(call: ToolCall): Promise<AnswerMode> {
  if (!call.callId) return "message";
  const card = await prisma.callCard.findUnique({ where: { retellCallId: call.callId }, select: { mode: true } });
  if (card) return card.mode === "full" ? "full" : "message";
  return call.dynamic.answer_mode === "full" ? "full" : "message";
}

export type ToolReply = Record<string, unknown> & { result: string };

export async function checkAvailability(shopId: string, call: ToolCall, now = new Date()): Promise<ToolReply> {
  if ((await cardMode(call)) !== "full") {
    return { result: "Booking is off for this call. Take a message instead.", slots: [] };
  }
  const [settings, shop] = await Promise.all([getAnsweringSettings(shopId), loadShopContext(shopId)]);
  const estimator = await resolveEstimator(settings.estimatorId);
  if (!estimator) return { result: "The schedule isn't set up yet. Take a message instead.", slots: [] };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: shop.timeZone }).format(now);
  const rows = await busyRowsFor(estimator.id, today, BOOKING_HORIZON_DAYS + 1);
  const slots = openSlots({
    now,
    timeZone: shop.timeZone,
    hours: shop.hours,
    rows,
    estimateMinutes: settings.estimateMinutes,
    bufferMinutes: settings.bufferMinutes,
    preferredDate: argText(call.args, "preferred_date", 10) || null,
    partOfDay: parsePartOfDay(argText(call.args, "part_of_day", 20)),
  });
  if (!slots.length) {
    return { result: "No open estimate times in the next two weeks. Take a message and say the owner will call back to set a time.", slots: [] };
  }
  return {
    result: `Open times: ${slots.map((slot) => slot.label).join("; ")}. Offer these and use the slot_id of the one they pick.`,
    slots: slots.map((slot) => ({ slot_id: slot.id, label: slot.label })),
  };
}

async function freeJobCode(businessName: string) {
  let count = await prisma.job.count();
  for (let tries = 0; tries < 20; tries += 1) {
    const code = nextJobCode(businessName, count + tries);
    const taken = await prisma.job.findFirst({ where: { code }, select: { id: true } }); // per-shop code (multi-shop)
    if (!taken) return code;
  }
  count = Date.now() % 100000;
  return nextJobCode(businessName, count);
}

export async function bookEstimate(shopId: string, call: ToolCall, now = new Date()): Promise<ToolReply> {
  if (!call.callId) return { booked: false, result: "Missing call id. Take a message instead." };
  if ((await cardMode(call)) !== "full") {
    return { booked: false, result: "Booking is off for this call. Take a message instead." };
  }
  const slot = parseSlotId(argText(call.args, "slot_id", 20));
  if (!slot) return { booked: false, result: "That time wasn't one of the open slots. Call check_availability again." };

  // Idempotent: Retell may retry; a call books at most one visit.
  const card = await openCard({ shopId, callId: call.callId, from: call.from, to: call.to, mode: "full" });
  if (card.timeEntryId && card.bookedDate) {
    return { booked: true, result: `Already booked for ${slotLabel(card.bookedDate, card.bookedStart)}.`, slot_id: `${card.bookedDate}T${card.bookedStart}` };
  }

  const [settings, shop] = await Promise.all([getAnsweringSettings(shopId), loadShopContext(shopId)]);
  const estimator = await resolveEstimator(settings.estimatorId);
  if (!estimator) return { booked: false, result: "The schedule isn't set up yet. Take a message instead." };

  const name = argText(call.args, "caller_name", 120) || "Phone caller";
  const phone = argText(call.args, "caller_phone", 40) || call.from;
  const address = argText(call.args, "address", 300);
  const jobType = argText(call.args, "job_type", 120) || "Estimate";
  const details = argText(call.args, "details", 1000);
  const preferred = argText(call.args, "preferred_time", 200);
  const end = toHhmm((parseMinutes(slot.start) ?? 0) + settings.estimateMinutes);

  const alternatives = async () => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: shop.timeZone }).format(now);
    const rows = await busyRowsFor(estimator.id, today, BOOKING_HORIZON_DAYS + 1);
    return openSlots({ now, timeZone: shop.timeZone, hours: shop.hours, rows, estimateMinutes: settings.estimateMinutes, bufferMinutes: settings.bufferMinutes, preferredDate: slot.date });
  };

  const rows = await busyRowsFor(estimator.id, slot.date, 0);
  const open = slotIsOpen({ day: slot.date, start: slot.start, rows, hours: shop.hours, estimateMinutes: settings.estimateMinutes, bufferMinutes: settings.bufferMinutes, now, timeZone: shop.timeZone });
  if (!open) {
    const alts = await alternatives();
    return {
      booked: false,
      result: alts.length ? `That time was just taken. Offer these instead: ${alts.map((s) => s.label).join("; ")}.` : "That time was just taken and nothing else is open soon. Take a message.",
      slots: alts.map((s) => ({ slot_id: s.id, label: s.label })),
    };
  }

  // Slot lock: unique (shop, estimator, day, start). A stale lock whose visit was deleted is cleared and retried.
  const lockKey = { shopId_employeeId_date_start: { shopId, employeeId: estimator.id, date: slot.date, start: slot.start } };
  const existingLock = await prisma.answeringSlotLock.findUnique({ where: lockKey });
  if (existingLock && existingLock.callId !== call.callId) {
    const holder = await prisma.callCard.findUnique({ where: { retellCallId: existingLock.callId }, select: { timeEntryId: true } });
    const alive = holder?.timeEntryId ? await prisma.timeEntry.findUnique({ where: { id: holder.timeEntryId }, select: { id: true } }) : null;
    if (alive) {
      const alts = await alternatives();
      return { booked: false, result: `That time was just taken. Offer these instead: ${alts.map((s) => s.label).join("; ")}.`, slots: alts.map((s) => ({ slot_id: s.id, label: s.label })) };
    }
    await prisma.answeringSlotLock.delete({ where: { id: existingLock.id } }).catch(() => undefined);
  }
  try {
    if (!existingLock || existingLock.callId !== call.callId) {
      await prisma.answeringSlotLock.create({ data: { shopId, employeeId: estimator.id, date: slot.date, start: slot.start, callId: call.callId } });
    }
  } catch {
    const alts = await alternatives();
    return { booked: false, result: `That time was just taken. Offer these instead: ${alts.map((s) => s.label).join("; ")}.`, slots: alts.map((s) => ({ slot_id: s.id, label: s.label })) };
  }

  const customer = await findOrCreateCustomer({ name, phone, address, actor: "AI answering", quiet: true });
  const settingsRow = await prisma.appSettings.findUnique({ where: { id: "default" }, select: { businessName: true } });
  const code = await freeJobCode(settingsRow?.businessName || "");
  const notes = [`Booked by AI answering from a phone call.`, jobType ? `Job: ${jobType}.` : "", details, preferred ? `Caller prefers: ${preferred}.` : ""]
    .filter(Boolean)
    .join(" ");

  const result = await prisma.$transaction(async (tx) => {
    // Final re-check inside the transaction (someone may have added a row on the schedule meanwhile).
    const sameDay = await tx.timeEntry.findMany({
      where: { employeeId: estimator.id, date: fromDayString(slot.date) },
      select: { date: true, scheduledStart: true, scheduledEnd: true, scheduledHours: true, notes: true },
    });
    const stillOpen = slotIsOpen({
      day: slot.date,
      start: slot.start,
      rows: sameDay.map((row) => ({ date: slot.date, start: row.scheduledStart, end: row.scheduledEnd, scheduledHours: row.scheduledHours, notes: row.notes })),
      hours: shop.hours,
      estimateMinutes: settings.estimateMinutes,
      bufferMinutes: settings.bufferMinutes,
    });
    if (!stillOpen) return null;
    const job = await tx.job.create({
      data: {
        code,
        name: jobType,
        client: customer?.name || name,
        customerId: customer?.id || null,
        address: address || customer?.address || "",
        notes,
        leadCalledAt: now,
      },
    });
    const entry = await tx.timeEntry.create({
      data: {
        employeeId: estimator.id,
        date: fromDayString(slot.date),
        scheduledStart: slot.start,
        scheduledEnd: end,
        scheduledHours: hoursBetween(slot.start, end),
        jobId: job.id,
        kind: "ESTIMATE",
        status: "SCHEDULED",
        notes: "Estimate visit · booked by AI answering",
      },
    });
    await tx.callCard.update({
      where: { id: card.id },
      data: {
        outcome: "BOOKED",
        callerName: name,
        callerPhone: phone,
        address,
        jobType,
        details,
        preferredTime: preferred,
        customerId: customer?.id || null,
        jobId: job.id,
        timeEntryId: entry.id,
        bookedDate: slot.date,
        bookedStart: slot.start,
        bookedEnd: end,
      },
    });
    await tx.auditLog.create({
      data: { actor: "AI answering", action: "Booked estimate visit from a phone call", field: "schedule", newValue: `${job.code} ${slot.date} ${slot.start}-${end} · ${estimator.firstName}` },
    });
    return { job, entry };
  });

  if (!result) {
    await prisma.answeringSlotLock.deleteMany({ where: { callId: call.callId, date: slot.date, start: slot.start } });
    const alts = await alternatives();
    return { booked: false, result: `That time was just taken. Offer these instead: ${alts.map((s) => s.label).join("; ")}.`, slots: alts.map((s) => ({ slot_id: s.id, label: s.label })) };
  }

  return {
    booked: true,
    slot_id: `${slot.date}T${slot.start}`,
    result: `Booked: free estimate visit ${slotLabel(slot.date, slot.start)} until ${formatTimeLabel(end)} at ${address || "the address they gave"}. Read this back to the caller.`,
  };
}
