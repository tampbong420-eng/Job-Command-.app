/**
 * The Active-on-job board: today's tasks by area, paint colors on hand, the punch list,
 * and change orders. It lives in the job's existing `prepChecklist` JSON under `active`,
 * so no table change is needed and it rides the same offline job.patch queue.
 *
 * Every row carries `at` (last edit) and `gone` (soft delete) so two phones editing at once
 * merge row by row on the server instead of the last save wiping the other.
 * Crew never edit change orders and never receive their dollars (see crewSafePrep).
 */

export type TaskArea = "prep" | "prime" | "cutin" | "roll" | "trim" | "cleanup";

export const TASK_AREAS: { id: TaskArea; label: string }[] = [
  { id: "prep", label: "Prep" },
  { id: "prime", label: "Prime" },
  { id: "cutin", label: "Cut-in" },
  { id: "roll", label: "Roll" },
  { id: "trim", label: "Trim" },
  { id: "cleanup", label: "Cleanup" },
];

type Stamped = { id: string; at: string; gone?: boolean };

export type BoardTask = Stamped & { area: TaskArea; text: string; who?: string; done: boolean };
export type BoardColor = Stamped & {
  area: string;
  code: string;
  name: string;
  product: string;
  sheen: string;
  have: number;
  need: number;
};
export type BoardPunch = Stamped & { text: string; where?: string; done: boolean };
export type ChangeStatus = "asked" | "sent" | "approved" | "declined";
export type BoardChange = Stamped & {
  number: number;
  title: string;
  detail: string;
  amount: number;
  status: ChangeStatus;
  askedBy?: string;
  /** True on crew phones: the dollar amount was taken out before it left the server. */
  priceHidden?: boolean;
};

export type ActiveBoard = {
  tasks: BoardTask[];
  colors: BoardColor[];
  punch: BoardPunch[];
  changes: BoardChange[];
  /** Photos from this moment on count as “After”. */
  afterFrom?: string;
  /** Set by “Finish job → Invoice”: the work is done, the office owes the invoice (lib/guide-next.ts). */
  finishedAt?: string;
};

export type BoardRole = "ADMIN" | "CREW" | string | null | undefined;

export function emptyBoard(): ActiveBoard {
  return { tasks: [], colors: [], punch: [], changes: [] };
}

