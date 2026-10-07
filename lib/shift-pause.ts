export type PauseKind = "lunch" | "break";

export type ShiftPause = {
  kind: PauseKind;
  start: number;
  end: number | null;
};

export const LUNCH_MS = 30 * 60 * 1000;
export const BREAK_MS = 10 * 60 * 1000;

export function unpaidLunchMs(pauses: ShiftPause[], now = Date.now()) {
  let total = 0;
  for (const pause of pauses) {
    if (pause.kind !== "lunch") continue;
    // An open pause past the lunch length means the timer died (reload/unmount):
    // never deduct more than the lunch itself.
    const end = pause.end ?? Math.min(now, pause.start + LUNCH_MS);
    total += Math.max(0, end - pause.start);
  }
  return total;
}

export function unpaidLunchHours(pauses: ShiftPause[], now = Date.now()) {
  return Math.round((unpaidLunchMs(pauses, now) / 3_600_000) * 10) / 10;
}

export function paidHoursAfterLunch(
  liveHours: number,
  pauses: ShiftPause[],
  now = Date.now()
) {
  return Math.max(0, Math.round((liveHours - unpaidLunchHours(pauses, now)) * 10) / 10);
}

export function startPause(pauses: ShiftPause[], kind: PauseKind, at = Date.now()): ShiftPause[] {
  const closed = pauses.map((pause) =>
    pause.end == null ? { ...pause, end: at } : pause
  );
  return [...closed, { kind, start: at, end: null }];
}

export function endPause(pauses: ShiftPause[], kind: PauseKind, at = Date.now()): ShiftPause[] {
  return pauses.map((pause) =>
    pause.kind === kind && pause.end == null ? { ...pause, end: at } : pause
  );
}

export function activePause(pauses: ShiftPause[], kind?: PauseKind) {
  return pauses.find((pause) => pause.end == null && (!kind || pause.kind === kind)) || null;
}

export function pauseStorageKey(employeeId: string, date: string) {
  return `jc-shift-pause:${employeeId}:${date}`;
}

export function readStoredPauses(employeeId: string, date: string): ShiftPause[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(pauseStorageKey(employeeId, date));
    const parsed = raw ? (JSON.parse(raw) as ShiftPause[]) : [];
    return Array.isArray(parsed) ? parsed.filter((pause) => pause && (pause.kind === "lunch" || pause.kind === "break")) : [];
  } catch {
    return [];
  }
}

export function writeStoredPauses(employeeId: string, date: string, pauses: ShiftPause[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(pauseStorageKey(employeeId, date), JSON.stringify(pauses));
  } catch {
    /* quota */
  }
}
