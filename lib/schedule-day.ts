/**
 * Unified Schedule (2026-10-02): one board for job days and estimate visits.
 * Pure helpers only (no React, no Prisma) so the screen, the backfill, and tests share them.
 */
import { addCalendarDays, formatDay, monthKey, monthMatrix, toDayString } from "@/lib/dates";
import { hoursBetween } from "@/lib/schedule";

export type EntryKind = "JOB" | "ESTIMATE";
export type ScheduleFilter = "ALL" | EntryKind;
export type ScheduleView = "week" | "month";

/** Pipeline stage 2 (Schedule / Estimate) is an estimate visit. Every other stage books job days. */
export const ESTIMATE_STAGE = 2;

export function parseEntryKind(value: unknown): EntryKind | "" {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (raw === "JOB" || raw === "ESTIMATE") return raw;
  return "";
}

export function kindFromStage(stage: number | null | undefined): EntryKind {
  return stage === ESTIMATE_STAGE ? "ESTIMATE" : "JOB";
}

/**
 * Which list a job shows in when booking: stage 2 (estimate walk) under Estimate, stage 3
 * (assign crew) and stage 4 (active, crew already on it) under Job. Leads, invoicing and
 * archived jobs can't be booked.
 */
export function bookableKind(stage: number | null | undefined): EntryKind | null {
  if (stage === ESTIMATE_STAGE) return "ESTIMATE";
  if (stage === 3 || stage === 4) return "JOB";
  return null;
}

/**
 * The tag shown on a booked stop. A saved kind wins; an untagged (older) row reads as its job's
 * current lit stage, which is the same rule the one-off backfill writes.
 */
export function entryKind(
  entry: { kind?: string | null; jobId: string | null },
  stageOf: (jobId: string) => number | undefined
): EntryKind {
  const saved = parseEntryKind(entry.kind);
  if (saved) return saved;
  return kindFromStage(entry.jobId ? stageOf(entry.jobId) : undefined);
}

/** Step the picked day by whole days. The month follows the day, so Oct 31 + 1 lands on Nov 1. */
export function stepDay(iso: string, days: number): { day: string; month: string } {
  const day = toDayString(addCalendarDays(iso, days));
  return { day, month: monthKey(day) };
}

/** Sunday-to-Saturday week holding the day, as seven ISO days. */
export function weekDays(iso: string): string[] {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const first = addCalendarDays(iso, -dow);
  return Array.from({ length: 7 }, (_, index) => toDayString(addCalendarDays(first, index)));
}

/** "SEP 27 – OCT 3", or "OCT 4 – 10" inside one month. */
export function weekLabel(iso: string): string {
  const days = weekDays(iso);
  const first = days[0];
  const last = days[6];
  const sameMonth = first.slice(0, 7) === last.slice(0, 7);
  const left = formatDay(first, "MMM d");
  const right = sameMonth ? formatDay(last, "d") : formatDay(last, "MMM d");
  return `${left} – ${right}`.toUpperCase();
}

/** Gold line above the calendar: "FRI · OCT 2, 2026". */
export function dateLine(iso: string): string {
  return `${formatDay(iso, "EEE")} · ${formatDay(iso, "MMM d, yyyy")}`.toUpperCase();
}

/** Month grid days, Sunday first, without a trailing week that holds no day of the month. */
export function monthDays(month: string): string[] {
  const all = monthMatrix(`${month}-01`).map((date) => toDayString(date));
  const rows: string[][] = [];
  for (let index = 0; index < all.length; index += 7) rows.push(all.slice(index, index + 7));
  return rows.filter((row) => row.some((iso) => iso.startsWith(month))).flat();
}

export type StopEntry = {
  id: string;
  date: string;
  jobId: string | null;
  kind?: string | null;
  notes: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  scheduledHours: number;
};

export function isAbsence(entry: { notes: string | null }) {
  return Boolean(entry.notes?.startsWith("absence:"));
}

