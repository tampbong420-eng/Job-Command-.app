import { emptySiteFeed, parseSiteFeed, type SiteFeed } from "@/lib/site-feed";
import type { EstimateDTO } from "@/lib/types";

export type MaterialKind = "paint" | "wood" | "supply";

export type PrepMaterial = {
  id: string;
  label: string;
  kind: MaterialKind;
};

export type PrepState = {
  materials: Record<string, boolean>;
  durationDays?: number;
  dispatchNotes?: string;
  crew?: CrewSeat[];
  siteFeed?: SiteFeed;
  /** Active-on-job board (tasks, colors, punch list, change orders). Kept as-is; see lib/active-board.ts. */
  active?: unknown;
};

export type CrewSeat = {
  employeeId: string;
  trade: string;
};

export const FALLBACK_MATERIALS: PrepMaterial[] = [
  { id: "paint", label: "Paint purchased and staged", kind: "paint" },
  { id: "wood", label: "Wood and trim on the truck", kind: "wood" },
  { id: "supplies", label: "Tape, paper, tips, and sundries gathered", kind: "supply" },
];

const KIND_ORDER: MaterialKind[] = ["paint", "wood", "supply"];

export function classifyMaterial(description: string): MaterialKind {
  const text = description.toLowerCase();
  if (/paint|primer|stain|duration|sherwin|latex|enamel|coating/.test(text)) return "paint";
  if (/wood|trim|fascia|lumber|board|siding|cedar|pine|oak|panel/.test(text)) return "wood";
  return "supply";
}

export function materialPrepItems(estimate: EstimateDTO | null | undefined): PrepMaterial[] {
  const lines = (estimate?.lines || []).filter(
    (line) => (line.kind === "MATERIAL" || line.kind === "OTHER") && line.description.trim()
  );
  const fromBid: PrepMaterial[] = lines.map((line) => ({
    id: `line:${line.id}`,
    label: `${line.quantity} ${line.unit} · ${line.description}`.replace(/\s+/g, " ").trim(),
    kind: classifyMaterial(line.description),
  }));
  const have = new Set(fromBid.map((item) => item.kind));
  const extras = FALLBACK_MATERIALS.filter((item) => !have.has(item.kind));
  return [...fromBid, ...extras].sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.label.localeCompare(b.label)
  );
}

function emptyPrep(): PrepState {
  return { materials: {}, durationDays: 0, dispatchNotes: "", crew: [], siteFeed: emptySiteFeed() };
}

export function parsePrep(raw?: string | null): PrepState {
  try {
    const parsed = JSON.parse(raw || "{}") as {
      materials?: Record<string, boolean>;
      durationDays?: number;
      dispatchNotes?: string;
      crew?: CrewSeat[];
      siteFeed?: unknown;
      active?: unknown;
    };
    const materials = parsed.materials && typeof parsed.materials === "object" ? parsed.materials : {};
    const crew = Array.isArray(parsed.crew)
      ? parsed.crew.filter((seat) => seat && typeof seat.employeeId === "string" && seat.employeeId)
      : [];
    return {
      materials,
      durationDays: Math.max(0, Math.floor(Number(parsed.durationDays) || 0)),
      dispatchNotes: typeof parsed.dispatchNotes === "string" ? parsed.dispatchNotes : "",
      crew,
      siteFeed: parsed.siteFeed !== undefined ? parseSiteFeed(parsed.siteFeed) : emptySiteFeed(),
      ...(parsed.active !== undefined ? { active: parsed.active } : {}),
    };
  } catch {
    return emptyPrep();
  }
}

export function stringifyPrep(state: PrepState) {
  return JSON.stringify({
    materials: state.materials,
    durationDays: state.durationDays || 0,
    dispatchNotes: state.dispatchNotes || "",
    crew: state.crew || [],
    siteFeed: state.siteFeed || emptySiteFeed(),
    ...(state.active !== undefined ? { active: state.active } : {}),
  });
}

export function materialsReady(items: PrepMaterial[], state: PrepState) {
  return items.length > 0 && items.every((item) => state.materials[item.id] === true);
}

