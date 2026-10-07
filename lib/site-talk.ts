import { parseDocumentTalk } from "@/lib/document-parse";
import { DEFAULT_PRICING } from "@/lib/pricing-rates";
import { fillScopeDescription, isPricedLine, type DocLineDraft } from "@/lib/documents";

export type SiteMeasure = { label: string; value: string };

export type SiteTalkDraft = {
  transcript: string;
  notes: string;
  measurements: SiteMeasure[];
  requests: string[];
  lines: DocLineDraft[];
};

const WORD_NUM: Record<string, string> = {
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
  fifteen: "15",
  twenty: "20",
  thirty: "30",
};

const REQUEST_RE =
  /(?:they|client|homeowner|home owner|owner|she|he)\s+(?:want|wanted|asked(?:\s+for)?|said|requested)s?\s+([^.]{4,160})/gi;
const LEAVE_RE = /((?:leave|don't paint|do not paint|skip|keep)\s+(?:the\s+)?[^.]{3,80})/gi;

function expandNumbers(text: string) {
  return text.replace(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty)\b/gi,
    (word) => WORD_NUM[word.toLowerCase()] || word
  );
}

function clean(value: string) {
  return value.replace(/\s+/g, " ").replace(/^[\s:,-]+/, "").replace(/[.,;]+$/, "").trim();
}

function title(value: string) {
  return value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function pushMeasure(list: SiteMeasure[], label: string, value: string) {
  const key = label.toLowerCase();
  const existing = list.find((item) => item.label.toLowerCase() === key);
  if (existing) existing.value = value;
  else list.push({ label, value });
}

function readMeasurements(text: string) {
  const measurements: SiteMeasure[] = [];
  const room = text.match(/(\d+(?:\.\d+)?)\s*(?:x|by|×)\s*(\d+(?:\.\d+)?)(?:\s*(?:ft|feet))?(?:\s+(\w+))?/i);
  if (room) {
    const where = room[3] && !/feet|ft|inch/i.test(room[3]) ? title(room[3]) : "Room";
    pushMeasure(measurements, where, `${room[1]}×${room[2]} ft`);
  }
  const sf = text.match(/(\d{2,5}(?:\.\d+)?)\s*(?:square\s*feet|sq(?:uare)?\s*ft|\bsf\b)/i);
  if (sf) pushMeasure(measurements, "Area", `${sf[1]} sf`);
  const lf = text.match(/(\d+(?:\.\d+)?)\s*(?:linear\s*feet|lin(?:ear)?\s*ft|\blf\b)/i);
  if (lf) pushMeasure(measurements, "Linear", `${lf[1]} lf`);
  const gal = text.match(/(\d+(?:\.\d+)?)\s*(?:gallons?|gals?|\bgal\b)/i);
  if (gal) pushMeasure(measurements, "Paint", `${gal[1]} gal`);
  const hours = text.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i);
  if (hours) pushMeasure(measurements, "Labor", `${hours[1]} hr`);
  const stories = text.match(/(\d+)\s*(?:stories|story|storeys|storey)\b/i);
  if (stories) pushMeasure(measurements, "Stories", stories[1]);
  const coats = text.match(/(\d+)\s*coats?\b/i);
  if (coats) pushMeasure(measurements, "Coats", coats[1]);
  const doors = text.match(/(\d+)\s*(doors?|windows?|rooms?)\b/i);
  if (doors) pushMeasure(measurements, title(doors[2]), doors[1]);
  return measurements;
}

function readRequests(text: string) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const re of [REQUEST_RE, LEAVE_RE]) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      const value = clean(match[1]);
      const key = value.toLowerCase();
      if (value.length < 4 || seen.has(key)) continue;
      seen.add(key);
      out.push(value);
    }
  }
  return out;
}

function qty(value: string) {
  return Number.parseFloat(value) || 0;
}

function normalizeLine(line: DocLineDraft): DocLineDraft {
  const blob = `${line.description} ${line.unit}`.toLowerCase();
  if (/linear|(\blf\b)/.test(blob)) {
    return {
      ...line,
      unit: "lf",
      description: clean(line.description.replace(/linear\s*feet(?:\s+of)?/i, "") || "Linear work"),
    };
  }
  if (/hour|hrs?\b/.test(blob) && line.kind !== "LABOR") {
    return { ...line, kind: "LABOR", unit: "hr" };
  }
  return line;
}

