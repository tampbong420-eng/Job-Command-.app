/** Address suggestions for the signup "Shop address" box (pure parsing; the route does the fetch). */
export type AddressHit = { line1: string; line2: string; full: string };

const STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT",
  delaware: "DE", "district of columbia": "DC", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT",
  nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA",
  "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
  vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};

export function stateCode(state: string) {
  const clean = state.trim();
  if (/^[A-Z]{2}$/.test(clean)) return clean;
  return STATES[clean.toLowerCase()] || clean;
}

const SHORT: [RegExp, string][] = [
  [/\bAvenue\b/, "Ave"],
  [/\bStreet\b/, "St"],
  [/\bRoad\b/, "Rd"],
  [/\bDrive\b/, "Dr"],
  [/\bBoulevard\b/, "Blvd"],
  [/\bLane\b/, "Ln"],
  [/\bCourt\b/, "Ct"],
  [/\bHighway\b/, "Hwy"],
  [/\bSuite\b/, "Ste"],
];

export function shortStreet(street: string) {
  return SHORT.reduce((text, [pattern, short]) => text.replace(pattern, short), street.trim());
}

function hit(line1: string, line2: string): AddressHit | null {
  const a = line1.replace(/\s+/g, " ").trim();
  const b = line2.replace(/\s+/g, " ").replace(/^,\s*/, "").trim();
  if (!a) return null;
  return { line1: a, line2: b, full: b ? `${a}, ${b}` : a };
}

function dedupe(hits: (AddressHit | null)[], max = 3) {
  const seen = new Set<string>();
  const out: AddressHit[] = [];
  for (const item of hits) {
    if (!item || seen.has(item.full.toLowerCase())) continue;
    seen.add(item.full.toLowerCase());
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

type PhotonFeature = { properties?: Record<string, unknown> };

/** OSM Photon features → "118 Central Ave" / "Hot Springs, AR 71901". US only, numbered addresses first. */
export function addressHitsFromPhoton(data: unknown, typed = ""): AddressHit[] {
  const features = ((data as { features?: PhotonFeature[] } | null)?.features || []).map((f) => f.properties || {});
  const str = (value: unknown) => (typeof value === "string" ? value : "");
  const number = typed.match(/^\s*(\d+[A-Za-z]?)\b/)?.[1] || "";
  // Words the owner typed or said (street + town), so "118 Central Ave Hot Springs" ranks Hot Springs first.
  const words = shortStreet(typed)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !/^\d+$/.test(word));
  const rows = features
    .filter((p) => str(p.countrycode).toUpperCase() === "US")
    .map((p) => {
      const street = shortStreet(str(p.street) || (str(p.type) === "street" ? str(p.name) : ""));
      const house = str(p.housenumber) || (street && number ? number : "");
      const line1 = street ? `${house} ${street}`.trim() : str(p.name);
      const place = str(p.city) || str(p.town) || str(p.village) || str(p.county);
      const line2 = [place, [stateCode(str(p.state)), str(p.postcode)].filter(Boolean).join(" ")].filter(Boolean).join(", ");
      const text = `${line1} ${line2}`.toLowerCase();
      const match = words.filter((word) => text.includes(word)).length;
      const exactHouse = number && str(p.housenumber) === number ? 0 : 1;
      return { match, score: exactHouse * 2 + (street ? 0 : 1), hit: hit(line1, line2) };
    })
    .sort((a, b) => b.match - a.match || a.score - b.score)
    .map((row) => row.hit);
  return dedupe(rows);
}

/** Google Places Autocomplete (New) → same shape. */
export function addressHitsFromGoogle(data: unknown): AddressHit[] {
  const suggestions = (data as { suggestions?: { placePrediction?: { structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } } } }[] } | null)
    ?.suggestions || [];
  return dedupe(
    suggestions.map((s) => {
      const f = s.placePrediction?.structuredFormat;
      return hit(f?.mainText?.text || "", (f?.secondaryText?.text || "").replace(/,\s*USA$/, ""));
    })
  );
}
