export type HoursPerson = {
  id: string;
  firstName: string;
  lastName: string;
};

export type HoursTalkHit = {
  employeeId: string;
  hours: number;
  name: string;
};

const HOUR_WORDS: Record<string, number> = {
  zero: 0,
  off: 0,
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
  eleven: 11,
  twelve: 12,
};

const HOUR_TOKEN = String.raw`(zero|off|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2}(?:\.\d)?)`;

function readHours(raw: string): number | undefined {
  const key = raw.toLowerCase();
  if (key in HOUR_WORDS) return HOUR_WORDS[key];
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 24) return undefined;
  return value;
}

function nameIndex(heard: string, person: HoursPerson) {
  const first = person.firstName.trim().toLowerCase();
  const last = person.lastName.trim().toLowerCase();
  if (first.length > 1 && heard.includes(first)) return heard.indexOf(first);
  if (last.length > 1 && heard.includes(last)) return heard.indexOf(last);
  return -1;
}

/** “Change Maya's hours to 8”, “Jordan 6 hours”, “set Avery off”. */
export function parseHoursTalk(text: string, crew: HoursPerson[]): HoursTalkHit[] {
  const heard = text.toLowerCase().replace(/[’']/g, "'");
  const hits: HoursTalkHit[] = [];
  for (const person of crew) {
    const at = nameIndex(heard, person);
    if (at < 0) continue;
    const window = heard.slice(at, at + 56);
    if (/\b(off|zero)\b/.test(window) && !/\b(?:to|at|for)\s+\d/.test(window)) {
      hits.push({ employeeId: person.id, hours: 0, name: person.firstName });
      continue;
    }
    const match =
      window.match(new RegExp(String.raw`\b(?:hours?|hrs?)?\s*(?:to|at|for|:)?\s*${HOUR_TOKEN}\b`, "i")) ||
      window.match(new RegExp(String.raw`\b${HOUR_TOKEN}\s*(?:hours?|hrs?)\b`, "i"));
    if (!match) continue;
    const hours = readHours(match[1]);
    if (hours === undefined) continue;
    hits.push({ employeeId: person.id, hours, name: person.firstName });
  }
  return hits;
}
