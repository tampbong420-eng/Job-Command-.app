import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
} from "date-fns";

export type PayFrequency = "WEEKLY" | "BIWEEKLY" | "ROLLING_3_WEEK";

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const WEEKDAY_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function toDayString(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

export function fromDayString(iso: string): Date {
  return parseISO(`${iso.slice(0, 10)}T00:00:00.000Z`);
}

/**
 * The shop's clock. Calendar days ("today", clock-in day, this week) follow the shop's own time zone,
 * not UTC — otherwise the desk flips to tomorrow in the evening.
 *
 * Order: NEXT_PUBLIC_SHOP_TIME_ZONE (deployment override) → the zone from the shop's address
 * (set at runtime with setShopTimeZone, see lib/shop-place.ts) → US Central as the generic default.
 */
export const DEFAULT_SHOP_TIME_ZONE = "America/Chicago";
export const SHOP_TIME_ZONE = process.env.NEXT_PUBLIC_SHOP_TIME_ZONE || DEFAULT_SHOP_TIME_ZONE;

let runtimeShopZone: string | null = null;

/** Point the shop clock at the shop's zone (from its address). Null/invalid goes back to the default. */
export function setShopTimeZone(zone?: string | null) {
  if (!zone) {
    runtimeShopZone = null;
    return;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    runtimeShopZone = zone;
  } catch {
    runtimeShopZone = null;
  }
}

/** The zone the shop clock reads right now. */
export function shopTimeZone(): string {
  return process.env.NEXT_PUBLIC_SHOP_TIME_ZONE || runtimeShopZone || DEFAULT_SHOP_TIME_ZONE;
}

const dayFormatters = new Map<string, Intl.DateTimeFormat>();

/** YYYY-MM-DD for an instant, read on the shop's wall calendar. */
export function shopDayString(now: Date = new Date(), timeZone: string = shopTimeZone()): string {
  let formatter = dayFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dayFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(now);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

/** Today's date key on the shop calendar (not UTC). */
export function todayString(now = new Date()): string {
  return shopDayString(now);
}

/** Today on the shop calendar as the UTC-midnight Date the database uses for day columns. */
export function shopToday(now = new Date()): Date {
  return fromDayString(todayString(now));
}

export function utcDay(date: Date | string): Date {
  return fromDayString(toDayString(date));
}

export function formatDay(value: Date | string, pattern = "EEE MMM d"): string {
  const iso = toDayString(value);
  const [y, m, d] = iso.split("-").map(Number);
  return format(new Date(y, m - 1, d), pattern);
}

export function formatRange(start: Date | string, end: Date | string): string {
  return `${formatDay(start, "MMM d")} – ${formatDay(end, "MMM d, yyyy")}`;
}

export function periodLengthDays(frequency: PayFrequency): number {
  switch (frequency) {
    case "WEEKLY":
      return 7;
    case "BIWEEKLY":
      return 14;
    case "ROLLING_3_WEEK":
      return 21;
  }
}

export function periodsPerYear(frequency: PayFrequency): number {
  return 365 / periodLengthDays(frequency);
}

export function getPeriodContaining(
  date: Date | string,
  baseline: Date | string,
  frequency: PayFrequency
) {
  const len = periodLengthDays(frequency);
  const start = utcDay(baseline);
  const target = utcDay(date);
  const diff = differenceInCalendarDays(target, start);
  const index = Math.floor(diff / len);
  const periodStart = addDays(start, index * len);
  const periodEnd = addDays(periodStart, len - 1);
  return { start: periodStart, end: periodEnd, index };
}

export function mostRecentWeekday(
  weekday: number,
  date: Date | string = new Date()
): string {
  const day = utcDay(date);
  const delta = (day.getUTCDay() - weekday + 7) % 7;
  return toDayString(addDays(day, -delta));
}

export function snapToWeekday(iso: string, weekday: number): string {
  return mostRecentWeekday(weekday, iso);
}

export function periodFromClock(
  frequency: PayFrequency,
  anchor: string,
  date: Date | string = new Date(),
  offset = 0
) {
  const current = getPeriodContaining(date, anchor, frequency);
  const len = periodLengthDays(frequency);
  const start = addDays(current.start, offset * len);
  return {
    start: toDayString(start),
    end: toDayString(addDays(start, len - 1)),
    index: current.index + offset,
    length: len,
    isCurrent: offset === 0,
  };
}

export function periodNickname(frequency: PayFrequency, offset: number): string {
  if (frequency === "BIWEEKLY" || frequency === "ROLLING_3_WEEK") {
    if (offset === 0) return "This period";
    if (offset === -1) return "Last period";
    if (offset === 1) return "Next period";
    return offset < 0 ? `${-offset} periods ago` : `${offset} periods ahead`;
  }
  if (offset === 0) return "This week";
  if (offset === -1) return "Last week";
  if (offset === 1) return "Next week";
  return offset < 0 ? `${-offset} weeks ago` : `${offset} weeks ahead`;
}

export function getThreeWeekWindow(
  date: Date | string,
  baseline: Date | string,
  offset = 0
) {
  const { start } = getPeriodContaining(date, baseline, "ROLLING_3_WEEK");
  const windowStart = addDays(start, offset * 21);
  return {
    start: windowStart,
    end: addDays(windowStart, 20),
    offset,
  };
}

export function eachDay(start: Date | string, end: Date | string): Date[] {
  const days: Date[] = [];
  let cursor = utcDay(start);
  const last = utcDay(end);
  while (cursor.getTime() <= last.getTime()) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

export function weekdayIndex(date: Date | string): number {
  return utcDay(date).getUTCDay();
}

export function startOfWorkweek(
  date: Date | string,
  weekStartsOn: number
): Date {
  const day = utcDay(date);
  const current = day.getUTCDay();
  const delta = (current - weekStartsOn + 7) % 7;
  return addDays(day, -delta);
}

export function addCalendarDays(date: Date | string, amount: number): Date {
  return addDays(utcDay(date), amount);
}

export function monthKey(value: Date | string): string {
  return toDayString(value).slice(0, 7);
}

export function startOfMonth(value: Date | string): Date {
  const iso = `${monthKey(value)}-01`;
  return fromDayString(iso);
}

export function monthMatrix(value: Date | string): Date[] {
  const start = startOfMonth(value);
  const pad = start.getUTCDay();
  const first = addDays(start, -pad);
  return eachDay(first, addDays(first, 41));
}
