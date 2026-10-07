/**
 * Estimate-slot math for the AI phone agent. Pure (no database), so it is unit tested and the simulator
 * proves the same rules the live webhook uses.
 *
 * Rules:
 * - Slots sit inside the shop's own hours (AppSettings workDays / workStart / workEnd), on a 30-minute grid.
 * - A slot must end by closing time and start at least MIN_NOTICE_MINUTES from now (shop clock).
 * - The estimator is never double-booked: every one of their schedule rows (jobs AND estimates) blocks its
 *   time plus the drive buffer on both sides. A row with hours but no times, or an absence, blocks the day.
 */
import { parseMinutes, toHhmm, formatTimeLabel } from "@/lib/schedule";
import {
  BOOKING_HORIZON_DAYS,
  DEFAULT_BUFFER_MINUTES,
  DEFAULT_ESTIMATE_MINUTES,
  MIN_NOTICE_MINUTES,
  SLOTS_OFFERED,
} from "@/lib/answering/config";

export type WorkDays = "MON_FRI" | "MON_SAT" | "EVERY_DAY";
export type PartOfDay = "morning" | "afternoon" | "any";

export type ShopHours = { workDays: string; workStart: string; workEnd: string };

export type BusyRow = {
  date: string; // YYYY-MM-DD
  start: string | null;
  end: string | null;
  scheduledHours?: number;
  notes?: string | null;
};

export type Slot = { id: string; date: string; start: string; end: string; label: string };

const GRID_MINUTES = 30;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function parseWorkDays(value: unknown): WorkDays {
  return value === "MON_SAT" || value === "EVERY_DAY" ? value : "MON_FRI";
}

export function parsePartOfDay(value: unknown): PartOfDay {
  const text = String(value ?? "").toLowerCase();
  if (text.startsWith("morn") || text === "am") return "morning";
  if (text.startsWith("after") || text === "pm" || text.startsWith("even")) return "afternoon";
  return "any";
}

/** 0 = Sunday … 6 = Saturday for a YYYY-MM-DD calendar day. */
export function weekdayOf(day: string) {
  return new Date(`${day.slice(0, 10)}T12:00:00Z`).getUTCDay();
}

