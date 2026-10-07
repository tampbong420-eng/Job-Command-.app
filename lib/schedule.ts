export function parseMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function toHhmm(minutes: number): string {
  const wrapped = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(wrapped / 60);
  const mins = wrapped % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function hoursBetween(start: string, end: string): number {
  const from = parseMinutes(start);
  const to = parseMinutes(end);
  if (from == null || to == null) return 0;
  let delta = to - from;
  if (delta <= 0) delta += 24 * 60;
  return Math.round((delta / 60) * 10) / 10;
}

export function hoursOnDay(
  entries: Array<{
    date: string;
    scheduledStart?: string | null;
    scheduledEnd?: string | null;
    scheduledHours?: number;
    notes?: string | null;
  }>,
  iso: string
): number {
  const rows = entries.filter((item) => item.date === iso && !item.notes?.startsWith("absence:"));
  let total = 0;
  let timed = false;
  for (const entry of rows) {
    if (!entry.scheduledStart || !entry.scheduledEnd || entry.scheduledStart === entry.scheduledEnd) continue;
    total += hoursBetween(entry.scheduledStart, entry.scheduledEnd);
    timed = true;
  }
  if (timed) return Math.round(total * 10) / 10;
  return rows.find((item) => (item.scheduledHours || 0) > 0)?.scheduledHours ?? 0;
}

export function addHoursToTime(start: string, hours: number): string {
  const from = parseMinutes(start) ?? 7 * 60;
  return toHhmm(from + Math.round(hours * 60));
}

export function defaultShift(hours = 8): { start: string; end: string } {
  return { start: "07:00", end: addHoursToTime("07:00", hours || 8) };
}

export function inferShift(
  scheduledHours: number,
  start?: string | null,
  end?: string | null
): { start: string | null; end: string | null } {
  if (start && end) return { start, end };
  if (scheduledHours <= 0) return { start: null, end: null };
  const fallback = defaultShift(scheduledHours);
  return {
    start: start || fallback.start,
    end: end || fallback.end,
  };
}

export function formatTimeLabel(value: string | null): string {
  if (!value) return "—";
  const minutes = parseMinutes(value);
  if (minutes == null) return value;
  const hour24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const hour12 = ((hour24 + 11) % 12) + 1;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  return mins === 0 ? `${hour12} ${suffix}` : `${hour12}:${String(mins).padStart(2, "0")} ${suffix}`;
}

export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  const a0 = parseMinutes(aStart);
  const a1 = parseMinutes(aEnd);
  const b0 = parseMinutes(bStart);
  const b1 = parseMinutes(bEnd);
  if (a0 == null || a1 == null || b0 == null || b1 == null) return false;
  const aEndMin = a1 > a0 ? a1 : a1 + 24 * 60;
  const bEndMin = b1 > b0 ? b1 : b1 + 24 * 60;
  return a0 < bEndMin && b0 < aEndMin;
}

export type DaySlot = {
  entryId?: string;
  employeeId: string;
  employeeName: string;
  jobId: string | null;
  jobName: string;
  address: string;
  start: string | null;
  end: string | null;
};

export type CrewSlotStatus = {
  state: "open" | "conflict" | "same";
  message: string;
  slots: DaySlot[];
};

function entrySlot(
  employee: { id: string; firstName: string; lastName: string },
  entry: {
    id?: string;
    jobId: string | null;
    scheduledStart: string | null;
    scheduledEnd: string | null;
    job: { name: string; client: string; address?: string } | null;
  }
): DaySlot {
  return {
    entryId: entry.id,
    employeeId: employee.id,
    employeeName: `${employee.firstName} ${employee.lastName}`.trim(),
    jobId: entry.jobId,
    jobName: entry.job?.name || entry.job?.client || "Booked job",
    address: entry.job?.address || "",
    start: entry.scheduledStart,
    end: entry.scheduledEnd,
  };
}

export function dayBoard(
  employees: {
    id: string;
    firstName: string;
    lastName: string;
    timeEntries: {
      id?: string;
      date: string;
      scheduledHours: number;
      scheduledStart: string | null;
      scheduledEnd: string | null;
      jobId: string | null;
      job: { name: string; client: string; address?: string } | null;
    }[];
  }[],
  date: string
): DaySlot[] {
  return employees.flatMap((person) =>
    person.timeEntries
      .filter((entry) => entry.date === date && entry.scheduledHours > 0)
      .map((entry) => entrySlot(person, entry))
  );
}