/** Booked stops on one day (job or estimate), earliest first. Absence rows and plain shifts are not stops. */
export function stopsForDay<T extends StopEntry>(entries: T[], iso: string): T[] {
  return entries
    .filter((entry) => entry.date === iso && entry.jobId && !isAbsence(entry))
    .slice()
    .sort(
      (a, b) =>
        (a.scheduledStart || "99:99").localeCompare(b.scheduledStart || "99:99") || a.id.localeCompare(b.id)
    );
}

export function stopHours(entry: Pick<StopEntry, "scheduledStart" | "scheduledEnd" | "scheduledHours">): number {
  if (entry.scheduledStart && entry.scheduledEnd && entry.scheduledStart !== entry.scheduledEnd) {
    return hoursBetween(entry.scheduledStart, entry.scheduledEnd);
  }
  return entry.scheduledHours > 0 ? entry.scheduledHours : 0;
}

/** Which bars a calendar day shows: lime for a job day, orange for an estimate visit, gray for a plain shift. */
export function dayMarks(
  entries: StopEntry[],
  iso: string,
  kindOf: (entry: StopEntry) => EntryKind
): { job: boolean; estimate: boolean; shift: boolean } {
  let job = false;
  let estimate = false;
  let shift = false;
  for (const entry of entries) {
    if (entry.date !== iso || isAbsence(entry)) continue;
    if (!entry.jobId) {
      if (entry.scheduledHours > 0) shift = true;
      continue;
    }
    if (kindOf(entry) === "ESTIMATE") estimate = true;
    else job = true;
  }
  return { job, estimate, shift: shift && !job && !estimate };
}

export function filterCounts<T>(stops: T[], kindOf: (stop: T) => EntryKind) {
  let jobs = 0;
  let estimates = 0;
  for (const stop of stops) {
    if (kindOf(stop) === "ESTIMATE") estimates += 1;
    else jobs += 1;
  }
  return { ALL: stops.length, JOB: jobs, ESTIMATE: estimates } as Record<ScheduleFilter, number>;
}

export function filterStops<T>(stops: T[], filter: ScheduleFilter, kindOf: (stop: T) => EntryKind): T[] {
  if (filter === "ALL") return stops;
  return stops.filter((stop) => kindOf(stop) === filter);
}

export function totalHours(stops: Array<Pick<StopEntry, "scheduledStart" | "scheduledEnd" | "scheduledHours">>) {
  return Math.round(stops.reduce((sum, stop) => sum + stopHours(stop), 0) * 10) / 10;
}

export const SCHEDULE_VIEW_KEY = "jc-schedule-view";

export function parseScheduleView(value: unknown): ScheduleView {
  return value === "month" ? "month" : "week";
}

/** Crew-row label: "Painter · 2 of 5". */
export function crewSpot(role: string, index: number, count: number): string {
  const spot = count > 1 && index >= 0 ? `${index + 1} of ${count}` : "";
  return [role.trim(), spot].filter(Boolean).join(" · ");
}

/**
 * Server fallback when a booking arrives without a kind (estimate walk from the Estimate stage,
 * crew days from Yellow / Active / job crew picker, voice). Before the estimate goes out and before a
 * start date is locked, a visit is an estimate walk; after either, it is a job day.
 */
export function kindForNewBooking(job: {
  dueDate: Date | string | null;
  estimateSent: boolean;
}): EntryKind {
  if (job.dueDate) return "JOB";
  return job.estimateSent ? "JOB" : "ESTIMATE";
}

/** "07:00" → "7:00" (the big number on a stop). */
export function clockShort(value: string | null | undefined): string {
  if (!value) return "—";
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return value;
  const hour12 = ((h + 11) % 12) + 1;
  return `${hour12}:${String(m).padStart(2, "0")}`;
}

/** "15:00" → "3:00 PM". */
export function clockLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const [h] = value.split(":").map(Number);
  if (!Number.isFinite(h)) return value;
  return `${clockShort(value)} ${h >= 12 ? "PM" : "AM"}`;
}

/** First line of an address: "210 Harbor Point Dr, Hot Springs, AR" → "210 Harbor Point Dr". */
export function streetLine(address: string | null | undefined): string {
  return (address || "").split(",")[0].trim();
}

