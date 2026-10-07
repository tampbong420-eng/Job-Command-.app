import { DEFAULT_PRICING, type PricingRates } from "@/lib/pricing-rates";

export type MarketSource = {
  title: string;
  url: string;
  note: string;
};

export type MarketSnapshot = {
  region: string;
  rates: PricingRates;
  sources: MarketSource[];
  fetchedAt: string;
  live: boolean;
};

/** Where and what a shop prices: its town/state from Company → Address and its trade from sign-up. */
export type MarketPlace = {
  /** "Tulsa, OK"; "" when the shop has no address yet. */
  region: string;
  /** Full state name for searches ("Oklahoma"); "" when unknown. */
  state: string;
  /** Trade label ("Painting", "Plumbing"…); "" = the original painting profile. */
  trade: string;
};

const NO_PLACE: MarketPlace = { region: "", state: "", trade: "" };

/**
 * Offline floor used when the web check finds nothing. The numbers are the stock rates in
 * lib/pricing-rates.ts (labor $/hr, finish and primer $/gal); the label is the shop's own area.
 */
export function regionalFloor(region = ""): MarketSnapshot {
  const where = region.trim() || "your area";
  return {
    region: where,
    rates: {
      labor: 48,
      duration: 54,
      primer: 30,
      hourFactor: 1,
    },
    sources: [
      {
        title: "Stock floor",
        url: "https://www.bls.gov/oes/current/oes_nat.htm",
        note: `No live prices found for ${where}; using the app's stock rates until your own jobs teach it your numbers.`,
      },
    ],
    fetchedAt: "local",
    live: false,
  };
}

/** Kept for older imports: the floor with no town attached. */
export const REGIONAL_FLOOR: MarketSnapshot = regionalFloor("");

const CACHE_MS = 12 * 60 * 60 * 1000;
let cache: { at: number; key: string; snap: MarketSnapshot } | null = null;

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function extractHourlyRates(text: string) {
  const found: number[] = [];
  const re =
    /\$?\s*(\d{2,3}(?:\.\d{1,2})?)\s*(?:–|-|to)\s*\$?\s*(\d{2,3}(?:\.\d{1,2})?)\s*(?:\/\s*)?(?:per\s+)?(?:hr|hour)s?\b|\$?\s*(\d{2,3}(?:\.\d{1,2})?)\s*(?:\/\s*)?(?:per\s+)?(?:hr|hour)s?\b/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const a = Number(match[1] || match[3]);
    const b = Number(match[2] || match[1] || match[3]);
    if (a >= 28 && a <= 95) found.push(a);
    if (b >= 28 && b <= 95) found.push(b);
  }
  const meanHour = text.match(/mean\s+hourly\s+wage[^$]*\$(\d{2,3}(?:\.\d{1,2})?)/i);
  if (meanHour) {
    const value = Number(meanHour[1]);
    if (value >= 28 && value <= 95) found.push(value);
  }
  return found;
}

export function extractGallonRates(text: string) {
  const found: number[] = [];
  const re =
    /\$?\s*(\d{2,3}(?:\.\d{1,2})?)\s*(?:–|-|to)\s*\$?\s*(\d{2,3}(?:\.\d{1,2})?)\s*(?:\/\s*)?(?:per\s+)?(?:gallon|gal)\b|\$?\s*(\d{2,3}(?:\.\d{1,2})?)\s*(?:\/\s*)?(?:per\s+)?(?:gallon|gal)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const a = Number(match[1] || match[3]);
    const b = Number(match[2] || match[1] || match[3]);
    if (a >= 22 && a <= 90) found.push(a);
    if (b >= 22 && b <= 90) found.push(b);
  }
  return found;
}

export function blendMarketRates(memory: PricingRates, web: Partial<PricingRates>, live: boolean): PricingRates {
  const pick = (key: keyof PricingRates, min: number, max: number) => {
    const fromWeb = web[key];
    const fromMem = memory[key];
    if (live && fromWeb && fromWeb > 0) return clamp(fromWeb * 0.65 + fromMem * 0.35, min, max);
    return clamp(fromMem || DEFAULT_PRICING[key], min, max);
  };
  return {
    labor: pick("labor", 35, 85),
    duration: pick("duration", 32, 78),
    primer: pick("primer", 18, 48),
    hourFactor: clamp(memory.hourFactor || 1, 0.85, 1.35),
  };
}

