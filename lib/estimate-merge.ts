import { fillScopeDescription, lineAmount, type DocLineDraft } from "@/lib/documents";

export function lineKey(line: { kind: string; description: string }) {
  return `${line.kind}:${line.description.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

/** Keep the crew's edits. Only add new descriptions from talk or photos. */
export function mergeEditableLines(current: DocLineDraft[], incoming: DocLineDraft[]): DocLineDraft[] {
  const kept = current
    .filter((line) => line.description.trim() || lineAmount(line) > 0)
    .map(fillScopeDescription);
  const extras = incoming
    .filter((line) => line.description.trim() || lineAmount(line) > 0)
    .map(fillScopeDescription)
    .filter((line) => !kept.some((item) => lineKey(item) === lineKey(line)));
  if (!kept.length) return extras.length ? extras : current;
  return extras.length ? [...kept, ...extras] : kept;
}

export function fillEditableNotes(current: string, incoming?: string | null) {
  const next = (incoming || "").trim();
  if (!next) return current;
  if (!current.trim()) return next;
  return current;
}
