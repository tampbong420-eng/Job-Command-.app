import { DEFAULT_SHOP } from "@/lib/maps";
import { mapsKey } from "@/lib/maps-server";

export type DriveLeg = {
  origin: string;
  destination: string;
  minutes: number;
  miles: number;
  source: "google" | "osrm" | "estimate";
  originCoords?: { lat: number; lng: number } | null;
  destinationCoords?: { lat: number; lng: number } | null;
};

type Coords = { lat: number; lng: number };

const geoCache = new Map<string, Coords | null>();
const driveCache = new Map<string, DriveLeg>();

function keyOf(origin: string, destination: string) {
  return `${origin.trim().toLowerCase()}→${destination.trim().toLowerCase()}`;
}

function placeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function haversineMiles(a: Coords, b: Coords) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function estimateFromMiles(miles: number): Pick<DriveLeg, "minutes" | "miles" | "source"> {
  const minutes = Math.max(8, Math.round((miles / 24) * 60) + 2);
  return { minutes, miles: Math.round(miles * 10) / 10, source: "estimate" };
}

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 4500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(init?.headers || {}),
      },
    });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function geocodeAddress(address: string): Promise<Coords | null> {
  const cleaned = address.trim();
  if (!cleaned) return null;
  const cacheKey = placeKey(cleaned);
  if (geoCache.has(cacheKey)) return geoCache.get(cacheKey) || null;

  const key = mapsKey();
  if (key) {
    const data = (await fetchJson(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(cleaned)}&key=${key}`
    )) as { status?: string; results?: { geometry?: { location?: Coords } }[] } | null;
    const loc = data?.results?.[0]?.geometry?.location;
    if (loc?.lat && loc?.lng) {
      geoCache.set(cacheKey, loc);
      return loc;
    }
  }

  const nominatim = (await fetchJson(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(cleaned)}`,
    { headers: { "User-Agent": "JobCommand/1.0 (crew-scheduling)" } },
    5000
  )) as { lat: string; lon: string }[] | null;
  const hit = nominatim?.[0];
  if (hit) {
    const coords = { lat: Number(hit.lat), lng: Number(hit.lon) };
    if (Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) {
      geoCache.set(cacheKey, coords);
      return coords;
    }
  }

  geoCache.set(cacheKey, null);
  return null;
}

async function googleDrive(origin: string, destination: string): Promise<DriveLeg | null> {
  const key = mapsKey();
  if (!key) return null;
  const data = (await fetchJson(
    `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&mode=driving&units=imperial&key=${key}`
  )) as {
    rows?: { elements?: { status?: string; duration?: { value: number }; distance?: { value: number } }[] }[];
  } | null;
  const el = data?.rows?.[0]?.elements?.[0];
  if (el?.status !== "OK" || !el.duration?.value) return null;
  return {
    origin,
    destination,
    minutes: Math.max(1, Math.round(el.duration.value / 60)),
    miles: Math.round(((el.distance?.value || 0) / 1609.34) * 10) / 10,
    source: "google",
  };
}

async function osrmDrive(origin: Coords, destination: Coords, labels: { origin: string; destination: string }) {
  const data = (await fetchJson(
    `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=false`
  )) as { routes?: { duration?: number; distance?: number }[] } | null;
  const route = data?.routes?.[0];
  if (!route?.duration) return null;
  return {
    origin: labels.origin,
    destination: labels.destination,
    minutes: Math.max(1, Math.round(route.duration / 60)),
    miles: Math.round(((route.distance || 0) / 1609.34) * 10) / 10,
    source: "osrm" as const,
    originCoords: origin,
    destinationCoords: destination,
  };
}

export async function driveTime(origin: string, destination: string): Promise<DriveLeg> {
  const from = origin.trim() || DEFAULT_SHOP;
  const to = destination.trim();
  const empty: DriveLeg = {
    origin: from,
    destination: to,
    minutes: 12,
    miles: 3,
    source: "estimate",
  };
  if (!to) return empty;
  if (!from) {
    // The shop has no address yet: no start point, so a flat estimate, but still place the site on the map.
    return { ...empty, destinationCoords: await geocodeAddress(to) };
  }
  if (placeKey(from) === placeKey(to)) {
    return { ...empty, minutes: 10, miles: 0 };
  }

  const cacheKey = keyOf(from, to);
  const cached = driveCache.get(cacheKey);
  if (cached) return cached;

  const google = await googleDrive(from, to);
  if (google) {
    const [originCoords, destinationCoords] = await Promise.all([
      geocodeAddress(from),
      geocodeAddress(to),
    ]);
    const leg = { ...google, originCoords, destinationCoords };
    driveCache.set(cacheKey, leg);
    return leg;
  }

  const [originCoords, destinationCoords] = await Promise.all([
    geocodeAddress(from),
    geocodeAddress(to),
  ]);
  if (originCoords && destinationCoords) {
    const osrm = await osrmDrive(originCoords, destinationCoords, { origin: from, destination: to });
    if (osrm) {
      driveCache.set(cacheKey, osrm);
      return osrm;
    }
    const guess = estimateFromMiles(haversineMiles(originCoords, destinationCoords));
    const leg = {
      origin: from,
      destination: to,
      ...guess,
      originCoords,
      destinationCoords,
    };
    driveCache.set(cacheKey, leg);
    return leg;
  }

  driveCache.set(cacheKey, empty);
  return empty;
}

export async function driveTimes(legs: { origin: string; destination: string }[]) {
  const unique = new Map<string, { origin: string; destination: string }>();
  for (const leg of legs) {
    unique.set(keyOf(leg.origin, leg.destination), leg);
  }
  const results = await Promise.all(
    Array.from(unique.values()).map((leg) => driveTime(leg.origin, leg.destination))
  );
  const byKey = new Map(results.map((leg) => [keyOf(leg.origin, leg.destination), leg]));
  return legs.map((leg) => byKey.get(keyOf(leg.origin, leg.destination))!);
}