export function checkCrewSlot(
  employees: {
    id: string;
    firstName: string;
    lastName: string;
    timeEntries: {
      id?: string;
      date: string;
      scheduledHours: number;
      scheduledStart: string | null;
      scheduledEnd: string | null;
      jobId: string | null;
      job: { name: string; client: string; address?: string } | null;
    }[];
  }[],
  opts: {
    employeeId: string;
    date: string;
    start: string;
    end: string;
    jobId: string;
  }
): CrewSlotStatus {
  const slots = dayBoard(employees, opts.date);
  const person = employees.find((row) => row.id === opts.employeeId);
  const who = person ? person.firstName : "That crew";
  const mine = slots.filter((slot) => slot.employeeId === opts.employeeId);
  const same = mine.find((slot) => slot.jobId === opts.jobId);
  const overlap = mine.find((slot) => {
    if (slot.jobId === opts.jobId) return false;
    const bookedStart = slot.start || "07:00";
    const bookedEnd = slot.end || "15:00";
    return rangesOverlap(opts.start, opts.end, bookedStart, bookedEnd);
  });

  if (overlap) {
    return {
      state: "conflict",
      message: `Conflict: ${who} is on ${overlap.jobName} ${formatRangeLabel(overlap.start, overlap.end)}. Pack after that visit or pick another crew.`,
      slots,
    };
  }

  if (same) {
    return {
      state: "same",
      message: `${who} already has this visit ${formatRangeLabel(same.start, same.end)}. Save will update the slot.`,
      slots,
    };
  }

  if (!mine.length) {
    return {
      state: "open",
      message: `${who} is free ${formatRangeLabel(opts.start, opts.end)}.`,
      slots,
    };
  }

  return {
    state: "open",
    message: `${who} can take this after ${mine.map((slot) => `${slot.jobName} ${formatRangeLabel(slot.start, slot.end)}`).join(", ")}.`,
    slots,
  };
}

export function formatRangeLabel(start: string | null, end: string | null): string {
  if (!start || !end) return "Off";
  const from = parseMinutes(start);
  const to = parseMinutes(end);
  if (from == null || to == null) return `${start}–${end}`;
  const short = (total: number) => {
    const hour24 = Math.floor(total / 60);
    const hour12 = ((hour24 + 11) % 12) + 1;
    return String(hour12);
  };
  return `${short(from)}–${short(to)}`;
}

export function formatRangeClock(start: string | null, end: string | null): string {
  if (!start || !end) return "Off";
  return `${formatTimeLabel(start)} – ${formatTimeLabel(end)}`;
}

export type CrewDayStatus = {
  employeeId: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  state: "free" | "busy" | "onThisJob";
  otherJobName?: string;
  start: string | null;
  end: string | null;
  label: string;
};

type CrewBoardPerson = Parameters<typeof checkCrewSlot>[0][number] & { jobTitle?: string };

function personTitle(person: CrewBoardPerson) {
  return person.jobTitle?.trim() || "";
}

function overlapOnOtherJob(
  employees: CrewBoardPerson[],
  opts: { employeeId: string; date: string; start: string; end: string; jobId: string }
) {
  return dayBoard(employees, opts.date).find((slot) => {
    if (slot.employeeId !== opts.employeeId) return false;
    if (slot.jobId === opts.jobId) return false;
    return rangesOverlap(opts.start, opts.end, slot.start || "07:00", slot.end || "15:00");
  });
}

export function crewAvailability(
  employees: CrewBoardPerson[],
  opts: { date: string; start: string; end: string; jobId: string }
): CrewDayStatus[] {
  return employees.map((person) => {
    const mine = dayBoard(employees, opts.date).filter((slot) => slot.employeeId === person.id);
    const onThis = mine.find((slot) => slot.jobId === opts.jobId);
    const overlap = overlapOnOtherJob(employees, { ...opts, employeeId: person.id });
    if (overlap) {
      return {
        employeeId: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        jobTitle: personTitle(person),
        state: "busy" as const,
        otherJobName: overlap.jobName,
        start: overlap.start,
        end: overlap.end,
        label: `Busy · ${formatRangeClock(overlap.start, overlap.end)} · ${overlap.jobName}`,
      };
    }
    if (onThis) {
      return {
        employeeId: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        jobTitle: personTitle(person),
        state: "onThisJob" as const,
        start: onThis.start,
        end: onThis.end,
        label: `On this job · ${formatRangeClock(onThis.start, onThis.end)}`,
      };
    }
    return {
      employeeId: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      jobTitle: personTitle(person),
      state: "free" as const,
      start: null,
      end: null,
      label: "Available",
    };
  });
}

export function personBusyOnDates(
  employees: CrewBoardPerson[],
  opts: { employeeId: string; dates: string[]; start: string; end: string; jobId: string }
) {
  for (const date of opts.dates) {
    const overlap = overlapOnOtherJob(employees, { ...opts, date });
    if (overlap) return overlap;
  }
  return null;
}
