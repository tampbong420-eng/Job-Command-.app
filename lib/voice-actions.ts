/**
 * AI helper chips: turn one spoken sentence on the Active page into a short list of
 * actions the boss (or crew) confirms. Nothing here saves — OneMic shows the chips and only
 * runs the checked ones after Confirm.
 *
 *   “Add 2 gallons SW 7006 primer and Casey left at 3”
 *     → + 2 gal SW 7006 primer → Materials
 *     → Casey Quinn clock-out 3:00 PM → Hours
 */
import { normalizeColorCode, TASK_AREAS, type TaskArea } from "@/lib/active-board";
import { parseHoursTalk } from "@/lib/hours-talk";

export type VoicePerson = { id: string; firstName: string; lastName: string };

export type VoiceCtx = {
  crew: VoicePerson[];
  role: "office" | "crew";
  selfId?: string | null;
  tasks?: { id: string; text: string; done: boolean }[];
};

type Base = { id: string; label: string; dest: string; detail?: string; blocked?: string };

export type VoiceAction = Base &
  (
    | { kind: "material"; qty: number; unit: string; code: string; name: string }
    | { kind: "clock-at"; employeeId: string; name: string; action: "IN" | "OUT"; at: string }
    | { kind: "clock"; employeeId: string; name: string; action: "IN" | "OUT" }
    | { kind: "hours"; employeeId: string; name: string; hours: number }
    | { kind: "task"; text: string; area: TaskArea }
    | { kind: "task-done"; taskId: string; text: string }
    | { kind: "punch"; text: string }
    | { kind: "page"; text: string }
    | { kind: "note"; text: string }
    | { kind: "photo" }
    | { kind: "change"; title: string; amount: number }
  );

const SMALL: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  couple: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

const MINUTES: Record<string, number> = { fifteen: 15, thirty: 30, "forty-five": 45, "forty five": 45 };

function clean(value: string) {
  return value.replace(/\s+/g, " ").replace(/^[\s:,\-–]+/, "").replace(/[\s.,;!]+$/, "").trim();
}

