import { prisma } from "@/lib/prisma";
import { DEFAULT_PRICING, type PricingRates } from "@/lib/pricing-rates";
import type { JobCostDTO } from "@/lib/types";

export type { PricingRates } from "@/lib/pricing-rates";
export { DEFAULT_PRICING } from "@/lib/pricing-rates";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function ema(prev: number, sample: number, count: number) {
  if (count <= 1 || prev <= 0) return sample;
  const weight = Math.min(0.4, 2 / (count + 1));
  return prev * (1 - weight) + sample * weight;
}

async function bump(key: string, sample: number) {
  if (!Number.isFinite(sample) || sample <= 0) return;
  const current = await prisma.priceMemory.findUnique({ where: { key } });
  const sampleCount = (current?.sampleCount || 0) + 1;
  const avgRate = ema(current?.avgRate || 0, sample, sampleCount);
  await prisma.priceMemory.upsert({
    where: { key },
    create: { key, avgRate: sample, sampleCount: 1 },
    update: { avgRate, sampleCount },
  });
}

export async function loadPricingRates(): Promise<PricingRates> {
  const rows = await prisma.priceMemory.findMany();
  const map = new Map(rows.map((row) => [row.key, row]));
  const labor = map.get("labor:hr");
  const paint = map.get("paint:gal");
  const primer = map.get("primer:gal");
  const hours = map.get("hourFactor");
  return {
    labor: labor && labor.sampleCount > 0 ? labor.avgRate : DEFAULT_PRICING.labor,
    duration: paint && paint.sampleCount > 0 ? paint.avgRate : DEFAULT_PRICING.duration,
    primer: primer && primer.sampleCount > 0 ? primer.avgRate : DEFAULT_PRICING.primer,
    hourFactor: hours && hours.sampleCount > 0 ? clamp(hours.avgRate, 0.85, 1.35) : 1,
  };
}

export async function learnFromJobCost(cost: JobCostDTO) {
  if (cost.laborHoursBudget > 0 && cost.laborHoursActual > 0) {
    await bump("hourFactor", cost.laborHoursActual / cost.laborHoursBudget);
  }
  if (cost.laborHoursBudget > 0 && cost.laborCostBudget > 0) {
    await bump("labor:hr", clamp(cost.laborCostBudget / cost.laborHoursBudget, 32, 85));
  }
  if (cost.materialBudget > 0 && cost.materialActual > 0) {
    const share = clamp(cost.materialActual / cost.materialBudget, 0.8, 1.4);
    await bump("paint:gal", DEFAULT_PRICING.duration * share);
    await bump("primer:gal", DEFAULT_PRICING.primer * share);
  }
}

export function describePricing(rates: PricingRates) {
  return `labor $${Math.round(rates.labor)}/hr, Duration paint $${Math.round(rates.duration)}/gal, primer $${Math.round(rates.primer)}/gal`;
}
