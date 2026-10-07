/**
 * Where a shop is, worked out from the address it typed at sign-up (Company → Address).
 * No outside API: the state (or the ZIP's first three digits) picks a rough spot and the
 * shop's clock. Good enough for sunrise/sunset (a few minutes off at most inside a state)
 * and for "what day is it at the shop". Nothing here is tied to one shop.
 */

export type ShopState = {
  code: string;
  name: string;
  /** Rough population center of the state. */
  lat: number;
  lng: number;
  /** The time zone most of the state keeps. */
  zone: string;
};

const E = "America/New_York";
const C = "America/Chicago";
const M = "America/Denver";
const P = "America/Los_Angeles";

export const US_STATES: readonly ShopState[] = [
  { code: "AL", name: "Alabama", lat: 33.0, lng: -86.8, zone: C },
  { code: "AK", name: "Alaska", lat: 61.2, lng: -149.9, zone: "America/Anchorage" },
  { code: "AZ", name: "Arizona", lat: 33.4, lng: -111.9, zone: "America/Phoenix" },
  { code: "AR", name: "Arkansas", lat: 34.9, lng: -92.4, zone: C },
  { code: "CA", name: "California", lat: 35.5, lng: -119.4, zone: P },
  { code: "CO", name: "Colorado", lat: 39.5, lng: -105.0, zone: M },
  { code: "CT", name: "Connecticut", lat: 41.5, lng: -72.8, zone: E },
  { code: "DE", name: "Delaware", lat: 39.4, lng: -75.6, zone: E },
  { code: "DC", name: "District of Columbia", lat: 38.9, lng: -77.0, zone: E },
  { code: "FL", name: "Florida", lat: 27.8, lng: -81.6, zone: E },
  { code: "GA", name: "Georgia", lat: 33.4, lng: -84.1, zone: E },
  { code: "HI", name: "Hawaii", lat: 21.3, lng: -157.9, zone: "Pacific/Honolulu" },
  { code: "ID", name: "Idaho", lat: 43.6, lng: -116.2, zone: "America/Boise" },
  { code: "IL", name: "Illinois", lat: 41.3, lng: -88.4, zone: C },
  { code: "IN", name: "Indiana", lat: 39.8, lng: -86.3, zone: "America/Indiana/Indianapolis" },
  { code: "IA", name: "Iowa", lat: 41.9, lng: -93.4, zone: C },
  { code: "KS", name: "Kansas", lat: 38.5, lng: -97.0, zone: C },
  { code: "KY", name: "Kentucky", lat: 37.8, lng: -85.3, zone: E },
  { code: "LA", name: "Louisiana", lat: 30.7, lng: -91.5, zone: C },
  { code: "ME", name: "Maine", lat: 44.3, lng: -69.8, zone: E },
  { code: "MD", name: "Maryland", lat: 39.1, lng: -76.8, zone: E },
  { code: "MA", name: "Massachusetts", lat: 42.3, lng: -71.4, zone: E },
  { code: "MI", name: "Michigan", lat: 42.9, lng: -84.2, zone: "America/Detroit" },
  { code: "MN", name: "Minnesota", lat: 45.2, lng: -93.6, zone: C },
  { code: "MS", name: "Mississippi", lat: 32.6, lng: -89.6, zone: C },
  { code: "MO", name: "Missouri", lat: 38.4, lng: -92.2, zone: C },
  { code: "MT", name: "Montana", lat: 46.6, lng: -110.9, zone: M },
  { code: "NE", name: "Nebraska", lat: 41.2, lng: -97.4, zone: C },
  { code: "NV", name: "Nevada", lat: 36.6, lng: -115.6, zone: P },
  { code: "NH", name: "New Hampshire", lat: 43.0, lng: -71.5, zone: E },
  { code: "NJ", name: "New Jersey", lat: 40.4, lng: -74.4, zone: E },
  { code: "NM", name: "New Mexico", lat: 34.6, lng: -106.4, zone: M },
  { code: "NY", name: "New York", lat: 41.5, lng: -74.6, zone: E },
  { code: "NC", name: "North Carolina", lat: 35.6, lng: -79.4, zone: E },
  { code: "ND", name: "North Dakota", lat: 47.4, lng: -99.3, zone: C },
  { code: "OH", name: "Ohio", lat: 40.5, lng: -82.7, zone: E },
  { code: "OK", name: "Oklahoma", lat: 35.6, lng: -96.8, zone: C },
  { code: "OR", name: "Oregon", lat: 44.7, lng: -122.8, zone: P },
  { code: "PA", name: "Pennsylvania", lat: 40.5, lng: -77.0, zone: E },
  { code: "RI", name: "Rhode Island", lat: 41.8, lng: -71.4, zone: E },
  { code: "SC", name: "South Carolina", lat: 34.0, lng: -81.0, zone: E },
  { code: "SD", name: "South Dakota", lat: 43.9, lng: -98.4, zone: C },
  { code: "TN", name: "Tennessee", lat: 35.8, lng: -86.4, zone: C },
  { code: "TX", name: "Texas", lat: 30.9, lng: -97.4, zone: C },
  { code: "UT", name: "Utah", lat: 40.5, lng: -111.9, zone: M },
  { code: "VT", name: "Vermont", lat: 44.1, lng: -72.8, zone: E },
  { code: "VA", name: "Virginia", lat: 38.0, lng: -77.8, zone: E },
  { code: "WA", name: "Washington", lat: 47.3, lng: -121.6, zone: P },
  { code: "WV", name: "West Virginia", lat: 38.8, lng: -80.8, zone: E },
  { code: "WI", name: "Wisconsin", lat: 43.7, lng: -89.0, zone: C },
  { code: "WY", name: "Wyoming", lat: 42.5, lng: -107.0, zone: M },
  { code: "PR", name: "Puerto Rico", lat: 18.3, lng: -66.4, zone: "America/Puerto_Rico" },
];