export function newId(prefix: string, now = new Date()) {
  return `${prefix}-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function text(value: unknown, max = 240) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function stampOf(row: Record<string, unknown>, index: number, prefix: string): Stamped {
  return {
    id: text(row.id, 80) || `${prefix}-${index + 1}`,
    at: text(row.at, 40) || new Date(0).toISOString(),
    ...(row.gone === true ? { gone: true } : {}),
  };
}

function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((row) => row && typeof row === "object") : [];
}

const AREA_IDS = new Set(TASK_AREAS.map((area) => area.id));
const STATUSES = new Set<ChangeStatus>(["asked", "sent", "approved", "declined"]);

export function parseBoard(raw: unknown): ActiveBoard {
  if (!raw || typeof raw !== "object") return emptyBoard();
  const bag = raw as Record<string, unknown>;
  const board: ActiveBoard = {
    tasks: rows(bag.tasks)
      .map((row, i) => ({
        ...stampOf(row, i, "task"),
        area: (AREA_IDS.has(row.area as TaskArea) ? row.area : "prep") as TaskArea,
        text: text(row.text),
        who: text(row.who, 80) || undefined,
        done: row.done === true,
      }))
      .filter((row) => row.text || row.gone),
    colors: rows(bag.colors)
      .map((row, i) => ({
        ...stampOf(row, i, "color"),
        area: text(row.area, 60),
        code: text(row.code, 24),
        name: text(row.name, 60),
        product: text(row.product, 60),
        sheen: text(row.sheen, 30),
        have: Math.max(0, num(row.have)),
        need: Math.max(0, num(row.need)),
      }))
      .filter((row) => row.code || row.name || row.gone),
    punch: rows(bag.punch)
      .map((row, i) => ({
        ...stampOf(row, i, "punch"),
        text: text(row.text),
        where: text(row.where, 60) || undefined,
        done: row.done === true,
      }))
      .filter((row) => row.text || row.gone),
    changes: rows(bag.changes)
      .map((row, i) => ({
        ...stampOf(row, i, "co"),
        number: Math.max(1, Math.floor(num(row.number)) || i + 1),
        title: text(row.title, 120),
        detail: text(row.detail),
        amount: num(row.amount),
        status: (STATUSES.has(row.status as ChangeStatus) ? row.status : "asked") as ChangeStatus,
        askedBy: text(row.askedBy, 80) || undefined,
        ...(row.priceHidden === true ? { priceHidden: true } : {}),
      }))
      .filter((row) => row.title || row.gone),
  };
  const after = text(bag.afterFrom, 40);
  if (after) board.afterFrom = after;
  const finished = text(bag.finishedAt, 40);
  if (finished) board.finishedAt = finished;
  return board;
}

function prepBag(raw: string | null | undefined): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw || "{}") as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function boardOf(prepRaw: string | null | undefined): ActiveBoard {
  return parseBoard(prepBag(prepRaw)?.active);
}

/** Put the board back into the prep JSON without touching anything else in it. */
export function putBoard(prepRaw: string | null | undefined, board: ActiveBoard) {
  const bag = prepBag(prepRaw) || {};
  return JSON.stringify({ ...bag, active: board });
}

export function live<T extends Stamped>(list: T[]) {
  return list.filter((row) => !row.gone);
}

export function upsertRow<T extends Stamped>(list: T[], row: T, now = new Date()): T[] {
  const next = { ...row, at: now.toISOString() };
  return list.some((item) => item.id === row.id)
    ? list.map((item) => (item.id === row.id ? next : item))
    : [...list, next];
}

export function dropRow<T extends Stamped>(list: T[], id: string, now = new Date()): T[] {
  return list.map((item) => (item.id === id ? { ...item, gone: true, at: now.toISOString() } : item));
}

function stampTime(row: Stamped) {
  const t = Date.parse(row.at);
  return Number.isNaN(t) ? 0 : t;
}

/** Row-by-row merge: the newer edit of each row wins, rows only one side has are kept. */
export function mergeRows<T extends Stamped>(base: T[], incoming: T[]): T[] {
  const out = new Map<string, T>();
  for (const row of base) out.set(row.id, row);
  for (const row of incoming) {
    const have = out.get(row.id);
    if (!have || stampTime(row) >= stampTime(have)) out.set(row.id, row);
  }
  return [...out.values()];
}

export function mergeBoards(base: ActiveBoard, incoming: ActiveBoard, role: BoardRole): ActiveBoard {
  const crew = role === "CREW";
  const merged: ActiveBoard = {
    tasks: mergeRows(base.tasks, incoming.tasks),
    colors: mergeRows(base.colors, incoming.colors),
    punch: mergeRows(base.punch, incoming.punch),
    // Change orders are office paperwork. Crew phones can’t add, edit, or reprice them.
    changes: crew ? base.changes : mergeRows(base.changes, incoming.changes.filter((row) => !row.priceHidden)),
  };
  const after = incoming.afterFrom || base.afterFrom;
  if (after) merged.afterFrom = after;
  const finished = incoming.finishedAt || base.finishedAt;
  if (finished) merged.finishedAt = finished;
  return merged;
}

type FeedPage = { id?: unknown };

/**
 * Server-side save of a job’s prep JSON. Keeps every other key as sent (same as before),
 * but merges the Active board and the site-page log row by row, and keeps crew out of
 * change orders. Unreadable input is passed through untouched.
 */
export function mergePrepForSave(dbRaw: string | null | undefined, incomingRaw: string, role: BoardRole) {
  const incoming = prepBag(incomingRaw);
  if (!incoming) return incomingRaw;
  const base = prepBag(dbRaw) || {};
  const out: Record<string, unknown> = { ...incoming };
  if (base.active !== undefined || incoming.active !== undefined) {
    out.active = mergeBoards(parseBoard(base.active), parseBoard(incoming.active), role);
  }
  const baseFeed = base.siteFeed as { pages?: FeedPage[] } | undefined;
  const nextFeed = incoming.siteFeed as { notes?: unknown; pages?: FeedPage[] } | undefined;
  if (baseFeed?.pages?.length && nextFeed && Array.isArray(nextFeed.pages)) {
    const seen = new Set(nextFeed.pages.map((page) => String(page.id)));
    const missing = baseFeed.pages.filter((page) => !seen.has(String(page.id)));
    out.siteFeed = { ...nextFeed, pages: [...nextFeed.pages, ...missing] };
  }
  return JSON.stringify(out);
}

/** What a crew phone receives: change orders keep their title and status, never the dollars. */
export function crewSafePrep(raw: string | null | undefined) {
  const bag = prepBag(raw);
  if (!bag || bag.active === undefined) return raw ?? undefined;
  const board = parseBoard(bag.active);
  board.changes = board.changes.map((row) => ({ ...row, amount: 0, priceHidden: true }));
  return JSON.stringify({ ...bag, active: board });
}

const EXTERIOR: Array<[TaskArea, string]> = [
  ["prep", "Pressure wash"],
  ["prep", "Scrape and sand loose paint"],
  ["prep", "Caulk gaps and cracks"],
  ["prime", "Spot-prime bare wood"],
  ["cutin", "Cut in windows and doors"],
  ["roll", "Siding coat 1"],
  ["roll", "Siding coat 2"],
  ["trim", "Fascia and soffit"],
  ["trim", "Window and door trim"],
  ["cleanup", "Wash tools, fold drops, lock up"],
];

const INTERIOR: Array<[TaskArea, string]> = [
  ["prep", "Move and cover furniture"],
  ["prep", "Patch and sand walls"],
  ["prep", "Tape and mask"],
  ["prime", "Prime the patches"],
  ["cutin", "Cut in ceilings and corners"],
  ["roll", "Walls coat 1"],
  ["roll", "Walls coat 2"],
  ["trim", "Baseboards and door casings"],
  ["cleanup", "Pull tape, clean up, put furniture back"],
];

/** The usual painting steps, so a new job starts with a real list in one tap. */
export function starterTasks(interior: boolean, now = new Date()): BoardTask[] {
  const at = now.toISOString();
  return (interior ? INTERIOR : EXTERIOR).map(([area, label], index) => ({
    id: `task-${now.getTime().toString(36)}-${index + 1}`,
    at,
    area,
    text: label,
    done: false,
  }));
}

export function taskStats(tasks: BoardTask[]) {
  const shown = live(tasks);
  const done = shown.filter((task) => task.done).length;
  const byArea = TASK_AREAS.map((area) => {
    const list = shown.filter((task) => task.area === area.id);
    return { ...area, total: list.length, done: list.filter((task) => task.done).length };
  });
  return {
    done,
    total: shown.length,
    pct: shown.length ? Math.round((done / shown.length) * 100) : 0,
    byArea,
  };
}

export function nextChangeNumber(changes: BoardChange[]) {
  return changes.reduce((max, row) => Math.max(max, row.number), 0) + 1;
}

/** Before = shot before the first clock-in. After = shot after someone picked the After tab. */
export function photoBuckets<T extends { createdAt: string }>(photos: T[], workStart?: string | null, afterFrom?: string | null) {
  const start = workStart ? Date.parse(workStart) : NaN;
  const after = afterFrom ? Date.parse(afterFrom) : NaN;
  const out = { before: [] as T[], progress: [] as T[], after: [] as T[] };
  for (const photo of photos) {
    const t = Date.parse(photo.createdAt);
    if (!Number.isNaN(after) && t >= after) out.after.push(photo);
    else if (!Number.isNaN(start) && t < start) out.before.push(photo);
    else out.progress.push(photo);
  }
  return out;
}

/** “Day 3 of 5” from the days the crew is booked on this job. */
export function workDay(input: { dates: string[]; today: string; durationDays?: number }) {
  const dates = [...new Set(input.dates.filter(Boolean))].sort();
  if (!dates.length) return null;
  const done = dates.filter((date) => date <= input.today).length;
  const of = Math.max(dates.length, input.durationDays || 0);
  if (!done) return { day: 0, of, starts: dates[0] };
  return { day: Math.min(done, of), of, starts: dates[0] };
}

/** A few Sherwin-Williams swatches the shop uses a lot, so the chip shows the real color. */
const SWATCH: Record<string, string> = {
  "SW 7006": "#eeefea",
  "SW 7005": "#edece6",
  "SW 7008": "#edeae0",
  "SW 7036": "#d1c7b8",
  "SW 7029": "#d1cbc1",
  "SW 7015": "#c2bfb8",
  "SW 6258": "#2f2f30",
  "SW 7069": "#434341",
  "SW 6244": "#2f3d4c",
  "SW 7048": "#a3a39b",
};

export function normalizeColorCode(raw: string) {
  const text = raw.toUpperCase().replace(/SHERWIN[\s-]*WILLIAMS?/g, "SW").replace(/\bS\.?\s*W\.?\b/g, "SW");
  const match = /\b(SW|BM|PPG)\s*-?\s*(\d{3,4})\b/.exec(text);
  return match ? `${match[1]} ${match[2]}` : "";
}

export function swatchFor(code: string) {
  return SWATCH[normalizeColorCode(code)] || "";
}

/** “+2 gal SW 7006 primer” lands on the matching color row, or makes a new one. */
export function addMaterial(
  colors: BoardColor[],
  add: { qty: number; code?: string; name: string },
  now = new Date()
): BoardColor[] {
  const code = add.code ? normalizeColorCode(add.code) : "";
  const name = add.name.trim();
  const wantsPrimer = /primer/i.test(name);
  const shown = live(colors);
  const byCode = code ? shown.filter((row) => normalizeColorCode(row.code) === code) : [];
  const byName = !code && name ? shown.filter((row) => row.name.toLowerCase() === name.toLowerCase()) : [];
  const pool = byCode.length ? byCode : byName;
  const match =
    pool.find((row) => wantsPrimer === /primer/i.test(`${row.area} ${row.name} ${row.product}`)) || (wantsPrimer ? null : pool[0]);
  if (match) return upsertRow(colors, { ...match, have: Math.round((match.have + add.qty) * 100) / 100 }, now);
  return upsertRow(
    colors,
    {
      id: newId("color", now),
      at: now.toISOString(),
      area: wantsPrimer ? "Primer" : "Extra",
      code,
      name: name || (wantsPrimer ? "Primer" : "Paint"),
      product: "",
      sheen: "",
      have: add.qty,
      need: 0,
    },
    now
  );
}
