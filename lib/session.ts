import { CREW, ESTIMATES, JOBS, TIMECARDS } from "./demo-data";
import type { CrewMember, Estimate, Job, TimeCard } from "./types";

export const SHOP_KEY = "job-command-shop-v1";

export type ShopSettings = {
  shopName: string;
  account: string;
  pageAlerts: boolean;
};

export type PersistedShop = {
  jobs: Job[];
  crew: CrewMember[];
  estimates: Estimate[];
  timeCards: TimeCard[];
  employeeId: string;
  settings: ShopSettings;
};

export const DEFAULT_SETTINGS: ShopSettings = {
  shopName: "Job Command",
  account: "ERIC12345",
  pageAlerts: true,
};

export function defaultShop(): PersistedShop {
  return {
    jobs: JOBS,
    crew: CREW,
    estimates: ESTIMATES,
    timeCards: TIMECARDS,
    employeeId: CREW[0]?.id ?? "e-mike",
    settings: DEFAULT_SETTINGS,
  };
}

export function loadShop(): PersistedShop | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SHOP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedShop;
    if (!Array.isArray(parsed.jobs) || !Array.isArray(parsed.crew)) return null;
    return {
      ...defaultShop(),
      ...parsed,
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
    };
  } catch {
    return null;
  }
}

export function saveShop(shop: PersistedShop) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SHOP_KEY, JSON.stringify(shop));
}

export function clearShop() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SHOP_KEY);
}

const SERVER_SHOP = defaultShop();
let cachedRaw: string | null = null;
let cachedShop: PersistedShop = SERVER_SHOP;
const listeners = new Set<() => void>();

export function subscribeShop(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getServerShopSnapshot(): PersistedShop {
  return SERVER_SHOP;
}

export function getShopSnapshot(): PersistedShop {
  if (typeof window === "undefined") return SERVER_SHOP;
  const raw = window.localStorage.getItem(SHOP_KEY);
  if (raw === cachedRaw) return cachedShop;
  cachedRaw = raw;
  cachedShop = loadShop() ?? SERVER_SHOP;
  return cachedShop;
}

export function commitShop(shop: PersistedShop) {
  saveShop(shop);
  cachedRaw =
    typeof window === "undefined" ? null : window.localStorage.getItem(SHOP_KEY);
  cachedShop = shop;
  listeners.forEach((listener) => listener());
}

export function resetShop() {
  clearShop();
  cachedRaw = null;
  cachedShop = defaultShop();
  listeners.forEach((listener) => listener());
}
