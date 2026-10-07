import { parseHoursTalk, type HoursPerson, type HoursTalkHit } from "@/lib/hours-talk";

export type ActiveClockHit = {
  employeeId: string;
  name: string;
  action: "IN" | "OUT";
};

export type ActiveTalkHit = {
  clocks: ActiveClockHit[];
  hours: HoursTalkHit[];
  broadcast?: string;
  instruction?: string;
  note?: string;
};

function nameIndex(heard: string, person: HoursPerson) {
  const first = person.firstName.trim().toLowerCase();
  const last = person.lastName.trim().toLowerCase();
  if (first.length > 1 && heard.includes(first)) return heard.indexOf(first);
  if (last.length > 1 && heard.includes(last)) return heard.indexOf(last);
  return -1;
}

function clip(value: string) {
  return value.replace(/\s+/g, " ").replace(/^[\s:,-]+/, "").replace(/[.,;]+$/, "").trim();
}

function afterKeyword(text: string, pattern: RegExp) {
  const match = text.match(pattern);
  if (!match?.[1]) return undefined;
  const value = clip(match[1]);
  return value.length >= 2 ? value : undefined;
}

/** “Clock Maya in”, “Jordan 6 hours”, “broadcast lunch at noon”, daily notes. */
export function parseActiveTalk(text: string, crew: HoursPerson[]): ActiveTalkHit {
  const raw = text.replace(/\s+/g, " ").trim();
  if (!raw) return { clocks: [], hours: [] };
  const heard = raw.toLowerCase().replace(/[’']/g, "'");
  const clocks: ActiveClockHit[] = [];

  for (const person of crew) {
    const at = nameIndex(heard, person);
    if (at < 0) continue;
    const window = heard.slice(Math.max(0, at - 22), at + 48);
    const out =
      /\b(?:clock(?:ed)?|punch(?:ed)?)\s+(?:\w+\s+){0,2}(?:out|off)\b/.test(window) ||
      /\b(?:left|clocked out|punched out|off[\s-]site)\b/.test(window);
    const inn =
      /\b(?:clock(?:ed)?|punch(?:ed)?)\s+(?:\w+\s+){0,2}in\b/.test(window) ||
      /\b(?:on[\s-]site|clocked in|punched in)\b/.test(window);
    if (out) clocks.push({ employeeId: person.id, name: person.firstName, action: "OUT" });
    else if (inn) clocks.push({ employeeId: person.id, name: person.firstName, action: "IN" });
  }

  const clocked = new Set(clocks.map((hit) => hit.employeeId));
  const hours = parseHoursTalk(raw, crew).filter((hit) => {
    if (clocked.has(hit.employeeId) && hit.hours === 0) return false;
    return true;
  });

  const broadcast = afterKeyword(
    raw,
    /(?:broadcast|page(?:\s+the\s+crew)?|announce|tell the crew|radio)\s*[:\-]?\s*(.+)$/i
  );
  const instruction = afterKeyword(
    raw,
    /(?:instructions?|team (?:note|instruction)s?|update(?:\s+the)?(?:\s+team)?\s+instructions?)\s*[:\-]?\s*(.+)$/i
  );

  const structured = clocks.length > 0 || hours.length > 0 || Boolean(broadcast) || Boolean(instruction);
  const note = structured ? undefined : raw.length >= 4 ? raw : undefined;

  return { clocks, hours, broadcast, instruction, note };
}