export function addDays(day: string, amount: number) {
  const date = new Date(`${day.slice(0, 10)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function isWorkDay(day: string, workDays: string) {
  const weekday = weekdayOf(day);
  const mode = parseWorkDays(workDays);
  if (mode === "EVERY_DAY") return true;
  if (mode === "MON_SAT") return weekday !== 0;
  return weekday !== 0 && weekday !== 6;
}

/** The shop's wall clock right now: calendar day and minutes past midnight in the shop's zone. */
export function shopClock(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value || "00";
  const hour = Number(pick("hour")) % 24;
  return { day: `${pick("year")}-${pick("month")}-${pick("day")}`, minutes: hour * 60 + Number(pick("minute")) };
}

/** "Tuesday, October 6" */
export function spokenDay(day: string) {
  const date = new Date(`${day.slice(0, 10)}T12:00:00Z`);
  return `${WEEKDAYS[date.getUTCDay()]}, ${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

/** "Tuesday, October 6 at 9 AM" */
export function slotLabel(day: string, start: string) {
  return `${spokenDay(day)} at ${formatTimeLabel(start)}`;
}

export function slotId(day: string, start: string) {
  return `${day}T${start}`;
}

export function parseSlotId(value: unknown): { date: string; start: string } | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(String(value ?? "").trim());
  if (!match || parseMinutes(match[2]) == null) return null;
  if (Number.isNaN(new Date(`${match[1]}T12:00:00Z`).getTime())) return null;
  return { date: match[1], start: match[2] };
}

function isAbsence(row: BusyRow) {
  return Boolean(row.notes && row.notes.startsWith("absence:"));
}

/** Busy minute ranges on one day for the estimator (absences and untimed rows block the whole day). */
export function busyRanges(rows: BusyRow[], day: string, hours: ShopHours): Array<[number, number]> {
  const open = parseMinutes(hours.workStart) ?? 7 * 60;
  const close = parseMinutes(hours.workEnd) ?? 17 * 60;
  const out: Array<[number, number]> = [];
  for (const row of rows) {
    if (row.date.slice(0, 10) !== day) continue;
    if (isAbsence(row)) {
      out.push([0, 24 * 60]);
      continue;
    }
    const from = row.start ? parseMinutes(row.start) : null;
    const to = row.end ? parseMinutes(row.end) : null;
    if (from == null || to == null || from === to) {
      if ((row.scheduledHours || 0) > 0) out.push([open, close]);
      continue;
    }
    out.push([from, to > from ? to : to + 24 * 60]);
  }
  return out;
}

export function slotIsOpen(input: {
  day: string;
  start: string;
  rows: BusyRow[];
  hours: ShopHours;
  estimateMinutes?: number;
  bufferMinutes?: number;
  now?: Date;
  timeZone?: string;
}) {
  const duration = input.estimateMinutes ?? DEFAULT_ESTIMATE_MINUTES;
  const buffer = input.bufferMinutes ?? DEFAULT_BUFFER_MINUTES;
  const open = parseMinutes(input.hours.workStart);
  const close = parseMinutes(input.hours.workEnd);
  const start = parseMinutes(input.start);
  if (open == null || close == null || start == null) return false;
  if (!isWorkDay(input.day, input.hours.workDays)) return false;
  if (start < open || start + duration > close) return false;
  if (input.now && input.timeZone) {
    const clock = shopClock(input.now, input.timeZone);
    if (input.day < clock.day) return false;
    if (input.day === clock.day && start < clock.minutes + MIN_NOTICE_MINUTES) return false;
  }
  for (const [from, to] of busyRanges(input.rows, input.day, input.hours)) {
    if (start - buffer < to && from < start + duration + buffer) return false;
  }
  return true;
}

function inPart(start: number, part: PartOfDay) {
  if (part === "morning") return start < 12 * 60;
  if (part === "afternoon") return start >= 12 * 60;
  return true;
}

/**
 * Open estimate slots, soonest first, spread out so the AI can offer real choices:
 * with a preferred day, up to `limit` slots that day at least 2 hours apart; otherwise the first opening on
 * each of the next `limit` days that have room.
 */
export function openSlots(input: {
  now: Date;
  timeZone: string;
  hours: ShopHours;
  rows: BusyRow[];
  estimateMinutes?: number;
  bufferMinutes?: number;
  preferredDate?: string | null;
  partOfDay?: PartOfDay;
  limit?: number;
  horizonDays?: number;
}): Slot[] {
  const duration = input.estimateMinutes ?? DEFAULT_ESTIMATE_MINUTES;
  const limit = input.limit ?? SLOTS_OFFERED;
  const part = input.partOfDay ?? "any";
  const open = parseMinutes(input.hours.workStart) ?? 7 * 60;
  const close = parseMinutes(input.hours.workEnd) ?? 17 * 60;
  const today = shopClock(input.now, input.timeZone).day;
  const horizon = input.horizonDays ?? BOOKING_HORIZON_DAYS;

  const daySlots = (day: string) => {
    const found: Slot[] = [];
    for (let start = open; start + duration <= close; start += GRID_MINUTES) {
      if (!inPart(start, part)) continue;
      const hhmm = toHhmm(start);
      const ok = slotIsOpen({
        day,
        start: hhmm,
        rows: input.rows,
        hours: input.hours,
        estimateMinutes: duration,
        bufferMinutes: input.bufferMinutes,
        now: input.now,
        timeZone: input.timeZone,
      });
      if (ok) found.push({ id: slotId(day, hhmm), date: day, start: hhmm, end: toHhmm(start + duration), label: slotLabel(day, hhmm) });
    }
    return found;
  };

  const preferred = input.preferredDate && /^\d{4}-\d{2}-\d{2}$/.test(input.preferredDate) ? input.preferredDate : null;
  if (preferred && preferred >= today) {
    const spaced: Slot[] = [];
    for (const slot of daySlots(preferred)) {
      const last = spaced[spaced.length - 1];
      if (!last || (parseMinutes(slot.start) ?? 0) - (parseMinutes(last.start) ?? 0) >= 120) spaced.push(slot);
      if (spaced.length >= limit) break;
    }
    if (spaced.length) return spaced;
  }

  const result: Slot[] = [];
  for (let offset = 0; offset <= horizon && result.length < limit; offset += 1) {
    const day = addDays(preferred && preferred > today ? preferred : today, offset);
    const first = daySlots(day)[0];
    if (first) result.push(first);
  }
  return result;
}
