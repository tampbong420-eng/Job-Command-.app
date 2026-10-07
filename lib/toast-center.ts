/** Isolated toast bus. Overlay only — never writes jobs, clients, crew, or hours. */

export const TOAST_EVENT = "job-command-toast";
export const TOAST_HOLD_MS = 4200;
export const TOAST_MAX = 3;

export type ToastKind = "success" | "error" | "info";

export type ToastDraft = {
  kind?: ToastKind;
  title: string;
  body?: string;
};

export type ToastItem = {
  id: string;
  kind: ToastKind;
  title: string;
  body: string;
};

export const TOAST_COPY = {
  helpOn: {
    kind: "success" as const,
    title: "Help Mode on",
    body: "Hold a button, card, or icon to see what it does. Taps still work.",
  },
  helpOff: {
    kind: "info" as const,
    title: "Help Mode off",
    body: "Holds are off. The shop behaves as usual.",
  },
  tourDone: {
    kind: "success" as const,
    title: "Tour finished",
    body: "Command, Crew, Schedule, Pay, and Company are ready. Replay it any time from Company.",
  },
  tourSkip: {
    kind: "info" as const,
    title: "Tour skipped",
    body: "Replay App Tutorial lives on Company. Live jobs were not changed.",
  },
};

function asText(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

export function messageFromUnknown(value: unknown) {
  return asText(value);
}

export function toastItemFrom(draft: ToastDraft): ToastItem | null {
  const title = asText(draft.title);
  if (!title) return null;
  return {
    id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: draft.kind === "error" || draft.kind === "info" ? draft.kind : "success",
    title: title.slice(0, 96),
    body: asText(draft.body).slice(0, 180),
  };
}

export function pushToast(draft: ToastDraft) {
  if (typeof window === "undefined") return;
  const item = toastItemFrom(draft);
  if (!item) return;
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: item }));
}

export function mergeToastStack(list: ToastItem[], next: ToastItem) {
  return [...list.filter((row) => row.title !== next.title || row.body !== next.body), next].slice(-TOAST_MAX);
}
