/**
 * Auto theme: Light when it's bright out, Lime Industrial when it's dark.
 *
 * Signals, best first:
 *   1. Ambient light sensor (Generic Sensor API, lux). Chrome/Android only; Safari and iOS have none.
 *   2. Screen brightness from a Capacitor ScreenBrightness plugin, if the native shell has one.
 *      None is installed today, so this stays idle until one is added.
 *   3. Sunrise/sunset at the shop (computed here, no outside API; the spot comes from the shop's
 *      address via lib/shop-place.ts, else the phone's time zone), with the phone's
 *      light/dark setting (prefers-color-scheme) breaking ties in the half hour around dawn and dusk.
 * A look the user picks by hand (Lime Industrial or Light) always wins over all of these.
 *
 * Pure functions only. The browser wiring lives in hooks/use-shell-theme.tsx.
 */
import type { ShellLookId, ShellThemeId } from "@/lib/shell-theme";
import { shopPlaceFor } from "@/lib/shop-place";

export type SunSpot = { lat: number; lng: number; place: string };

/** Rough spot for a phone's time zone when the shop's location is unknown. */
const ZONE_SPOTS: Record<string, SunSpot> = {
  "America/New_York": { lat: 39.0, lng: -77.0, place: "Eastern time" },
  "America/Detroit": { lat: 42.3, lng: -83.0, place: "Eastern time" },
  "America/Chicago": { lat: 38.6, lng: -90.2, place: "Central time" },
  "America/Denver": { lat: 39.7, lng: -105.0, place: "Mountain time" },
  "America/Phoenix": { lat: 33.4, lng: -112.1, place: "Arizona time" },
  "America/Los_Angeles": { lat: 36.0, lng: -119.0, place: "Pacific time" },
  "America/Anchorage": { lat: 61.2, lng: -149.9, place: "Alaska time" },
  "Pacific/Honolulu": { lat: 21.3, lng: -157.9, place: "Hawaii time" },
  "America/Puerto_Rico": { lat: 18.4, lng: -66.1, place: "Atlantic time" },
};

/**
 * Where to compute sunrise/sunset: the shop if we know it, else the phone's time zone,
 * else a guess from the UTC offset (15° of longitude per hour).
 */
export function sunSpotFor(input: {
  shop?: SunSpot | null;
  deviceTimeZone?: string | null;
  /** Date#getTimezoneOffset(): minutes behind UTC, positive west of Greenwich. */
  offsetMinutes?: number | null;
}): SunSpot {
  if (input.shop && Number.isFinite(input.shop.lat) && Number.isFinite(input.shop.lng)) return input.shop;
  const zone = input.deviceTimeZone ? ZONE_SPOTS[input.deviceTimeZone] : undefined;
  if (zone) return zone;
  const offset = Number.isFinite(input.offsetMinutes) ? Number(input.offsetMinutes) : 0;
  return { lat: 38, lng: Math.max(-180, Math.min(180, -offset / 4)), place: "Phone time zone" };
}

/**
 * The shop's spot. NEXT_PUBLIC_SHOP_LAT / NEXT_PUBLIC_SHOP_LNG override it. Otherwise it comes from
 * the shop's own address (state or ZIP → rough spot). With no usable address this is null and the
 * caller falls back to the phone's time zone (sunSpotFor).
 */
export function shopSunSpot(env: { lat?: string; lng?: string; address?: string | null } = {}): SunSpot | null {
  const lat = Number(env.lat);
  const lng = Number(env.lng);
  if (env.lat && env.lng && Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng, place: "Shop" };
  const place = shopPlaceFor(env.address);
  if (place) return { lat: place.lat, lng: place.lng, place: place.label };
  return null;
}

// ---- Sunrise / sunset (same math as the suncalc library, sun center at -0.833°) ----

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const J1970 = 2440588;
const J2000 = 2451545;
const J0 = 0.0009;
const OBLIQUITY = RAD * 23.4397;

const toDays = (date: Date) => date.valueOf() / DAY_MS - 0.5 + J1970 - J2000;
const fromJulian = (j: number) => new Date((j + 0.5 - J1970) * DAY_MS);

export type SunTimes =
  | { kind: "normal"; sunrise: Date; sunset: Date }
  | { kind: "polar-day" }
  | { kind: "polar-night" };

