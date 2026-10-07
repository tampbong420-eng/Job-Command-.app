import type { DocLineDraft } from "@/lib/documents";
import { DEFAULT_PRICING, type PricingRates } from "@/lib/pricing-rates";

export type PhotoMeasure = {
  label: string;
  value: string;
};

export type PhotoEstimateDraft = {
  notes: string;
  measurements: PhotoMeasure[];
  lines: DocLineDraft[];
  source: "ai" | "local";
};

const SF_PER_GAL = 350;
const SF_PER_HOUR = 150;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function roundTo(n: number, step: number) {
  return Math.max(step, Math.round(n / step) * step);
}

function hourUnit(unit: string) {
  return /^(hr|hrs|hour|hours)$/i.test(unit.trim());
}

export function applyPricingRates(lines: DocLineDraft[], rates: PricingRates): DocLineDraft[] {
  const factor = clamp(rates.hourFactor || 1, 0.85, 1.35);
  return lines.map((line) => {
    if (line.kind === "LABOR" && hourUnit(line.unit)) {
      return {
        ...line,
        quantity: roundTo((Number(line.quantity) || 0) * factor, 0.5),
        rate: rates.labor,
      };
    }
    if (line.kind === "MATERIAL" && /primer/i.test(line.description)) {
      return { ...line, rate: rates.primer };
    }
    if (line.kind === "MATERIAL" && /paint|enamel|duration/i.test(line.description)) {
      return { ...line, rate: rates.duration };
    }
    return line;
  });
}

export function estimateFromSitePhotos(
  input: {
    jobName: string;
    client: string;
    address: string;
    notes: string;
    photoCount: number;
  },
  rates: PricingRates = DEFAULT_PRICING
): PhotoEstimateDraft {
  const labor = rates.labor;
  const duration = rates.duration;
  const primer = rates.primer;
  const factor = clamp(rates.hourFactor || 1, 0.85, 1.35);
  const blob = `${input.notes} ${input.jobName}`.toLowerCase();
  const cabinets = /cabinet|kitchen box|vanity/.test(blob);
  const exterior = /exterior|siding|trim|fascia|eave|house wrap|outsid/.test(blob);
  const interior = /interior|room|wall|ceiling|bedroom|living/.test(blob) || (!cabinets && !exterior);
  const photos = Math.max(1, input.photoCount);

  if (cabinets) {
    const doors = clamp(6 + photos * 2, 8, 24);
    const hours = roundTo(doors * 0.45 * factor, 0.5);
    const gal = Math.max(1, Math.ceil(doors / 10));
    return {
      source: "local",
      notes: `Cabinet refinish at ${input.address || input.client}: ${doors} doors/drawer fronts from site photos. Degloss, prime, two coats enamel, hardware reset.`,
      measurements: [
        { label: "Doors / drawers", value: String(doors) },
        { label: "Photos read", value: String(photos) },
      ],
      lines: [
        { kind: "LABOR", description: "Cabinet prep, spray, and rehang", quantity: hours, unit: "hr", rate: labor },
        { kind: "MATERIAL", description: "Enamel / cabinet paint", quantity: gal, unit: "gal", rate: duration },
        { kind: "MATERIAL", description: "Bonding primer", quantity: Math.max(1, Math.ceil(gal / 2)), unit: "gal", rate: primer },
        { kind: "OTHER", description: "Masking, hardware bags, and site protection", quantity: 1, unit: "ea", rate: 85 },
      ],
    };
  }

  const elevationSf = exterior ? 420 : 380;
  const walls = roundTo(photos * elevationSf, 50);
  const gal = Math.max(2, Math.ceil(walls / SF_PER_GAL));
  const hours = roundTo((walls / SF_PER_HOUR) * factor, 0.5);
  const kind = exterior ? "Exterior" : interior ? "Interior" : "Site";

  return {
    source: "local",
    notes: `${kind} paint at ${input.address || input.client}. Site photos show about ${walls} sf of paintable surface. Prep, prime bare spots, two finish coats. Protection and daily cleanup included.`,
    measurements: [
      { label: "Paintable area", value: `${walls} sf` },
      { label: "Elevations / rooms in photos", value: String(photos) },
      { label: "Finish coats", value: "2" },
    ],
    lines: [
      { kind: "LABOR", description: `${kind} prep, cut, roll, and cleanup`, quantity: hours, unit: "hr", rate: labor },
      { kind: "MATERIAL", description: "Duration / finish paint", quantity: gal, unit: "gal", rate: duration },
      { kind: "MATERIAL", description: "Primer / spot prime", quantity: Math.max(1, Math.ceil(gal / 3)), unit: "gal", rate: primer },
      { kind: "OTHER", description: "Caulk, tape, plastic, and drop cloths", quantity: 1, unit: "ea", rate: exterior ? 95 : 65 },
    ],
  };
}
