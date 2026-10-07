export const PING_STALE_MS = 8 * 60 * 1000;
export const SITE_SPAN_DEG = 0.0018;

export type CrewPingDTO = {
  employeeId: string;
  name: string;
  initials: string;
  photoUrl: string | null;
  lat: number;
  lng: number;
  accuracy: number;
  at: string;
  jobId: string | null;
  stale: boolean;
};

export function crewInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

export function pingIsStale(at: string | Date, now = Date.now(), windowMs = PING_STALE_MS) {
  const stamp = at instanceof Date ? at.getTime() : new Date(at).getTime();
  if (Number.isNaN(stamp)) return true;
  return now - stamp > windowMs;
}

export function pinPercent(
  ping: { lat: number; lng: number },
  site: { lat: number; lng: number },
  span = SITE_SPAN_DEG
) {
  const x = 0.5 + (ping.lng - site.lng) / (span * 2);
  const y = 0.5 - (ping.lat - site.lat) / (span * 2);
  const left = Math.max(0.06, Math.min(0.94, x));
  const top = Math.max(0.06, Math.min(0.94, y));
  return {
    left: left * 100,
    top: top * 100,
    inside: x >= 0 && x <= 1 && y >= 0 && y <= 1,
  };
}