function cap(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function fullName(person: VoicePerson) {
  return `${person.firstName} ${person.lastName}`.trim();
}

/** “3”, “3:30”, “three thirty”, “noon”, “7 am”. Work-day guess when am/pm is missing. */
export function parseSpokenTime(raw: string): string | null {
  const text = raw.toLowerCase().replace(/\./g, "").trim();
  if (/\bnoon\b/.test(text)) return "12:00";
  const ampm = /\b(am|pm|a m|p m|in the morning|this morning|this afternoon|tonight)\b/.exec(text)?.[1] || "";
  let hour: number | null = null;
  let minute = 0;
  const digits = /\b(\d{1,2})(?::(\d{2})|\s(\d{2})\b)?/.exec(text);
  if (digits) {
    hour = Number(digits[1]);
    minute = Number(digits[2] || digits[3] || 0);
  } else {
    const word = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?:\s+(fifteen|thirty|forty[- ]five))?\b/.exec(text);
    if (word) {
      hour = SMALL[word[1]];
      minute = word[2] ? MINUTES[word[2].replace("-", " ")] ?? MINUTES[word[2]] ?? 0 : 0;
    }
  }
  if (hour === null || hour < 0 || hour > 23 || minute > 59) return null;
  if (hour <= 12) {
    const pm = /pm|p m|afternoon|tonight/.test(ampm);
    const am = /am|a m|morning/.test(ampm);
    if (pm && hour < 12) hour += 12;
    else if (am && hour === 12) hour = 0;
    else if (!pm && !am && hour >= 1 && hour <= 6) hour += 12;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function clockLabel(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Hours between a clock-in (ISO) and a spoken time on the same local day. */
export function hoursUntil(clockInIso: string, hhmm: string) {
  const start = new Date(clockInIso);
  if (Number.isNaN(start.getTime())) return null;
  const [h, m] = hhmm.split(":").map(Number);
  const end = new Date(start);
  end.setHours(h, m, 0, 0);
  const hours = (end.getTime() - start.getTime()) / 3_600_000;
  return hours > 0 ? Math.round(hours * 10) / 10 : null;
}

const UNIT: Array<[RegExp, string]> = [
  [/^(?:gallons?|gals?|gal)$/, "gal"],
  [/^(?:quarts?|qts?)$/, "qt"],
  [/^(?:tubes?)$/, "tube"],
  [/^(?:rolls?)$/, "roll"],
  [/^(?:cans?)$/, "can"],
  [/^(?:boxes|box)$/, "box"],
  [/^(?:buckets?|pails?)$/, "bucket"],
  [/^(?:sheets?)$/, "sheet"],
];

function unitOf(word: string) {
  for (const [pattern, unit] of UNIT) if (pattern.test(word)) return unit;
  return "";
}

function qtyOf(word: string) {
  if (/^\d+(?:\.\d+)?$/.test(word)) return Number(word);
  return SMALL[word] ?? null;
}

const MATERIAL =
  /^(?:(?:please\s+)?(?:add|log|put|we\s+need|need|got|grab(?:bed)?|picked\s+up|bought|order|ordered|used|we\s+used|we\s+got)\s+)?(?:a\s+couple(?:\s+of)?\s+|(?:another|more)\s+)?(\d+(?:\.\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)?\s*(?:more\s+)?(?:(five)[- ]gallons?\s+(?:buckets?\s+|pails?\s+)?|(gallons?|gals?|gal|quarts?|qts?|tubes?|rolls?|cans?|boxes|box|buckets?|pails?|sheets?)\s+)(?:of\s+)?(.+)$/i;

export function parseMaterial(clause: string) {
  const match = MATERIAL.exec(clause.trim());
  if (!match) return null;
  const five = Boolean(match[2]);
  const couple = /\ba\s+couple\b/i.test(clause);
  const count = couple ? 2 : match[1] ? qtyOf(match[1].toLowerCase()) : 1;
  if (count === null) return null;
  const unit = five ? "gal" : unitOf((match[3] || "").toLowerCase());
  if (!unit) return null;
  const qty = five ? count * 5 : count;
  let rest = clean(match[4] || "").replace(/\b(?:to|on)\s+(?:the\s+)?materials?(?:\s+list)?$/i, "").trim();
  const code = normalizeColorCode(rest);
  if (code) {
    rest = rest
      .replace(/sherwin[\s-]*williams?/gi, "SW ")
      .replace(/\b(?:s\.?\s*w\.?|sw|bm|ppg)\s*-?\s*\d{3,4}\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  rest = rest.replace(/^(?:of|the)\s+/i, "").trim();
  if (!code && !rest) return null;
  return { qty, unit, code, name: rest };
}

function personIn(clause: string, crew: VoicePerson[]) {
  const heard = clause.toLowerCase();
  let best: { person: VoicePerson; at: number } | null = null;
  for (const person of crew) {
    for (const part of [person.firstName, person.lastName]) {
      const key = part.trim().toLowerCase();
      if (key.length < 2) continue;
      const at = heard.search(new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`));
      if (at >= 0 && (!best || at < best.at)) best = { person, at };
    }
  }
  return best?.person || null;
}

const OUT_WORDS = /\b(?:left|went home|headed (?:home|out)|took off|clocked out|punched out|clock(?:ed)? (?:\w+ )?out|knocked off|quit|stopped)\b/;
const IN_WORDS = /\b(?:got here|came in|showed up|arrived|started|clocked in|punched in|clock(?:ed)? (?:\w+ )?in|on site)\b/;

function guessArea(task: string): TaskArea {
  const t = task.toLowerCase();
  if (/\bclean|lock up|pick up|drop cloths?|wash (?:the )?(?:tools|brushes|rollers)/.test(t)) return "cleanup";
  if (/\bprim(?:e|er|ing)\b/.test(t)) return "prime";
  if (/\bcut[\s-]?in\b/.test(t)) return "cutin";
  if (/\btrim|fascia|soffit|baseboard|casing|door|window|shutter/.test(t)) return "trim";
  if (/\broll|coat|spray|siding|walls?\b|ceiling/.test(t)) return "roll";
  return "prep";
}

function words(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !["the", "and", "with", "done", "all", "for"].includes(w));
}

function bestTask(phrase: string, tasks: VoiceCtx["tasks"] = []) {
  const want = new Set(words(phrase));
  if (!want.size) return null;
  let best: { id: string; text: string; score: number } | null = null;
  for (const task of tasks) {
    if (task.done) continue;
    const have = words(task.text);
    if (!have.length) continue;
    const hit = have.filter((w) => want.has(w)).length;
    const score = hit / Math.max(have.length, want.size);
    if (hit && score >= 0.34 && (!best || score > best.score)) best = { id: task.id, text: task.text, score };
  }
  return best;
}

const STARTERS =
  /^(?:add|put|log|clock|punch|page|broadcast|tell|note|write|take|snap|mark|check|finished|done|we|i|i'm|change|order|need|got|grabbed|bought|picked|picture|photo|touch|\d|one|two|three|four|five|six|seven|eight|nine|ten|a couple|another|client|the client|they)\b/i;

export function splitClauses(text: string, crew: VoicePerson[] = []) {
  const names = crew.flatMap((p) => [p.firstName, p.lastName]).filter((n) => n.length > 1).map((n) => n.toLowerCase());
  const pieces = text
    .replace(/\s+/g, " ")
    .split(/(?:[.;!?]+\s*|\s+then\s+|\s+also\s+)/i)
    .flatMap((part) => {
      const out: string[] = [];
      let rest = part;
      // Split on “and” / “,” only when what follows starts a new thing to do.
      const joiner = /(?:,\s*and\s+|\s+and\s+|,\s+)/gi;
      let last = 0;
      let match: RegExpExecArray | null;
      while ((match = joiner.exec(rest))) {
        const after = rest.slice(match.index + match[0].length);
        const head = after.toLowerCase();
        if (STARTERS.test(after) || names.some((name) => head.startsWith(name))) {
          out.push(rest.slice(last, match.index));
          last = match.index + match[0].length;
        }
      }
      out.push(rest.slice(last));
      rest = "";
      return out;
    });
  return pieces.map(clean).filter(Boolean);
}

let seq = 0;
function chipId(kind: string) {
  seq = (seq + 1) % 1_000_000;
  return `${kind}-${seq}`;
}

function clauseActions(clause: string, ctx: VoiceCtx): VoiceAction[] {
  const lower = clause.toLowerCase().replace(/[’']/g, "'");
  const office = ctx.role === "office";

  if (/\b(?:take|snap|grab)\s+(?:a\s+)?(?:photo|picture|pic|shot)\b|\bopen (?:the )?camera\b/.test(lower)) {
    return [{ kind: "photo", id: chipId("photo"), label: "Open the camera", dest: "Photos" }];
  }

  const page = /^(?:broadcast|page(?:\s+the\s+crew)?|tell\s+(?:the\s+)?(?:crew|guys|everyone)|announce|radio(?:\s+the\s+crew)?)\s*[:,\-]?\s*(?:that\s+)?(.+)$/i.exec(clause);
  if (page) {
    const text = cap(clean(page[1]));
    return [{ kind: "page", text, id: chipId("page"), label: `Tell the crew: “${text}”`, dest: "Crew page" }];
  }

  const punch = /^(?:add\s+(?:a\s+)?|put\s+)?(?:(?:on|to)\s+(?:the\s+)?)?punch(?:\s+list)?(?:\s+item)?\s*[:,\-]?\s*(.+)$/i.exec(clause) ||
    /^(touch[\s-]?up\s+.+)$/i.exec(clause);
  if (punch) {
    const text = cap(clean(punch[1]));
    return [{ kind: "punch", text, id: chipId("punch"), label: `Punch: ${text}`, dest: "Punch list" }];
  }

  const doneWith = /^(?:mark|check\s+off|we(?:'re|\s+are)?\s+(?:done|finished)\s+(?:with\s+)?|(?:we\s+)?finished|done\s+with|completed)\s+(.+?)(?:\s+(?:as\s+)?(?:done|finished|complete))?$/i.exec(clause);
  if (doneWith) {
    const hit = bestTask(doneWith[1], ctx.tasks);
    if (hit) return [{ kind: "task-done", taskId: hit.id, text: hit.text, id: chipId("done"), label: `Done: ${hit.text}`, dest: "Tasks" }];
  }

  const task = /^(?:add\s+(?:a\s+)?(?:new\s+)?task|new\s+task|to[\s-]?do|add\s+to\s+(?:the\s+)?(?:tasks|list))\s*[:,\-]?\s*(.+)$/i.exec(clause);
  if (task) {
    const text = cap(clean(task[1]));
    const area = guessArea(text);
    const label = TASK_AREAS.find((row) => row.id === area)?.label || "Prep";
    return [{ kind: "task", text, area, id: chipId("task"), label: `New task: ${text}`, dest: `Tasks · ${label}` }];
  }

  if (/\bchange order\b|\bextra work\b|\b(?:client|they|board|owner|hoa)\s+(?:wants?|asked(?:\s+for)?|would like)\b/.test(lower)) {
    const money = /\$\s?(\d[\d,]*(?:\.\d{2})?)|\b(\d[\d,]*)\s*(?:dollars|bucks)\b|\bfor\s+(\d[\d,]*)\b/.exec(lower);
    const amount = money ? Number((money[1] || money[2] || money[3]).replace(/,/g, "")) : 0;
    const title = cap(
      clean(
        clause
          .replace(/^.*?\b(?:change order|extra work)\b\s*(?:for|to)?\s*[:,\-]?\s*/i, "")
          .replace(/^.*?\b(?:wants?|asked(?:\s+for)?|would like)\s+(?:us\s+)?(?:to\s+)?(?:also\s+)?/i, "")
          .replace(/\$\s?\d[\d,]*(?:\.\d{2})?|\b\d[\d,]*\s*(?:dollars|bucks)\b|\bfor\s+\d[\d,]*\b/gi, "")
      )
    );
    return [
      {
        kind: "change",
        title: title || "Extra work",
        amount,
        id: chipId("change"),
        label: `Change order: ${title || "Extra work"}${amount && office ? ` · +$${amount.toLocaleString("en-US")}` : ""}`,
        dest: "Change orders",
        blocked: office ? undefined : "Change orders are for the office.",
      },
    ];
  }

  const material = parseMaterial(clause);
  if (material) {
    const label = `+ ${material.qty} ${material.unit} ${[material.code, material.name].filter(Boolean).join(" ")}`;
    return [{ kind: "material", ...material, id: chipId("mat"), label, dest: "Materials" }];
  }

  // Me / I: a crew phone clocking itself.
  if (ctx.selfId && /\b(?:clock|punch)\s+me\s+(in|out)\b|\bi'?m\s+(here|on site|leaving|out|done for the day|heading out)\b/.test(lower)) {
    const self = ctx.crew.find((person) => person.id === ctx.selfId);
    const m = /\b(?:clock|punch)\s+me\s+(in|out)\b|\bi'?m\s+(here|on site|leaving|out|done for the day|heading out)\b/.exec(lower)!;
    const action: "IN" | "OUT" = m[1] === "in" || m[2] === "here" || m[2] === "on site" ? "IN" : "OUT";
    if (self) {
      return [
        {
          kind: "clock",
          employeeId: self.id,
          name: self.firstName,
          action,
          id: chipId("clock"),
          label: action === "IN" ? "Clock me in on this job" : "Clock me out",
          dest: "Hours",
        },
      ];
    }
  }

  const person = personIn(clause, ctx.crew);
  if (person) {
    const isSelf = person.id === ctx.selfId;
    const out = OUT_WORDS.test(lower);
    const inn = !out && IN_WORDS.test(lower);
    const timePart = /\b(?:at|around|about|by)\s+(.+)$/.exec(lower)?.[1];
    const at = timePart ? parseSpokenTime(timePart) : null;
    if ((out || inn) && at) {
      const action: "IN" | "OUT" = out ? "OUT" : "IN";
      return [
        {
          kind: "clock-at",
          employeeId: person.id,
          name: person.firstName,
          action,
          at,
          id: chipId("clockat"),
          label: `${fullName(person)} clock-${action === "OUT" ? "out" : "in"} ${clockLabel(at)}`,
          dest: "Hours",
          blocked: office ? undefined : "Ask the office to fix hours.",
        },
      ];
    }
    if (out || inn) {
      const action: "IN" | "OUT" = out ? "OUT" : "IN";
      return [
        {
          kind: "clock",
          employeeId: person.id,
          name: person.firstName,
          action,
          id: chipId("clock"),
          label: `Clock ${person.firstName} ${action === "IN" ? "in" : "out"} now`,
          dest: "Hours",
          blocked: office
            ? `${person.firstName} clocks ${action === "IN" ? "in" : "out"} on their own phone. Say a time to fix hours, like “${person.firstName} left at 3”.`
            : isSelf
              ? undefined
              : "Only your own clock from this phone.",
        },
      ];
    }
    const hours = parseHoursTalk(clause, [person]);
    if (hours.length) {
      return [
        {
          kind: "hours",
          employeeId: person.id,
          name: person.firstName,
          hours: hours[0].hours,
          id: chipId("hours"),
          label: `${fullName(person)}: ${hours[0].hours} hr today`,
          dest: "Hours",
          blocked: office ? undefined : "Ask the office to fix hours.",
        },
      ];
    }
  }

  const note = /^(?:add\s+(?:a\s+)?note|note|write(?:\s+down)?|remember|reminder)\s*[:,\-]?\s*(?:that\s+)?(.+)$/i.exec(clause);
  const body = cap(clean(note ? note[1] : clause));
  if (body.split(" ").length < 2 && !note) return [];
  return [{ kind: "note", text: body, id: chipId("note"), label: `Note: ${body}`, dest: "Notes" }];
}

export function parseVoiceActions(text: string, ctx: VoiceCtx): VoiceAction[] {
  const raw = text.replace(/\s+/g, " ").trim();
  if (!raw) return [];
  const out: VoiceAction[] = [];
  for (const clause of splitClauses(raw, ctx.crew)) out.push(...clauseActions(clause, ctx));
  // Several leftover scraps become one note instead of a pile of chips.
  const notes = out.filter((row) => row.kind === "note");
  if (notes.length > 1) {
    const joined = notes.map((row) => (row.kind === "note" ? row.text : "")).join(". ");
    const first = out.indexOf(notes[0]);
    const rest: VoiceAction[] = out.filter((row) => row.kind !== "note");
    rest.splice(Math.min(first, rest.length), 0, {
      kind: "note",
      text: joined,
      id: chipId("note"),
      label: `Note: ${joined}`,
      dest: "Notes",
    });
    return rest;
  }
  return out;
}

export type TalkChipKind = "camera" | "roll" | "parse";

/**
 * Screens that already had their own parser (lead card, bid, invoice lines, setup) keep it:
 * the helper offers one chip that runs that parser, plus a camera chip when they asked for a photo.
 */
export function talkChips(text: string, dest: string): { kind: TalkChipKind; label: string; dest: string }[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const out: { kind: TalkChipKind; label: string; dest: string }[] = [];
  if (/\b(from roll|camera roll|photo roll|upload|gallery|album)\b/i.test(clean)) {
    out.push({ kind: "roll", label: "Pick photos from the phone", dest: "Photos" });
  } else if (/\b(snap|photo|picture|pic|receipt|camera)\b/i.test(clean)) {
    out.push({ kind: "camera", label: "Open the camera", dest: "Photos" });
  }
  const short = clean.length > 70 ? `${clean.slice(0, 69).trimEnd()}…` : clean;
  out.push({ kind: "parse", label: `“${short}”`, dest });
  return out;
}