export type YellowCheckRow = {
  id: string;
  label: string;
  done: boolean;
};

/** Start date, crew, then every estimate-linked material — in that order. */
export function yellowItemStates(
  startDate: boolean,
  crewAssigned: boolean,
  items: PrepMaterial[],
  state: PrepState
): YellowCheckRow[] {
  return [
    { id: "start", label: "Start date confirmed", done: startDate === true },
    { id: "crew", label: "Crew assigned", done: crewAssigned === true },
    ...items.map((item) => ({
      id: item.id,
      label: item.label,
      done: state.materials[item.id] === true,
    })),
  ];
}

/** Light Green Active unlocks only when every Yellow row is true. */
export function yellowPrepComplete(
  startDate: boolean,
  crewAssigned: boolean,
  items: PrepMaterial[],
  state: PrepState
) {
  if (items.length === 0) return false;
  return yellowItemStates(startDate, crewAssigned, items, state).every((row) => row.done === true);
}

export function canCheckPrepItem(
  index: number,
  items: PrepMaterial[],
  state: PrepState,
  startDate: boolean,
  crewAssigned: boolean
) {
  if (!startDate || !crewAssigned) return false;
  return items.slice(0, index).every((item) => state.materials[item.id] === true);
}

function labelNeedle(item: PrepMaterial) {
  return (item.label.toLowerCase().split("·").pop() || "").trim().slice(0, 16);
}

export function applyPrepTalk(
  text: string,
  items: PrepMaterial[],
  state: PrepState,
  startDate = true,
  crewAssigned = true
): PrepState {
  const heard = text.toLowerCase();
  const allReady =
    /all (the )?materials|everything.*(bought|staged|ready|gathered)|materials are (all )?(bought|ready|staged|gathered)/.test(
      heard
    );
  const bought = /bought|purchased|got|gathered|staged|on the truck|ready|checked|have it/.test(heard);
  const next: PrepState = {
    materials: { ...state.materials },
    durationDays: state.durationDays || 0,
    dispatchNotes: state.dispatchNotes || "",
    crew: state.crew || [],
    siteFeed: state.siteFeed || emptySiteFeed(),
  };
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (next.materials[item.id] === true) continue;
    if (!canCheckPrepItem(index, items, next, startDate, crewAssigned)) break;
    const kindHit =
      (item.kind === "paint" && /paint|primer|stain/.test(heard)) ||
      (item.kind === "wood" && /wood|trim|lumber|fascia|panel/.test(heard)) ||
      (item.kind === "supply" && /suppl|tape|paper|sundry|sundries|tips/.test(heard));
    const needle = labelNeedle(item);
    const labelHit = needle.length > 3 && heard.includes(needle);
    if (allReady || (bought && (kindHit || labelHit))) next.materials[item.id] = true;
  }
  return next;
}

const MONTHS: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

export type YellowTalkHit = {
  prep: PrepState;
  startDate?: string;
  crewId?: string;
  crew?: CrewSeat[];
  durationDays?: number;
  dispatchNotes?: string;
  shiftStart?: string;
  shiftEnd?: string;
};

const DAY_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

export const CREW_TRADES = ["Lead", "Painter", "Helper", "Sprayer", "Foreman", "Carpenter"] as const;

export function inferTrade(title: string, heard = "") {
  const blob = `${title} ${heard}`.toLowerCase();
  if (/foreman|heading up|running (the )?crew|lead/.test(blob)) return "Lead";
  if (/helper|apprentice/.test(blob)) return "Helper";
  if (/spray/.test(blob)) return "Sprayer";
  if (/carpenter|wood|trim/.test(blob)) return "Carpenter";
  if (/paint/.test(blob)) return "Painter";
  return title.trim() || "Painter";
}

export function parseSpokenDuration(text: string) {
  const word = text.match(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\s*-?\s*days?\b/i);
  if (!word) return undefined;
  const raw = word[1].toLowerCase();
  const days = raw in DAY_WORDS ? DAY_WORDS[raw] : Number(raw);
  if (!Number.isFinite(days) || days < 0) return undefined;
  return Math.min(365, Math.floor(days));
}

