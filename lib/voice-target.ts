/**
 * One mic, two jobs:
 *   - a text box is selected  → the mic types into that box
 *   - nothing is selected      → the AI helper sheet turns speech into confirm chips
 * These helpers stay DOM-free so they can be tested; OneMic.tsx feeds them element facts.
 */

export type FieldFacts = {
  tag: string;
  type?: string | null;
  readOnly?: boolean;
  disabled?: boolean;
  /** data-voice attribute. "off" keeps the mic out (PIN pads, money, dates). */
  voice?: string | null;
  inputMode?: string | null;
  contentEditable?: boolean;
};

const TEXT_TYPES = new Set(["", "text", "search", "email", "tel", "url"]);

export function canDictate(field: FieldFacts | null | undefined): boolean {
  if (!field) return false;
  if (field.disabled || field.readOnly) return false;
  if ((field.voice || "").toLowerCase() === "off") return false;
  const tag = field.tag.toUpperCase();
  if (tag === "TEXTAREA") return true;
  if (field.contentEditable) return true;
  if (tag !== "INPUT") return false;
  const type = (field.type || "").toLowerCase();
  return TEXT_TYPES.has(type);
}

export type FieldNames = {
  voiceLabel?: string | null;
  ariaLabel?: string | null;
  labelText?: string | null;
  placeholder?: string | null;
  name?: string | null;
};

function tidy(text: string) {
  const clean = text.replace(/\s+/g, " ").replace(/[:*]+$/, "").trim();
  if (!clean) return "";
  const short = clean.length > 28 ? `${clean.slice(0, 27).trimEnd()}…` : clean;
  return short.charAt(0).toUpperCase() + short.slice(1);
}

/** What the “Typing into: X” pill says. */
export function fieldName(names: FieldNames): string {
  for (const value of [names.voiceLabel, names.ariaLabel, names.labelText, names.placeholder, names.name]) {
    const text = tidy(value || "");
    if (text) return text;
  }
  return "This box";
}

export type VoiceTarget<T> = { mode: "field"; field: T } | { mode: "helper" };

/**
 * Tapping the mic can steal focus on some phones, so a box that blurred a moment ago
 * (under `graceMs`) still counts as selected.
 */
export function pickVoiceTarget<T>(input: {
  active: T | null;
  activeOk: boolean;
  recent: T | null;
  recentOk: boolean;
  blurredAgoMs: number | null;
  graceMs?: number;
}): VoiceTarget<T> {
  if (input.active && input.activeOk) return { mode: "field", field: input.active };
  const grace = input.graceMs ?? 700;
  if (input.recent && input.recentOk && input.blurredAgoMs !== null && input.blurredAgoMs <= grace) {
    return { mode: "field", field: input.recent };
  }
  return { mode: "helper" };
}

const NUMBER_WORDS: Record<string, string> = {
  zero: "0",
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
  half: ".5",
};

/** Number boxes (inputMode decimal/numeric) get digits, not words. */
export function speechForField(heard: string, inputMode?: string | null) {
  const text = heard.replace(/\s+/g, " ").trim();
  if (inputMode !== "decimal" && inputMode !== "numeric") return text;
  const swapped = text
    .toLowerCase()
    .split(" ")
    .map((word) => NUMBER_WORDS[word.replace(/[^a-z]/g, "")] ?? word)
    .join(" ");
  const match = swapped.match(/\d+(?:\.\d+)?|\.\d+/);
  return match ? match[0] : "";
}

/** Add what was heard to what’s already in the box: one space, capital after a full stop. */
export function joinDictation(base: string, heard: string) {
  const add = heard.replace(/\s+/g, " ").trim();
  if (!add) return base;
  const head = base.replace(/\s+$/, "");
  if (!head) return add.charAt(0).toUpperCase() + add.slice(1);
  const sentence = /[.!?]$/.test(head);
  return `${head} ${sentence ? add.charAt(0).toUpperCase() + add.slice(1) : add}`;
}
