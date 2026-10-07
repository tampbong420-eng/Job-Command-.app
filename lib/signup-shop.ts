/**
 * Shop profile saved by the new signup (AppSettings "signup v2" columns).
 * Pure + client-safe: the server maps a row with `shopProfileFromRow`, the
 * signup builds the patch with `shopProfilePatch`.
 */

export const WORK_DAYS = [
  { id: "MON_FRI", label: "Mon–Fri" },
  { id: "MON_SAT", label: "Mon–Sat" },
  { id: "EVERY_DAY", label: "Every day" },
] as const;
export type WorkDaysId = (typeof WORK_DAYS)[number]["id"];

export const RADIUS_CHOICES = [15, 30, 50, 75] as const;

export type ShopProfileDTO = {
  tradeLabel: string;
  services: string[];
  serviceRadiusMi: number;
  workDays: WorkDaysId;
  workStart: string;
  workEnd: string;
  laborRate: number;
  materialsMarkup: number;
  estimateValidDays: number;
  tradeDefaults: { choice: string; extras: Record<string, number> };
  licenseNumber: string;
  insuranceCarrier: string;
  laterDone: string[];
  /** Google review link (https only), sent to the customer after the first paid job. */
  reviewLink: string;
};

export const BLANK_SHOP_PROFILE: ShopProfileDTO = {
  tradeLabel: "",
  services: [],
  serviceRadiusMi: 30,
  workDays: "MON_FRI",
  workStart: "07:00",
  workEnd: "17:00",
  laborRate: 0,
  materialsMarkup: 20,
  estimateValidDays: 30,
  tradeDefaults: { choice: "", extras: {} },
  licenseNumber: "",
  insuranceCarrier: "",
  laterDone: [],
  reviewLink: "",
};

function str(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = Math.round(num(value, fallback));
  return Math.min(max, Math.max(min, n));
}

export function parseWorkDays(value: unknown): WorkDaysId {
  return WORK_DAYS.some((item) => item.id === value) ? (value as WorkDaysId) : "MON_FRI";
}

export function cleanClock(value: unknown, fallback: string) {
  const text = str(value).trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!match) return fallback;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return fallback;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function parseJsonList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  try {
    const parsed = JSON.parse(str(value) || "[]");
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function parseTradeDefaults(value: unknown): ShopProfileDTO["tradeDefaults"] {
  let raw: unknown = value;
  if (typeof value === "string") {
    try {
      raw = JSON.parse(value || "{}");
    } catch {
      raw = {};
    }
  }
  const obj = (raw && typeof raw === "object" ? raw : {}) as { choice?: unknown; extras?: unknown };
  const extras: Record<string, number> = {};
  if (obj.extras && typeof obj.extras === "object") {
    for (const [key, val] of Object.entries(obj.extras as Record<string, unknown>)) {
      const n = Number(val);
      if (key && Number.isFinite(n)) extras[key.slice(0, 40)] = n;
    }
  }
  return { choice: str(obj.choice).slice(0, 40), extras };
}

/** Server side: AppSettings row (any shape, older Prisma clients included) → DTO. */
export function shopProfileFromRow(row: unknown): ShopProfileDTO {
  const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
  return {
    tradeLabel: str(r.tradeLabel),
    services: parseJsonList(r.services),
    serviceRadiusMi: clampInt(r.serviceRadiusMi, 0, 500, 30),
    workDays: parseWorkDays(r.workDays),
    workStart: cleanClock(r.workStart, "07:00"),
    workEnd: cleanClock(r.workEnd, "17:00"),
    laborRate: Math.max(0, num(r.laborRate, 0)),
    materialsMarkup: clampInt(r.materialsMarkup, 0, 300, 20),
    estimateValidDays: clampInt(r.estimateValidDays, 1, 365, 30),
    tradeDefaults: parseTradeDefaults(r.tradeDefaults),
    licenseNumber: str(r.licenseNumber),
    insuranceCarrier: str(r.insuranceCarrier),
    laterDone: parseJsonList(r.laterDone),
    reviewLink: cleanReviewLink(str(r.reviewLink)),
  };
}

export type ShopProfileInput = Partial<ShopProfileDTO>;

/** Clean what the signup sends into the exact columns Prisma writes. */
export function shopProfilePatch(input: ShopProfileInput) {
  const patch: Record<string, string | number> = {};
  if (input.tradeLabel !== undefined) patch.tradeLabel = str(input.tradeLabel).trim().slice(0, 60);
  if (input.services !== undefined) patch.services = JSON.stringify(parseJsonList(input.services).slice(0, 40));
  if (input.serviceRadiusMi !== undefined) patch.serviceRadiusMi = clampInt(input.serviceRadiusMi, 0, 500, 30);
  if (input.workDays !== undefined) patch.workDays = parseWorkDays(input.workDays);
  if (input.workStart !== undefined) patch.workStart = cleanClock(input.workStart, "07:00");
  if (input.workEnd !== undefined) patch.workEnd = cleanClock(input.workEnd, "17:00");
  if (input.laborRate !== undefined) patch.laborRate = Math.max(0, Math.min(100000, num(input.laborRate, 0)));
  if (input.materialsMarkup !== undefined) patch.materialsMarkup = clampInt(input.materialsMarkup, 0, 300, 20);
  if (input.estimateValidDays !== undefined) patch.estimateValidDays = clampInt(input.estimateValidDays, 1, 365, 30);
  if (input.tradeDefaults !== undefined) patch.tradeDefaults = JSON.stringify(parseTradeDefaults(input.tradeDefaults));
  if (input.licenseNumber !== undefined) patch.licenseNumber = str(input.licenseNumber).trim().slice(0, 60);
  if (input.insuranceCarrier !== undefined) patch.insuranceCarrier = str(input.insuranceCarrier).trim().slice(0, 80);
  if (input.laterDone !== undefined) patch.laterDone = JSON.stringify(parseJsonList(input.laterDone).slice(0, 40));
  if (input.reviewLink !== undefined) patch.reviewLink = cleanReviewLink(str(input.reviewLink));
  return patch;
}

/** Only an https link (g.page, google.com, maps.app.goo.gl, or any https URL the owner pastes). */
export function cleanReviewLink(value: string) {
  const text = value.trim().slice(0, 300);
  if (!text) return "";
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" || !url.hostname.includes(".")) return "";
    return url.toString();
  } catch {
    return "";
  }
}

/** Drop any key the running Prisma client doesn't know yet (old client = skip, never crash). */
export function onlyKnownColumns<T extends Record<string, unknown>>(patch: T, known: readonly string[]) {
  const allowed = new Set(known);
  return Object.fromEntries(Object.entries(patch).filter(([key]) => allowed.has(key))) as Partial<T>;
}

export function formatClock(value: string) {
  const [h, m] = cleanClock(value, "07:00").split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}