function linesFromMeasures(text: string, measurements: SiteMeasure[], priced: DocLineDraft[]): DocLineDraft[] {
  if (priced.length) {
    const extra: DocLineDraft[] = [];
    const hours = measurements.find((item) => item.label === "Labor");
    if (hours && !priced.some((line) => line.kind === "LABOR")) {
      extra.push({
        kind: "LABOR",
        description: "On-site labor",
        quantity: qty(hours.value) || 1,
        unit: "hr",
        rate: DEFAULT_PRICING.labor,
      });
    }
    const paint = measurements.find((item) => item.label === "Paint");
    if (paint && !priced.some((line) => line.kind === "MATERIAL")) {
      extra.push({
        kind: "MATERIAL",
        description: "Paint",
        quantity: qty(paint.value) || 1,
        unit: "gal",
        rate: DEFAULT_PRICING.duration,
      });
    }
    return extra;
  }

  const blob = text.toLowerCase();
  const cabinets = /cabinet|kitchen box|vanity/.test(blob);
  const exterior = /exterior|siding|trim|fascia|eave|outsid/.test(blob);
  const sf = qty(measurements.find((item) => item.label === "Area")?.value || "");
  if (cabinets) {
    const count = qty(measurements.find((item) => /door/i.test(item.label))?.value || "") || 12;
    return [
      { kind: "LABOR", description: "Cabinet refinish", quantity: Math.max(4, Math.round(count * 0.45)), unit: "hr", rate: DEFAULT_PRICING.labor },
      { kind: "MATERIAL", description: "Enamel", quantity: Math.max(1, Math.ceil(count / 10)), unit: "gal", rate: DEFAULT_PRICING.duration },
    ];
  }
  if (sf >= 80) {
    const hours = Math.max(4, Math.round((sf / 150) * 2) / 2);
    const gal = Math.max(1, Math.ceil(sf / 350));
    return [
      {
        kind: "LABOR",
        description: exterior ? "Exterior paint labor" : "Interior paint labor",
        quantity: hours,
        unit: "hr",
        rate: DEFAULT_PRICING.labor,
      },
      {
        kind: "MATERIAL",
        description: exterior ? "Exterior paint" : "Interior paint",
        quantity: gal,
        unit: "gal",
        rate: DEFAULT_PRICING.duration,
      },
    ];
  }
  const hours = measurements.find((item) => item.label === "Labor");
  if (hours) {
    return [
      {
        kind: "LABOR",
        description: "On-site labor",
        quantity: qty(hours.value) || 1,
        unit: "hr",
        rate: DEFAULT_PRICING.labor,
      },
    ];
  }
  return [];
}

export function emptySiteTalk(transcript = ""): SiteTalkDraft {
  return { transcript, notes: "", measurements: [], requests: [], lines: [] };
}

export function parseSiteTalk(text: string): SiteTalkDraft {
  const transcript = text.replace(/\s+/g, " ").trim();
  if (!transcript) return emptySiteTalk();
  const expanded = expandNumbers(transcript);
  const measurements = readMeasurements(expanded);
  const requests = readRequests(expanded);
  const priced = parseDocumentTalk(expanded);
  const lines = [...priced.lines.map(normalizeLine), ...linesFromMeasures(expanded, measurements, priced.lines.map(normalizeLine))];
  const requestNote = requests.length ? `Client: ${requests.join("; ")}.` : "";
  return {
    transcript,
    notes: mergeNotes(transcript, requestNote),
    measurements,
    requests,
    lines,
  };
}

export function mergeNotes(current: string, incoming: string) {
  const a = current.trim();
  const b = incoming.trim();
  if (!b) return a;
  if (!a) return b;
  if (a.toLowerCase().includes(b.toLowerCase())) return a;
  if (b.toLowerCase().includes(a.toLowerCase())) return b;
  return `${a.replace(/[.?]?$/, ".")} ${b}`.replace(/\s+/g, " ").trim();
}

export function mergeMeasures(current: SiteMeasure[], incoming: SiteMeasure[]) {
  const next = current.map((item) => ({ ...item }));
  for (const item of incoming) {
    const match = next.find((row) => row.label.toLowerCase() === item.label.toLowerCase());
    if (match) match.value = item.value;
    else next.push({ ...item });
  }
  return next;
}

export function mergeTalkLines(current: DocLineDraft[], incoming: DocLineDraft[]) {
  if (!incoming.length) return current;
  const kept = current.filter(isPricedLine).map(fillScopeDescription);
  const extras = incoming
    .filter(isPricedLine)
    .map(fillScopeDescription)
    .filter(
      (next) =>
        !kept.some(
          (line) =>
            line.description === next.description && line.rate === next.rate && line.quantity === next.quantity
        )
    );
  return extras.length ? [...kept, ...extras] : kept;
}

export function mergeSiteTalk(current: SiteTalkDraft, incoming: SiteTalkDraft): SiteTalkDraft {
  return {
    transcript: mergeNotes(current.transcript, incoming.transcript),
    notes: mergeNotes(current.notes, incoming.notes),
    measurements: mergeMeasures(current.measurements, incoming.measurements),
    requests: [...current.requests, ...incoming.requests.filter((item) => !current.requests.some((row) => row.toLowerCase() === item.toLowerCase()))],
    lines: mergeTalkLines(current.lines, incoming.lines),
  };
}
