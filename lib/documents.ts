export type LineKind = "LABOR" | "MATERIAL" | "OTHER";

export type DocLineDraft = {
  id?: string;
  kind: LineKind;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  /** Good/better/best tier: "" = untiered, or "good" | "better" | "best". */
  tier?: string;
};

export type DocLineDTO = DocLineDraft & { id: string; amount: number };

export function roundMoney(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function lineAmount(line: Pick<DocLineDraft, "quantity" | "rate">) {
  return roundMoney((Number(line.quantity) || 0) * (Number(line.rate) || 0));
}

export function documentTotals(lines: DocLineDraft[], taxRate = 0) {
  const labor = roundMoney(
    lines.filter((line) => line.kind === "LABOR").reduce((sum, line) => sum + lineAmount(line), 0)
  );
  const materials = roundMoney(
    lines.filter((line) => line.kind === "MATERIAL").reduce((sum, line) => sum + lineAmount(line), 0)
  );
  const other = roundMoney(
    lines.filter((line) => line.kind !== "LABOR" && line.kind !== "MATERIAL").reduce((sum, line) => sum + lineAmount(line), 0)
  );
  const subtotal = roundMoney(labor + materials + other);
  const tax = roundMoney(subtotal * ((Number(taxRate) || 0) / 100));
  return { labor, materials, other, subtotal, tax, total: roundMoney(subtotal + tax) };
}

export function lineHasAmount(line: Pick<DocLineDraft, "quantity" | "rate">) {
  return lineAmount(line) > 0;
}

/** A row counts if it has a dollar amount — description can fill in on save. */
export function isPricedLine(line: Pick<DocLineDraft, "description" | "quantity" | "rate">) {
  if (lineHasAmount(line)) return true;
  return Boolean(line.description.trim() && Number(line.rate) > 0);
}

export function defaultScopeLabel(kind: LineKind) {
  if (kind === "LABOR") return "General Labor / Scope";
  if (kind === "MATERIAL") return "General Materials / Scope";
  return "General Scope";
}

export function fillScopeDescription(line: DocLineDraft): DocLineDraft {
  if (line.description.trim() || !lineHasAmount(line)) return line;
  return { ...line, description: defaultScopeLabel(line.kind) };
}

/** Fill blank priced rows so the itemized list matches labor / materials / total. */
export function ensureScopeLines(lines: DocLineDraft[]): DocLineDraft[] {
  const filled = lines.map(fillScopeDescription);
  const live = filled.filter((line) => line.description.trim() || lineHasAmount(line));
  return live.length ? live : filled;
}

export function estimateIsReady(lines: DocLineDraft[], taxRate = 0) {
  if (lines.some(isPricedLine)) return true;
  const totals = documentTotals(lines, taxRate);
  return totals.labor > 0 || totals.materials > 0 || totals.other > 0 || totals.total > 0;
}

export function blankLine(kind: LineKind = "OTHER"): DocLineDraft {
  return {
    kind,
    description: "",
    quantity: kind === "LABOR" ? 1 : 1,
    unit: kind === "LABOR" ? "hr" : "ea",
    rate: 0,
  };
}

export const DEFAULT_ESTIMATE_TERMS =
  "This estimate is valid for 30 days. Work is scheduled after written acceptance.";
export const DEFAULT_INVOICE_TERMS = "Payment due upon completion. Net 15. Thank you for your business.";

/** Invoice terms signed with the shop's own name (falls back to the generic line). */
export function invoiceTermsFor(company?: string | null) {
  const name = company?.trim();
  return name ? `Payment due upon completion. Net 15. Thank you for choosing ${name}.` : DEFAULT_INVOICE_TERMS;
}

/**
 * Fallbacks only. Every shop's name, town, and logo come from its own settings (sign-up / Company).
 * `platform` is the app brand (Job Command) and is the same for every shop.
 */
export const BRAND = {
  tradeName: "Your shop",
  platform: "Job Command",
  city: "",
};

export function companyHeading(businessName?: string | null) {
  return businessName?.trim() || BRAND.tradeName;
}