/** Sunrise and sunset for the solar day nearest `date` at a spot. */
export function sunTimes(date: Date, lat: number, lng: number): SunTimes {
  const lw = RAD * -lng;
  const phi = RAD * lat;
  const n = Math.round(toDays(date) - J0 - lw / (2 * Math.PI));
  const ds = J0 + lw / (2 * Math.PI) + n;
  const M = RAD * (357.5291 + 0.98560028 * ds);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(OBLIQUITY) * Math.sin(L));
  const jNoon = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const cosW = (Math.sin(RAD * -0.833) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  if (cosW < -1) return { kind: "polar-day" };
  if (cosW > 1) return { kind: "polar-night" };
  const w = Math.acos(cosW);
  const a = J0 + (w + lw) / (2 * Math.PI) + n;
  const jSet = J2000 + a + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const jRise = jNoon - (jSet - jNoon);
  return { kind: "normal", sunrise: fromJulian(jRise), sunset: fromJulian(jSet) };
}

/** Half an hour either side of sunrise/sunset is "dusk": the phone's own light/dark setting decides. */
export const TWILIGHT_MS = 30 * 60_000;

export type Scheme = "light" | "dark" | null;

/** Light between sunrise and sunset, Lime Industrial otherwise. Near dawn/dusk the phone setting breaks the tie. */
export function sunLook(now: Date, spot: SunSpot, scheme: Scheme = null): ShellLookId {
  const times = sunTimes(now, spot.lat, spot.lng);
  if (times.kind === "polar-day") return "light";
  if (times.kind === "polar-night") return "ink";
  const t = now.valueOf();
  const rise = times.sunrise.valueOf();
  const set = times.sunset.valueOf();
  const nearEdge = Math.abs(t - rise) < TWILIGHT_MS || Math.abs(t - set) < TWILIGHT_MS;
  if (nearEdge && scheme) return scheme === "light" ? "light" : "ink";
  return t >= rise && t < set ? "light" : "ink";
}

// ---- Hysteresis for sensor readings, so a passing cloud or a shadow doesn't flip the screen ----

export type Hysteresis = { high: number; low: number; debounceMs: number };

/** Lux: full shade outdoors is ~1,000+; a lit office is ~300–500; dusk and indoors-at-night are well under 200. */
export const LUX_BANDS: Hysteresis = { high: 1000, low: 200, debounceMs: 4000 };

/** Screen brightness 0..1 (iOS auto-brightness tracks the room). Only used if a plugin provides it. */
export const BRIGHTNESS_BANDS: Hysteresis = { high: 0.7, low: 0.3, debounceMs: 4000 };

export type SensorState = { look: ShellLookId | null; pending: ShellLookId | null; since: number };

export const EMPTY_SENSOR: SensorState = { look: null, pending: null, since: 0 };

/**
 * One reading in. Above `high` wants Light, below `low` wants Lime Industrial, in between keeps
 * whatever is showing. A change only lands after it holds for `debounceMs`.
 * The very first reading lands at once (nothing to flicker from); in the dead band it uses the midpoint.
 */
export function sensorStep(state: SensorState, value: number, now: number, bands: Hysteresis): SensorState {
  if (!Number.isFinite(value)) return state;
  let want: ShellLookId | null = value >= bands.high ? "light" : value <= bands.low ? "ink" : null;
  if (!state.look) {
    if (!want) want = value >= (bands.high + bands.low) / 2 ? "light" : "ink";
    return { look: want, pending: null, since: now };
  }
  if (!want || want === state.look) return { look: state.look, pending: null, since: now };
  if (state.pending !== want) return { look: state.look, pending: want, since: now };
  if (now - state.since >= bands.debounceMs) return { look: want, pending: null, since: now };
  return state;
}

/**
 * Which look to paint. A hand-picked look always wins. Auto uses the best signal it has:
 * light sensor, then screen brightness, then sun + phone setting.
 */
export function resolveLook(input: {
  choice: ShellThemeId;
  sensor?: ShellLookId | null;
  brightness?: ShellLookId | null;
  sun?: ShellLookId | null;
}): ShellLookId {
  if (input.choice === "ink" || input.choice === "light") return input.choice;
  return input.sensor || input.brightness || input.sun || "ink";
}

/** How often Auto looks again while the app stays open. */
export const AUTO_RECHECK_MS = 3 * 60_000;
