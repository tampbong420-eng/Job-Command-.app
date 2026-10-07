import { addCalendarDays, formatDay, startOfWorkweek, toDayString, todayString } from "@/lib/dates";
import { liveActualHours } from "@/lib/payroll";
import { formatTimeLabel } from "@/lib/schedule";
import type { TimeEntryDTO } from "@/lib/types";

export type WeekDayReview = {
  date: string;
  weekday: string;
  scheduledHours: number;
  loggedHours: number;
  shift: string;
  jobs: string;
};

type WeekEntry = Pick<
  TimeEntryDTO,
  "date" | "actualHours" | "clockIn" | "clockOut" | "scheduledHours" | "scheduledStart" | "scheduledEnd"
> & { job?: { name?: string | null; client?: string | null } | null };

export function weekRange(now = new Date()) {
  const start = startOfWorkweek(now, 1);
  return { start: toDayString(start), end: toDayString(addCalendarDays(start, 6)) };
}

export function weekHourTotal(
  entries: Array<Pick<TimeEntryDTO, "date" | "actualHours" | "clockIn" | "clockOut">>,
  now = new Date()
) {
  const { start, end } = weekRange(now);
  let total = 0;
  for (const entry of entries) {
    const day = toDayString(entry.date);
    if (day < start || day > end) continue;
    total += liveActualHours(entry, now);
  }
  return Math.round(total * 10) / 10;
}

function roundTenth(value: number) {
  return Math.round(value * 10) / 10;
}

function reviewForDate(entries: WeekEntry[], date: string, now: Date, weekdayPattern: string): WeekDayReview {
  const dayEntries = entries.filter((entry) => toDayString(entry.date) === date);
  const scheduledHours = roundTenth(dayEntries.reduce((sum, entry) => sum + (entry.scheduledHours || 0), 0));
  const loggedHours = roundTenth(dayEntries.reduce((sum, entry) => sum + liveActualHours(entry, now), 0));
  const shifts = [
    ...new Set(
      dayEntries
        .map((entry) => {
          const from = entry.scheduledStart ? formatTimeLabel(entry.scheduledStart) : "";
          const to = entry.scheduledEnd ? formatTimeLabel(entry.scheduledEnd) : "";
          if (!from && !to) return "";
          return from && to ? `${from}–${to}` : from || to;
        })
        .filter(Boolean)
    ),
  ];
  const jobs = [
    ...new Set(
      dayEntries
        .map((entry) => entry.job?.client || entry.job?.name || "")
        .map((name) => name.trim())
        .filter(Boolean)
    ),
  ];
  return {
    date,
    weekday: formatDay(date, weekdayPattern),
    scheduledHours,
    loggedHours,
    shift: shifts.join(" · "),
    jobs: jobs.join(" · "),
  };
}

export function weekWorkdays(entries: WeekEntry[], now = new Date()): WeekDayReview[] {
  const { start } = weekRange(now);
  return [0, 1, 2, 3, 4].map((offset) =>
    reviewForDate(entries, toDayString(addCalendarDays(start, offset)), now, "EEE")
  );
}

export function rollingSchedule(entries: WeekEntry[], now = new Date(), days = 10): WeekDayReview[] {
  const start = todayString(now);
  return Array.from({ length: days }, (_, offset) =>
    reviewForDate(entries, toDayString(addCalendarDays(start, offset)), now, "EEE MMM d")
  );
}
