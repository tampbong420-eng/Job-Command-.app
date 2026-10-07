import { defaultScopeLabel, ensureScopeLines, type DocLineDraft, type LineKind } from "@/lib/documents";

const CHUNK_RE = /\s*(?:,|;|\+| and | then | also | plus )\s*/i;
const LINE_RE =
  /(?:(\d+(?:\.\d+)?)\s*)?(hours?|hrs?|hr|gallons?|gals?|gal|yards?|yds?|sq(?:uare)?\s*ft|sf|lf|lin(?:ear)?\s*ft|sheets?|each|ea)?\s*(?:of\s+)?(.+?)\s+(?:at|@|for|x)\s+\$?\s*(\d+(?:\.\d{1,2})?)/i;
const BARE_MONEY = /\$\s*(\d+(?:\.\d{1,2})?)/;

function kindFor(description: string, unit: string): LineKind {
  const t = `${description} ${unit}`.toLowerCase();
  if (/labou?r|hour|hrs?\b|crew|painter|time/.test(t)) return "LABOR";
  if (/paint|primer|gallon|gals?\b|\bgal\b|material|caulk|tape|brush|roller|lumber|sheet|drop cloth|suppl/.test(t)) {
    return "MATERIAL";
  }
  return "OTHER";
}

function lumpKind(label: string): LineKind {
  const t = label.toLowerCase();
  if (/labou?r|hour|crew/.test(t)) return "LABOR";
  if (/material|paint|primer|suppl/.test(t)) return "MATERIAL";
  return "OTHER";
}

function lumpDescription(kind: LineKind, label: string) {
  const t = label.toLowerCase().trim();
  if (!t || /^(total|bid|job|scope)$/.test(t)) return defaultScopeLabel(kind);
  if (/^labou?r$/.test(t)) return "General Labor / Scope";
  if (/^materials?$/.test(t)) return "General Materials / Scope";
  return t.replace(/^\w/, (letter) => letter.toUpperCase());
}

function lumpLine(kind: LineKind, amount: number, label: string): DocLineDraft {
  return {
    kind,
    description: lumpDescription(kind, label),
    quantity: 1,
    unit: "lot",
    rate: amount,
  };
}

const LUMP_LABEL = String.raw`(labou?r|materials?|paint|primer|supplies|total|bid|job|scope)`;
const LUMP_MONEY = String.raw`\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:dollars?)?`;
const NOT_A_QTY = String.raw`(?!\s*(?:hours?|hrs?|hr|gallons?|gals?|gal|yards?|yds?|sf|lf|sheets?|each|ea)\b)`;

function parseLumpChunk(chunk: string): DocLineDraft | undefined {
  const named = chunk.match(
    new RegExp(`\\b${LUMP_LABEL}\\b(?:\\s+(?:is|are|at|of|for|:))?\\s*${LUMP_MONEY}${NOT_A_QTY}`, "i")
  );
  if (named) {
    const amount = Number(named[2]);
    if (amount > 0) return lumpLine(lumpKind(named[1]), amount, named[1]);
  }
  const leadCash = chunk.match(
    new RegExp(`\\$\\s*(\\d+(?:\\.\\d{1,2})?)\\s*(?:dollars?)?\\s*(?:for|of|in|on)?\\s*${LUMP_LABEL}\\b`, "i")
  );
  if (leadCash) {
    const amount = Number(leadCash[1]);
    if (amount > 0) return lumpLine(lumpKind(leadCash[2]), amount, leadCash[2]);
  }
  const leadWords = chunk.match(
    new RegExp(`\\b(\\d+(?:\\.\\d{1,2})?)\\s*dollars?\\s*(?:for|of|in|on)?\\s*${LUMP_LABEL}\\b`, "i")
  );
  if (leadWords) {
    const amount = Number(leadWords[1]);
    if (amount > 0) return lumpLine(lumpKind(leadWords[2]), amount, leadWords[2]);
  }
  return undefined;
}

function unitFor(raw?: string, kind?: LineKind) {
  const u = (raw || "").toLowerCase();
  if (/hour|hrs?|hr/.test(u)) return "hr";
  if (/gal/.test(u)) return "gal";
  if (/yard|yd/.test(u)) return "yd";
  if (/sq|sf/.test(u)) return "sf";
  if (/lf|linear/.test(u)) return "lf";
  if (/sheet/.test(u)) return "sheet";
  if (kind === "LABOR") return "hr";
  return "ea";
}

export function parseDocumentTalk(text: string): { notes?: string; lines: DocLineDraft[] } {
  const raw = text.trim();
  if (!raw) return { lines: [] };
  const chunks = raw.split(CHUNK_RE).map((chunk) => chunk.trim()).filter(Boolean);
  const lines: DocLineDraft[] = [];
  const leftover: string[] = [];

  for (const chunk of chunks) {
    const match = chunk.match(LINE_RE);
    if (match) {
      const quantity = Number(match[1] || 1);
      const description = match[3].replace(/^(of|for)\s+/i, "").trim();
      const kind = kindFor(description, match[2] || "");
      lines.push({
        kind,
        description: description || (kind === "LABOR" ? "Labor" : "Materials"),
        quantity: quantity || 1,
        unit: unitFor(match[2], kind),
        rate: Number(match[4]),
      });
      continue;
    }
    const lump = parseLumpChunk(chunk);
    if (lump) {
      lines.push(lump);
      continue;
    }
    leftover.push(chunk);
  }

  if (!lines.length) {
    const money = raw.match(BARE_MONEY);
    if (money) {
      const kind = /labou?r|hour/.test(raw.toLowerCase())
        ? "LABOR"
        : /material|paint|suppl/.test(raw.toLowerCase())
          ? "MATERIAL"
          : "OTHER";
      lines.push({
        kind,
        description: raw.replace(BARE_MONEY, "").replace(/\s+/g, " ").trim() || defaultScopeLabel(kind),
        quantity: 1,
        unit: "lot",
        rate: Number(money[1]),
      });
      return { lines: ensureScopeLines(lines) };
    }
  }

  const notes = leftover.join(". ").trim();
  return { notes: notes || undefined, lines: ensureScopeLines(lines) };
}