export function parseDispatchNotes(text: string) {
  const tagged = text.match(
    /\b(?:dispatch notes?|notes?|bring|meet(?:\s+at)?|staging|park(?:ing)?)\s*[:\-]?\s*([^.]{6,180})/i
  );
  if (!tagged) return undefined;
  return tagged[0].replace(/^\s+/, "").trim();
}

function parseSpokenCrew(
  text: string,
  crew: { id: string; firstName: string; lastName: string; jobTitle?: string }[]
): CrewSeat[] {
  const heard = text.toLowerCase();
  const seats: CrewSeat[] = [];
  for (const person of crew) {
    const first = person.firstName.trim().toLowerCase();
    const last = person.lastName.trim().toLowerCase();
    const at =
      first.length > 1 && heard.includes(first)
        ? heard.indexOf(first)
        : last.length > 1 && heard.includes(last)
          ? heard.indexOf(last)
          : -1;
    if (at < 0) continue;
    const window = heard.slice(at, at + 32);
    seats.push({ employeeId: person.id, trade: inferTrade(person.jobTitle || "", window) });
  }
  return seats;
}

function parseSpokenDate(text: string, fallbackDate: string) {
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const named = text.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?\b/i
  );
  if (!named) return undefined;
  const month = MONTHS[named[1].toLowerCase()];
  const day = named[2].padStart(2, "0");
  const year = named[3] || fallbackDate.slice(0, 4);
  if (!month) return undefined;
  return `${year}-${month}-${day}`;
}

function parseSpokenShift(text: string) {
  const match = text.match(/\b(\d{1,2}:\d{2})\s*(?:to|-|–)\s*(\d{1,2}:\d{2})\b/);
  if (!match) return undefined;
  const pad = (value: string) => {
    const [h, m] = value.split(":");
    return `${h.padStart(2, "0")}:${m}`;
  };
  return { start: pad(match[1]), end: pad(match[2]) };
}

/** Voice/text intake for yellow: start date, crew, duration, dispatch notes, shift, then materials. */
export function applyYellowTalk(
  text: string,
  items: PrepMaterial[],
  state: PrepState,
  startLocked: boolean,
  crewLocked: boolean,
  crew: { id: string; firstName: string; lastName: string; jobTitle?: string }[],
  fallbackDate: string
): YellowTalkHit {
  const heard = text.toLowerCase();
  const startDate = parseSpokenDate(heard, fallbackDate);
  const shift = parseSpokenShift(heard);
  const seats = parseSpokenCrew(text, crew);
  const durationDays = parseSpokenDuration(heard);
  const dispatchNotes = parseDispatchNotes(text);
  const crewId = seats[0]?.employeeId;
  const startOk = startLocked || Boolean(startDate);
  const crewOk = crewLocked || Boolean(crewId);
  const prep = applyPrepTalk(text, items, state, startOk, crewOk);
  return {
    prep: {
      ...prep,
      durationDays: durationDays ?? prep.durationDays ?? 0,
      dispatchNotes: dispatchNotes || prep.dispatchNotes || "",
      crew: seats.length ? seats : prep.crew,
      siteFeed: prep.siteFeed || state.siteFeed || emptySiteFeed(),
    },
    startDate,
    crewId,
    crew: seats,
    durationDays,
    dispatchNotes,
    shiftStart: shift?.start,
    shiftEnd: shift?.end,
  };
}

export function scheduleDays(startDate: string, durationDays: number) {
  const days = Math.max(0, Math.min(365, Math.floor(Number(durationDays) || 0)));
  const out: string[] = [];
  const [year, month, day] = startDate.split("-").map(Number);
  if (!year || !month || !day) return out;
  for (let i = 0; i < days; i += 1) {
    out.push(new Date(Date.UTC(year, month - 1, day + i)).toISOString().slice(0, 10));
  }
  return out;
}
