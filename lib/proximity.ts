import { addCalendarDays, toDayString, todayString, weekdayIndex } from "@/lib/dates";
import { parseMinutes, toHhmm } from "@/lib/schedule";
import type { EmployeeDTO } from "@/lib/types";

export const JOB_MINUTES = 60;
export const WORK_START = 7 * 60;
export const WORK_END = 17 * 60;
export const MIN_BUFFER = 10;
export const TYPICAL_BUFFER = 15;

export type OccupiedStop = {
  jobId: string | null;
  jobName: string;
  address: string;
  startMin: number;
  endMin: number;
};

export type PackSuggestion = {
  employeeId: string;
  employeeName: string;
  date: string;
  start: string;
  end: string;
  jobMinutes: number;
  driveMinutes: number;
  bufferMinutes: number;
  originAddress: string;
  originLabel: string;
  destination: string;
  source: "google" | "osrm" | "estimate";
  reason: string;
};

export function travelBuffer(driveMinutes: number) {
  const drive = Math.max(0, Math.round(driveMinutes));
  if (drive <= TYPICAL_BUFFER) return Math.max(MIN_BUFFER, drive);
  return drive;
}

export function roundToFive(minutes: number) {
  return Math.ceil(minutes / 5) * 5;
}

function isWeekend(iso: string) {
  const day = weekdayIndex(iso);
  return day === 0 || day === 6;
}

export function occupiedStops(
  employee: EmployeeDTO,
  date: string,
  ignoreJobId?: string
): OccupiedStop[] {
  return employee.timeEntries
    .filter(
      (entry) =>
        entry.date === date &&
        entry.scheduledHours > 0 &&
        entry.jobId !== ignoreJobId
    )
    .map((entry) => {
      const startMin = parseMinutes(entry.scheduledStart || "07:00") ?? WORK_START;
      const endMin = parseMinutes(entry.scheduledEnd || "15:00") ?? startMin + JOB_MINUTES;
      return {
        jobId: entry.jobId,
        jobName: entry.job?.name || entry.job?.client || "Booked job",
        address: entry.job?.address || "",
        startMin,
        endMin: endMin > startMin ? endMin : startMin + JOB_MINUTES,
      };
    })
    .sort((a, b) => a.startMin - b.startMin);
}

function earliestToday(now: Date, date: string) {
  if (date !== todayString(now)) return WORK_START;
  const minutes = now.getHours() * 60 + now.getMinutes();
  return Math.max(WORK_START, roundToFive(minutes + 10));
}

type Gap = {
  startMin: number;
  originAddress: string;
  originLabel: string;
  afterName: string | null;
};

function gapsForDay(
  stops: OccupiedStop[],
  baseAddress: string,
  floor: number
): Gap[] {
  if (!stops.length) {
    return [
      {
        startMin: floor,
        originAddress: baseAddress,
        originLabel: "the shop",
        afterName: null,
      },
    ];
  }
  const gaps: Gap[] = [];
  const first = stops[0];
  if (floor + JOB_MINUTES + MIN_BUFFER <= first.startMin) {
    gaps.push({
      startMin: floor,
      originAddress: baseAddress,
      originLabel: "the shop",
      afterName: null,
    });
  }
  for (const stop of stops) {
    gaps.push({
      startMin: Math.max(floor, stop.endMin),
      originAddress: stop.address || baseAddress,
      originLabel: stop.jobName,
      afterName: stop.jobName,
    });
  }
  return gaps;
}

export function packDay(opts: {
  employee: EmployeeDTO;
  date: string;
  destination: string;
  baseAddress: string;
  ignoreJobId?: string;
  now: Date;
  driveMinutes: (origin: string) => number;
  driveSource?: "google" | "osrm" | "estimate";
}): PackSuggestion | null {
  const stops = occupiedStops(opts.employee, opts.date, opts.ignoreJobId);
  const floor = earliestToday(opts.now, opts.date);
  const gaps = gapsForDay(stops, opts.baseAddress, floor);

  for (const gap of gaps) {
    const drive = opts.driveMinutes(gap.originAddress || opts.baseAddress);
    const buffer = travelBuffer(drive);
    const startMin = Math.max(floor, roundToFive(gap.startMin + buffer));
    const endMin = startMin + JOB_MINUTES;
    if (endMin > WORK_END) continue;
    const blocking = stops.find((stop) => startMin < stop.endMin && endMin > stop.startMin);
    if (blocking) continue;

    const who = `${opts.employee.firstName} ${opts.employee.lastName}`.trim();
    const bufferCopy =
      buffer <= TYPICAL_BUFFER
        ? `${buffer} min travel buffer`
        : `${buffer} min drive`;
    const reason = gap.afterName
      ? `Packed after ${gap.afterName}: 1 hr visit + ${bufferCopy} from that site.`
      : `First open slot from the shop: 1 hr visit + ${bufferCopy}.`;
    return {
      employeeId: opts.employee.id,
      employeeName: who,
      date: opts.date,
      start: toHhmm(startMin),
      end: toHhmm(endMin),
      jobMinutes: JOB_MINUTES,
      driveMinutes: drive,
      bufferMinutes: buffer,
      originAddress: gap.originAddress || opts.baseAddress,
      originLabel: gap.originLabel,
      destination: opts.destination,
      source: opts.driveSource || "estimate",
      reason,
    };
  }
  return null;
}

export function suggestPackedSlot(opts: {
  employees: EmployeeDTO[];
  destination: string;
  baseAddress: string;
  employeeId?: string;
  ignoreJobId?: string;
  fromDate?: string;
  now?: Date;
  driveMinutes: (origin: string, destination: string) => number;
  driveSource?: "google" | "osrm" | "estimate";
  horizonDays?: number;
}): PackSuggestion | null {
  const now = opts.now || new Date();
  const startDate = opts.fromDate || todayString(now);
  const horizon = opts.horizonDays ?? 21;
  const ordered = [
    ...opts.employees.filter((person) => person.id === opts.employeeId),
    ...opts.employees.filter((person) => person.id !== opts.employeeId),
  ];
  if (!ordered.length) return null;

  for (let offset = 0; offset < horizon; offset += 1) {
    const date = toDayString(addCalendarDays(startDate, offset));
    if (isWeekend(date)) continue;
    for (const employee of ordered) {
      const packed = packDay({
        employee,
        date,
        destination: opts.destination,
        baseAddress: opts.baseAddress,
        ignoreJobId: opts.ignoreJobId,
        now,
        driveSource: opts.driveSource,
        driveMinutes: (origin) => opts.driveMinutes(origin, opts.destination),
      });
      if (packed) return packed;
    }
  }
  return null;
}