const BY_CODE = new Map(US_STATES.map((state) => [state.code, state]));
const BY_NAME = [...US_STATES].sort((a, b) => b.name.length - a.name.length);

/** First three ZIP digits → state (USPS ranges). Only used when the address has no state. */
const ZIP3: readonly [number, number, string][] = [
  [6, 9, "PR"], [10, 27, "MA"], [28, 29, "RI"], [30, 38, "NH"], [39, 49, "ME"], [50, 54, "VT"],
  [55, 55, "MA"], [56, 59, "VT"], [60, 69, "CT"], [70, 89, "NJ"], [100, 149, "NY"], [150, 196, "PA"],
  [197, 199, "DE"], [200, 205, "DC"], [206, 219, "MD"], [220, 246, "VA"], [247, 268, "WV"],
  [270, 289, "NC"], [290, 299, "SC"], [300, 319, "GA"], [320, 349, "FL"], [350, 369, "AL"],
  [370, 385, "TN"], [386, 397, "MS"], [398, 399, "GA"], [400, 427, "KY"], [430, 459, "OH"],
  [460, 479, "IN"], [480, 499, "MI"], [500, 528, "IA"], [530, 549, "WI"], [550, 567, "MN"],
  [570, 577, "SD"], [580, 588, "ND"], [590, 599, "MT"], [600, 629, "IL"], [630, 658, "MO"],
  [660, 679, "KS"], [680, 693, "NE"], [700, 714, "LA"], [716, 729, "AR"], [730, 749, "OK"],
  [750, 799, "TX"], [800, 816, "CO"], [820, 831, "WY"], [832, 838, "ID"], [840, 847, "UT"],
  [850, 865, "AZ"], [870, 884, "NM"], [885, 885, "TX"], [889, 898, "NV"], [900, 961, "CA"],
  [967, 968, "HI"], [970, 979, "OR"], [980, 994, "WA"], [995, 999, "AK"],
];

export function stateForZip(zip?: string | null): ShopState | null {
  const digits = String(zip || "").match(/^\s*(\d{3})\d{2}(?:-\d{4})?\s*$/);
  if (!digits) return null;
  const prefix = Number(digits[1]);
  const hit = ZIP3.find(([lo, hi]) => prefix >= lo && prefix <= hi);
  return hit ? BY_CODE.get(hit[2]) || null : null;
}

/**
 * The state in a typed address: "118 Main St, Tulsa, OK 74103", "Tulsa OK", "Tulsa, Oklahoma",
 * or just "74103". Looks at the tail of the address so a street like "Texas Ave" doesn't count.
 */
export function stateForAddress(address?: string | null): ShopState | null {
  const raw = String(address || "").replace(/\s+/g, " ").replace(/,?\s*(USA|United States( of America)?)\.?$/i, "").trim();
  if (!raw) return null;
  const tail = raw.split(",").slice(-2).join(",");
  const code = tail.match(/(?:^|[\s,])([A-Za-z]{2})\.?(?:\s+\d{5}(?:-\d{4})?)?\s*$/);
  if (code) {
    const hit = BY_CODE.get(code[1].toUpperCase());
    // Two lowercase letters at the end ("... on") are words, not states.
    if (hit && (code[1] === code[1].toUpperCase() || /,/.test(tail))) return hit;
  }
  const lowerTail = tail.toLowerCase();
  for (const state of BY_NAME) {
    const name = state.name.toLowerCase();
    if (new RegExp(`(?:^|[\\s,])${name}(?:\\s+\\d{5}(?:-\\d{4})?)?\\s*$`).test(lowerTail)) return state;
  }
  const zip = raw.match(/(\d{5})(?:-\d{4})?\s*$/);
  return zip ? stateForZip(zip[1]) : null;
}

export type ShopPlace = {
  /** "Tulsa, OK" style label when the address has a town, else the state name. */
  label: string;
  state: string;
  lat: number;
  lng: number;
  timeZone: string;
};

/** Town, ST from an address ("118 Main St, Tulsa, OK 74103" → "Tulsa, OK"). Empty when unsure. */
export function townLine(address?: string | null): string {
  const parts = String(address || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/^(USA|United States( of America)?)$/i.test(part));
  if (parts.length < 2) {
    // "Tulsa OK 74103" with no street or commas. A bare ZIP has no town.
    const only = (parts[0] || "").replace(/(?:^|\s+)\d{5}(?:-\d{4})?$/, "").trim();
    return only && only.length <= 36 && stateForAddress(parts[0]) ? only : "";
  }
  const last = parts[parts.length - 1].replace(/\s+\d{5}(?:-\d{4})?$/, "").trim();
  const town = parts[parts.length - 2];
  if (!last) return town;
  if (/^\d/.test(town)) return last; // "118 Main St, OK 74103"
  return `${town}, ${last}`;
}

/** Where the shop is, from its address. Null when the address doesn't say. */
export function shopPlaceFor(address?: string | null): ShopPlace | null {
  const state = stateForAddress(address);
  if (!state) return null;
  return {
    label: townLine(address) || state.name,
    state: state.code,
    lat: state.lat,
    lng: state.lng,
    timeZone: state.zone,
  };
}

/** True when the runtime knows this IANA zone. */
export function isTimeZone(zone?: string | null): zone is string {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** The original painting profile: a "Painting" trade, or an older shop with no trade saved. */
export function isPaintingTrade(trade?: string | null) {
  const t = String(trade || "").trim();
  return !t || /paint/i.test(t);
}
