/** Display helpers for the answering screens. Client-safe. */
import { formatTimeLabel } from "@/lib/schedule";
import { spokenDay } from "@/lib/answering/slots";
import { prettyUs } from "@/lib/answering/forwarding";
import { OUTCOME_LABEL, parseOutcome, type CallOutcome } from "@/lib/answering/config";

export function whenLabel(at: Date | string | null | undefined, timeZone: string, now = new Date()) {
  if (!at) return "";
  const date = typeof at === "string" ? new Date(at) : at;
  if (Number.isNaN(date.getTime())) return "";
  const day = new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
  const yesterday = new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(now.getTime() - 86400000));
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(date);
  if (day === today) return `Today ${time}`;
  if (day === yesterday) return `Yesterday ${time}`;
  const short = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" }).format(date);
  return `${short}, ${time}`;
}

export function durationLabel(seconds: number) {
  const s = Math.max(0, Math.round(seconds || 0));
  if (s < 60) return `${s} sec`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest ? `${m} min ${rest} sec` : `${m} min`;
}

/** "Tuesday, October 6 · 9 AM – 10 AM" */
export function bookedLabel(date: string, start: string, end: string) {
  if (!date || !start) return "";
  return `${spokenDay(date)} · ${formatTimeLabel(start)}${end ? ` – ${formatTimeLabel(end)}` : ""}`;
}

export function chipFor(outcome: string): { label: string; tone: "booked" | "back" | "spam" } {
  const value: CallOutcome = parseOutcome(outcome);
  if (value === "BOOKED") return { label: OUTCOME_LABEL.BOOKED, tone: "booked" };
  if (value === "SPAM") return { label: OUTCOME_LABEL.SPAM, tone: "spam" };
  return { label: OUTCOME_LABEL[value], tone: "back" };
}

export function callerLabel(card: { callerName: string; callerPhone: string; fromNumber: string }) {
  return card.callerName || prettyUs(card.callerPhone || card.fromNumber) || "Unknown caller";
}

export function telLink(phone: string) {
  const digits = String(phone || "").replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : "";
}

export function mapsLink(address: string) {
  return address ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}` : "";
}
