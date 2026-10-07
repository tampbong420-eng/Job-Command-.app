/**
 * Minutes metering for the $59/mo answering add-on (200 AI minutes per shop per month). Pure rules only;
 * the database side lives in lib/answering/store.ts.
 */
import {
  ANSWERING_HARD_CEILING_MINUTES,
  ANSWERING_MINUTES_CAP,
  FULL_CALL_MAX_MS,
  MESSAGE_CALL_MAX_MS,
  type AnswerMode,
} from "@/lib/answering/config";

/** YYYY-MM on the shop's calendar (a call at 11:30 PM on the 31st counts in that month, not UTC's). */
export function usageMonth(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(now);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${pick("year")}-${pick("month")}`;
}

/** Billable seconds for one call: from Retell's duration_ms, else the start/end timestamps. Never negative. */
export function callSeconds(input: { durationMs?: number | null; startMs?: number | null; endMs?: number | null }) {
  const raw =
    typeof input.durationMs === "number" && input.durationMs > 0
      ? input.durationMs
      : input.startMs && input.endMs && input.endMs > input.startMs
        ? input.endMs - input.startMs
        : 0;
  return Math.max(0, Math.ceil(raw / 1000));
}

export type CapState = {
  usedSeconds: number;
  usedMinutes: number; // rounded up, what the screen shows
  capMinutes: number;
  leftMinutes: number;
  percent: number; // 0..100 (clamped)
  overCap: boolean;
  overCeiling: boolean;
};

export function capState(usedSeconds: number, capMinutes = ANSWERING_MINUTES_CAP, ceilingMinutes = ANSWERING_HARD_CEILING_MINUTES): CapState {
  const used = Math.max(0, Math.floor(usedSeconds || 0));
  const cap = Math.max(1, Math.floor(capMinutes || ANSWERING_MINUTES_CAP));
  const usedMinutes = Math.ceil(used / 60);
  return {
    usedSeconds: used,
    usedMinutes,
    capMinutes: cap,
    leftMinutes: Math.max(0, cap - usedMinutes),
    percent: Math.min(100, Math.round((used / (cap * 60)) * 100)),
    overCap: used >= cap * 60,
    overCeiling: used >= Math.max(cap, ceilingMinutes) * 60,
  };
}

export type CallPlan = {
  mode: AnswerMode;
  reject: boolean;
  maxCallMs: number;
  reason: "ok" | "cap" | "addon_off" | "ai_off" | "ceiling";
};

/**
 * What the next call gets. Full AI (can book) only when the add-on is paid, answering is switched on, and the
 * month is under the cap. Otherwise the AI only takes a message (voicemail-style, short). Past the hard
 * ceiling the call is declined so a spam flood can't run up the bill.
 */
export function planCall(input: { addonActive: boolean; enabled: boolean; usedSeconds: number; capMinutes?: number }): CallPlan {
  const cap = capState(input.usedSeconds, input.capMinutes);
  if (cap.overCeiling) return { mode: "message", reject: true, maxCallMs: 0, reason: "ceiling" };
  if (!input.addonActive) return { mode: "message", reject: false, maxCallMs: MESSAGE_CALL_MAX_MS, reason: "addon_off" };
  if (!input.enabled) return { mode: "message", reject: false, maxCallMs: MESSAGE_CALL_MAX_MS, reason: "ai_off" };
  if (cap.overCap) return { mode: "message", reject: false, maxCallMs: MESSAGE_CALL_MAX_MS, reason: "cap" };
  return { mode: "full", reject: false, maxCallMs: FULL_CALL_MAX_MS, reason: "ok" };
}
