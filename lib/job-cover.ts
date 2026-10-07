import type { JobDTO } from "./types";

/** Mock house-front placeholders until a job has real photos (Eric, 2026-10-03). */
export const COVER_PLACEHOLDERS = [
  "/placeholders/house-1.jpg",
  "/placeholders/house-2.jpg",
  "/placeholders/house-3.jpg",
  "/placeholders/house-4.jpg",
] as const;

/** Deterministic mock house per job so each card keeps its own placeholder. */
export function placeholderForJob(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return COVER_PLACEHOLDERS[h % COVER_PLACEHOLDERS.length];
}

export type JobCoverPick = { url: string; isPhoto: boolean };

/**
 * v1 auto-cover (Eric, 2026-10-03): the OLDEST job photo wins automatically —
 * that's the front-of-house shot from the bid visit (photos arrive newest
 * first, so it's the last in the array). A mock house-front fills in until
 * photos exist. AI front-of-home picking (best shot out of the stack) is next.
 */
export function coverForJob(job: Pick<JobDTO, "id" | "photos">): JobCoverPick {
  const oldest = job.photos.length ? job.photos[job.photos.length - 1] : undefined;
  if (oldest?.url) return { url: oldest.url, isPhoto: true };
  return { url: placeholderForJob(job.id), isPhoto: false };
}
