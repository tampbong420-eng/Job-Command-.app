import type { EstimateStatus } from "@/lib/types";

export function photoBadge(count: number) {
  if (count <= 0) return "";
  return count === 1 ? "1 photo" : `${count} photos`;
}

export function stripThumbs<T>(photos: T[], max = 4) {
  const shown = photos.slice(0, Math.max(0, max));
  return { shown, extra: Math.max(0, photos.length - shown.length) };
}

export function keepPendingPhotos<T extends { id: string }>(server: T[], ...groups: T[][]): T[] {
  const seen = new Set(server.map((photo) => photo.id));
  const pending: T[] = [];
  for (const group of groups) {
    for (const photo of group) {
      if (seen.has(photo.id)) continue;
      seen.add(photo.id);
      pending.push(photo);
    }
  }
  return [...pending, ...server];
}

export function shouldAutoFillEstimate(status?: EstimateStatus | string | null) {
  return !status || status === "DRAFT" || status === "CHANGES";
}