export function describeMarket(snapshot: MarketSnapshot) {
  const rate = `labor $${Math.round(snapshot.rates.labor)}/hr, Duration $${Math.round(snapshot.rates.duration)}/gal, primer $${Math.round(snapshot.rates.primer)}/gal`;
  const live = snapshot.live ? "Live web check" : "Regional floor";
  const notes = snapshot.sources.map((source) => `${source.title}: ${source.note}`).join(" ");
  return `${live} for ${snapshot.region}. ${rate}. ${notes}`.trim();
}

async function readUrl(url: string) {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), 3500);
  try {
    const response = await fetch(url, {
      signal: control.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "JobCommand/1.0 (contractor estimate research)",
      },
    });
    if (!response.ok) return "";
    return await response.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

function isPaintingTrade(trade: string) {
  return !trade.trim() || /paint/i.test(trade);
}

/** Search pages for the shop's own trade and area. Nothing here names one town. */
export function researchUrls(place: MarketPlace = NO_PLACE) {
  const trade = place.trade.trim() || "Painting";
  const area = [place.region.replace(/,.*$/, ""), place.state].filter(Boolean).join(" ");
  const q = (text: string) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(text).replace(/%20/g, "+")}`;
  const urls = [
    {
      title: `${area || "Local"} ${trade.toLowerCase()} cost search`,
      url: q(`${trade.toLowerCase()} contractor cost per hour ${area} labor rate`.replace(/\s+/g, " ").trim()),
    },
  ];
  if (isPaintingTrade(trade)) {
    urls.unshift({ title: "BLS painters hourly wage", url: "https://www.bls.gov/oes/current/oes472141.htm" });
    urls.push({
      title: "Exterior paint gallon pricing",
      url: q(`Sherwin Williams Duration price per gallon ${place.state}`.trim()),
    });
  }
  return urls;
}

async function shopMarketPlace(): Promise<MarketPlace> {
  try {
    const { loadShopMarketPlace } = await import("@/lib/shop-identity-server");
    return await loadShopMarketPlace();
  } catch {
    return NO_PLACE;
  }
}

export async function fetchMarketPricing(
  memory: PricingRates = DEFAULT_PRICING,
  where?: MarketPlace
): Promise<MarketSnapshot> {
  const place = where || (await shopMarketPlace());
  const key = `${place.region}|${place.state}|${place.trade}`;
  if (cache && cache.key === key && Date.now() - cache.at < CACHE_MS) return cache.snap;
  const floor = regionalFloor(place.region);

  const hours: number[] = [];
  const gallons: number[] = [];
  const sources: MarketSource[] = [];

  await Promise.all(
    researchUrls(place).map(async (source) => {
      const html = await readUrl(source.url);
      if (!html) return;
      const foundHours = extractHourlyRates(html);
      const foundGallons = extractGallonRates(html);
      hours.push(...foundHours);
      gallons.push(...foundGallons);
      if (foundHours.length || foundGallons.length) {
        sources.push({
          title: source.title,
          url: source.url,
          note: foundHours.length
            ? `Web pages are quoting about $${Math.round(median(foundHours))}/hr.`
            : `Paint pages are quoting about $${Math.round(median(foundGallons))}/gal.`,
        });
      }
    })
  );

  const live = hours.length > 0 || gallons.length > 0;
  const web: Partial<PricingRates> = {
    labor: hours.length ? median(hours) : undefined,
    duration: gallons.length ? median(gallons) : undefined,
    primer: gallons.length ? Math.round(median(gallons) * 0.55) : undefined,
  };
  const snap: MarketSnapshot = {
    region: floor.region,
    rates: blendMarketRates(memory, live ? web : floor.rates, live),
    sources: sources.length ? sources : floor.sources,
    fetchedAt: new Date().toISOString(),
    live,
  };
  cache = { at: Date.now(), key, snap };
  return snap;
}
