export type PricingRates = {
  labor: number;
  duration: number;
  primer: number;
  hourFactor: number;
};

export const DEFAULT_PRICING: PricingRates = {
  labor: 45,
  duration: 52,
  primer: 28,
  hourFactor: 1,
};
