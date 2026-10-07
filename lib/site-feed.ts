import { todayString } from "@/lib/dates";
export type SitePageKind = "note" | "page" | "instruction";

export type SitePage = {
  id: string;
  at: string;
  kind: SitePageKind;
  text: string;
};

export type SiteFeed = {
  notes: string;
  pages: SitePage[];
};

export function emptySiteFeed(): SiteFeed {
  return { notes: "", pages: [] };
}

function asKind(value: unknown): SitePageKind {
  if (value === "page" || value === "instruction") return value;
  return "note";
}

export function parseSiteFeed(raw: unknown): SiteFeed {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return emptySiteFeed();
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      return { notes: trimmed, pages: [] };
    }
  }
  if (!parsed || typeof parsed !== "object") return emptySiteFeed();
  const bag = parsed as { siteFeed?: unknown; notes?: unknown; pages?: unknown };
  const inner =
    bag.siteFeed && typeof bag.siteFeed === "object"
      ? (bag.siteFeed as { notes?: unknown; pages?: unknown })
      : bag;
  const notes = typeof inner.notes === "string" ? inner.notes : "";
  const pages = Array.isArray(inner.pages)
    ? inner.pages
        .filter((row) => row && typeof row === "object")
        .map((row, index) => {
          const item = row as { id?: unknown; at?: unknown; kind?: unknown; text?: unknown };
          const text = typeof item.text === "string" ? item.text.trim() : "";
          if (!text) return null;
          return {
            id: typeof item.id === "string" && item.id ? item.id : `page-${index + 1}`,
            at: typeof item.at === "string" && item.at ? item.at : new Date(0).toISOString(),
            kind: asKind(item.kind),
            text,
          };
        })
        .filter((row): row is SitePage => Boolean(row))
    : [];
  return { notes, pages };
}

export function mergeSiteFeedIntoPrep(raw: string | null | undefined, feed: SiteFeed) {
  let bag: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(raw || "{}") as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      bag = { ...(parsed as Record<string, unknown>) };
    }
  } catch {
    bag = {};
  }
  bag.siteFeed = {
    notes: feed.notes,
    pages: feed.pages,
  };
  return JSON.stringify(bag);
}

export function appendSitePage(feed: SiteFeed, kind: SitePageKind, text: string, at = new Date().toISOString()): SiteFeed {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return feed;
  const page: SitePage = {
    id: `page-${Math.abs(Date.parse(at) || Date.now())}-${feed.pages.length + 1}`,
    at,
    kind,
    text: clean,
  };
  return { notes: feed.notes, pages: [page, ...feed.pages] };
}

export function editSitePage(feed: SiteFeed, id: string, text: string): SiteFeed {
  const clean = text.replace(/\s+/g, " ").trim();
  return {
    notes: feed.notes,
    pages: feed.pages
      .map((page) => (page.id === id ? { ...page, text: clean } : page))
      .filter((page) => page.text.length > 0),
  };
}

export function setSiteNotes(feed: SiteFeed, notes: string): SiteFeed {
  return { notes, pages: feed.pages };
}

export type SiteWorker = {
  employeeId: string;
  firstName: string;
  lastName: string;
  live: boolean;
  clockedOut: boolean;
  elsewhere: boolean;
  hours: number;
};

type RosterEntry = {
  jobId: string | null;
  date: string;
  scheduledHours: number;
  actualHours: number;
  clockIn: string | null;
  clockOut: string | null;
};

type RosterPerson = {
  id: string;
  firstName: string;
  lastName: string;
  timeEntries: RosterEntry[];
};

export function liveHoursOnJob(
  entry: Pick<RosterEntry, "date" | "actualHours" | "clockIn" | "clockOut"> | null | undefined,
  now: Date
) {
  if (!entry) return 0;
  const today = todayString(now);
  if (entry.clockIn && !entry.clockOut && entry.date === today) {
    const start = new Date(entry.clockIn).getTime();
    if (!Number.isFinite(start)) return Math.round((entry.actualHours || 0) * 10) / 10;
    return Math.round(Math.max(0, (now.getTime() - start) / 3_600_000) * 10) / 10;
  }
  return Math.round((entry.actualHours || 0) * 10) / 10;
}

/** Assigned yellow crew plus anyone punched or scheduled on this job today. */
export function buildSiteRoster(
  employees: RosterPerson[],
  jobId: string,
  assignedIds: string[],
  today: string,
  now: Date
): SiteWorker[] {
  const assigned = new Set(assignedIds.filter(Boolean));
  const rows: SiteWorker[] = [];
  for (const person of employees) {
    const todayRows = person.timeEntries.filter((entry) => entry.date === today);
    const onJob = todayRows.find((entry) => entry.jobId === jobId) || null;
    const liveHere = Boolean(onJob?.clockIn && !onJob.clockOut);
    const liveOther = todayRows.some(
      (entry) => entry.jobId !== jobId && entry.clockIn && !entry.clockOut
    );
    const scheduledHere = person.timeEntries.some(
      (entry) => entry.jobId === jobId && entry.scheduledHours > 0
    );
    if (!assigned.has(person.id) && !onJob && !scheduledHere) continue;
    rows.push({
      employeeId: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      live: liveHere,
      clockedOut: Boolean(onJob?.clockOut),
      elsewhere: !liveHere && liveOther,
      hours: liveHoursOnJob(onJob, now),
    });
  }
  return rows.sort((a, b) => {
    if (a.live !== b.live) return a.live ? -1 : 1;
    return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
  });
}
