import { randomUUID } from "node:crypto";
import { getDb, toStr } from "./db";

export type TimeEntry = {
  id: string;
  employee_id: string;
  clocked_in_at: string;
  clocked_out_at: string | null;
};

export type HoursSummary = {
  todaySeconds: number;
  weekSeconds: number;
  clockedInAt: string | null;
};

type TimeEntryRow = Record<string, unknown>;

function mapEntry(row: TimeEntryRow): TimeEntry {
  return {
    id: String(row.id),
    employee_id: String(row.employee_id),
    clocked_in_at: String(row.clocked_in_at),
    clocked_out_at: toStr(row.clocked_out_at),
  };
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function secondsInRange(
  entry: TimeEntry,
  rangeStart: Date,
  rangeEnd: Date,
  now: Date,
): number {
  const start = new Date(entry.clocked_in_at);
  const end = entry.clocked_out_at ? new Date(entry.clocked_out_at) : now;
  const from = Math.max(start.getTime(), rangeStart.getTime());
  const to = Math.min(end.getTime(), rangeEnd.getTime());
  return Math.max(0, Math.floor((to - from) / 1000));
}

export function listTimeEntries(employeeId: string): TimeEntry[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM time_entries
       WHERE employee_id = ?
       ORDER BY clocked_in_at DESC`,
    )
    .all(employeeId) as TimeEntryRow[];
  return rows.map(mapEntry);
}

export function getOpenTimeEntry(employeeId: string): TimeEntry | undefined {
  const row = getDb()
    .prepare(
      `SELECT * FROM time_entries
       WHERE employee_id = ? AND clocked_out_at IS NULL
       ORDER BY clocked_in_at DESC
       LIMIT 1`,
    )
    .get(employeeId) as TimeEntryRow | undefined;
  return row ? mapEntry(row) : undefined;
}

export function startTimeEntry(employeeId: string): TimeEntry {
  const open = getOpenTimeEntry(employeeId);
  if (open) return open;

  const entry: TimeEntry = {
    id: randomUUID(),
    employee_id: employeeId,
    clocked_in_at: new Date().toISOString(),
    clocked_out_at: null,
  };

  getDb()
    .prepare(
      `INSERT INTO time_entries (id, employee_id, clocked_in_at, clocked_out_at)
       VALUES (?, ?, ?, NULL)`,
    )
    .run(entry.id, entry.employee_id, entry.clocked_in_at);

  return entry;
}

export function stopOpenTimeEntry(employeeId: string): TimeEntry | undefined {
  const open = getOpenTimeEntry(employeeId);
  if (!open) return undefined;

  const clockedOutAt = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE time_entries SET clocked_out_at = ? WHERE id = ?`,
    )
    .run(clockedOutAt, open.id);

  return { ...open, clocked_out_at: clockedOutAt };
}

export function getHoursSummary(
  employeeId: string,
  now = new Date(),
): HoursSummary {
  const entries = listTimeEntries(employeeId);
  const todayStart = startOfUtcDay(now);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const weekStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);

  let todaySeconds = 0;
  let weekSeconds = 0;
  for (const entry of entries) {
    todaySeconds += secondsInRange(entry, todayStart, todayEnd, now);
    weekSeconds += secondsInRange(entry, weekStart, todayEnd, now);
  }

  const open = getOpenTimeEntry(employeeId);
  return {
    todaySeconds,
    weekSeconds,
    clockedInAt: open?.clocked_in_at ?? null,
  };
}
