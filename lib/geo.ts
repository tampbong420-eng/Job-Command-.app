import type { GeoPoint } from "./types";

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in miles. */
export function milesBetween(from: GeoPoint, to: GeoPoint): number {
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) *
      Math.cos(toRad(to.lat)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function formatMiles(miles: number | null | undefined): string {
  if (miles == null || !Number.isFinite(miles)) return "—";
  if (miles < 0.1) return `${Math.round(miles * 5280)} ft`;
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

export function etaFromMiles(miles: number | null | undefined): string {
  if (miles == null || !Number.isFinite(miles)) return "—";
  const minutes = Math.max(1, Math.round((miles / 22) * 60));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
