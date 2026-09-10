import type { DaySchedule, Weekday } from "./types";

export const WEEKDAYS: Weekday[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
];

export const WEEKDAY_LABEL: Record<Weekday, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  mon: "M",
  tue: "T",
  wed: "W",
  thu: "T",
  fri: "F",
  sat: "S",
  sun: "S",
};

export function weekdayHours(
  start: string,
  end: string,
  workDays: Weekday[] = ["mon", "tue", "wed", "thu", "fri"],
): DaySchedule[] {
  const working = new Set(workDays);
  return WEEKDAYS.map((day) => ({
    day,
    start,
    end,
    off: !working.has(day),
  }));
}

export function parseMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return hours * 60 + minutes;
}

export function formatHourLabel(hhmm: string): string {
  const minutes = parseMinutes(hhmm);
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const ampm = hour24 >= 12 ? "PM" : "AM";
  const hour = hour24 % 12 || 12;
  return minute === 0
    ? `${hour} ${ampm}`
    : `${hour}:${String(minute).padStart(2, "0")} ${ampm}`;
}

export function scheduledHours(schedule: DaySchedule[]): number {
  return schedule.reduce((sum, day) => {
    if (day.off) return sum;
    return sum + Math.max(0, parseMinutes(day.end) - parseMinutes(day.start)) / 60;
  }, 0);
}

export function compactDayRange(days: Weekday[]): string {
  if (days.length === 0) return "OFF";
  if (days.length === 7) return "ALL WEEK";
  const indexes = days.map((day) => WEEKDAYS.indexOf(day));
  const consecutive = indexes.every(
    (value, index) => index === 0 || value === indexes[index - 1] + 1,
  );
  if (consecutive && indexes.length > 1) {
    const first = WEEKDAY_LABEL[WEEKDAYS[indexes[0]]].slice(0, 3).toUpperCase();
    const last = WEEKDAY_LABEL[WEEKDAYS[indexes[indexes.length - 1]]]
      .slice(0, 3)
      .toUpperCase();
    return `${first}–${last}`;
  }
  return days
    .map((day) => WEEKDAY_LABEL[day].slice(0, 3).toUpperCase())
    .join(" · ");
}

export function scheduleOverview(schedule: DaySchedule[]): string {
  const work = schedule.filter((day) => !day.off);
  if (work.length === 0) return "Off this week";
  const uniform = work.every(
    (day) => day.start === work[0].start && day.end === work[0].end,
  );
  const range = compactDayRange(work.map((day) => day.day));
  if (uniform) {
    return `${range} · ${formatHourLabel(work[0].start)}–${formatHourLabel(work[0].end)}`;
  }
  return work
    .map(
      (day) =>
        `${WEEKDAY_LABEL[day.day].slice(0, 3)} ${formatHourLabel(day.start)}–${formatHourLabel(day.end)}`,
    )
    .join(" · ");
}

export function patchDay(
  schedule: DaySchedule[],
  day: Weekday,
  patch: Partial<Omit<DaySchedule, "day">>,
): DaySchedule[] {
  return schedule.map((row) => (row.day === day ? { ...row, ...patch } : row));
}
