export type AlertKind =
  | "ESTIMATE_APPROVED"
  | "ESTIMATE_CHANGES"
  | "ESTIMATE_VIEWED"
  | "SCHEDULE_ASSIGNED"
  | "SCHEDULE_CHANGED"
  | "DISPATCH"
  | "SYNC"
  | "CALL_BOOKED"
  | "CALL_MESSAGE";

export type AlertPriority = "urgent" | "normal" | "quiet";

export type AlertDTO = {
  id: string;
  kind: AlertKind;
  priority: AlertPriority;
  title: string;
  body: string;
  href: string;
  jobId: string | null;
  employeeId: string | null;
  readAt: string | null;
  heldUntil: string | null;
  held: boolean;
  createdAt: string;
};

export function parseAlertKind(value: string): AlertKind {
  if (
    value === "ESTIMATE_APPROVED" ||
    value === "ESTIMATE_CHANGES" ||
    value === "ESTIMATE_VIEWED" ||
    value === "SCHEDULE_ASSIGNED" ||
    value === "SCHEDULE_CHANGED" ||
    value === "DISPATCH" ||
    value === "SYNC" ||
    value === "CALL_BOOKED" ||
    value === "CALL_MESSAGE"
  ) {
    return value;
  }
  return "SYNC";
}

export function parseAlertPriority(value: string): AlertPriority {
  if (value === "urgent" || value === "quiet") return value;
  return "normal";
}

export function minutesOfDay(value: string) {
  const [hours, minutes] = value.split(":").map((part) => Number(part) || 0);
  return hours * 60 + minutes;
}

export function inQuietHours(now: Date, start: string, end: string) {
  const time = now.getHours() * 60 + now.getMinutes();
  const from = minutesOfDay(start || "19:00");
  const to = minutesOfDay(end || "07:00");
  if (from === to) return false;
  if (from < to) return time >= from && time < to;
  return time >= from || time < to;
}

export function nextClock(now: Date, hhmm: string) {
  const next = new Date(now);
  const [hours, minutes] = (hhmm || "07:00").split(":").map((part) => Number(part) || 0);
  next.setHours(hours, minutes, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next;
}

export function holdUntilFor(priority: AlertPriority, now: Date, quietStart: string, quietEnd: string) {
  const quiet = inQuietHours(now, quietStart, quietEnd);
  if (priority === "urgent") return null;
  if (priority === "quiet") {
    if (quiet) return null;
    return nextClock(now, quietStart);
  }
  if (quiet) return nextClock(now, quietEnd);
  return null;
}

export function alertIsHeld(heldUntil: string | null, now = new Date()) {
  if (!heldUntil) return false;
  return new Date(heldUntil).getTime() > now.getTime();
}

export function alertKindLabel(kind: AlertKind) {
  if (kind === "ESTIMATE_APPROVED") return "Signed";
  if (kind === "ESTIMATE_CHANGES") return "Changes";
  if (kind === "ESTIMATE_VIEWED") return "Opened";
  if (kind === "SCHEDULE_ASSIGNED") return "Packed";
  if (kind === "SCHEDULE_CHANGED") return "Moved";
  if (kind === "DISPATCH") return "Dispatch";
  return "Sync";
}
