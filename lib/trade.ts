export const TRADE_IDS = [
  "Painting",
  "Electrical",
  "Plumbing",
  "HVAC",
  "Asphalt",
  "Roofing",
  "Construction",
  "Remodeling",
  "Masonry",
  "Carpentry",
  "Concrete",
  "Drywall",
  "Flooring",
  "Landscaping",
  "Fencing",
  "Siding",
  "Other",
] as const;

export type TradeId = (typeof TRADE_IDS)[number];

export type TradeLexicon = {
  id: TradeId;
  label: string;
  choice: string;
  example: string;
  materials: string;
  visit: string;
  qtyHint: string;
  scope: string;
  shopLine: string;
};

export const TRADES: readonly TradeLexicon[] = [
  {
    id: "Painting",
    label: "Painting",
    choice: "Painting",
    example: "Top Gun Painting",
    materials: "paint, primer, and masking",
    visit: "site estimate",
    qtyHint: "paint gallons and labor hours",
    scope: "scrape, prime, and finish coats",
    shopLine: "a painting shop like Top Gun Painting in Hot Springs, AR",
  },
  {
    id: "Electrical",
    label: "Electrical",
    choice: "Electrical Panel",
    example: "Panel and branch circuits",
    materials: "wire, devices, and panel gear",
    visit: "site estimate",
    qtyHint: "circuits, devices, and labor hours",
    scope: "rough-in, devices, and trim",
    shopLine: "an electrical shop",
  },
  {
    id: "Plumbing",
    label: "Plumbing",
    choice: "Plumbing Rough-in",
    example: "Rough-in and fixtures",
    materials: "pipe, fittings, and fixtures",
    visit: "site estimate",
    qtyHint: "fixtures and labor hours",
    scope: "rough-in, fixtures, and trim",
    shopLine: "a plumbing shop",
  },
  {
    id: "HVAC",
    label: "HVAC",
    choice: "HVAC Changeouts",
    example: "Changeouts and service",
    materials: "equipment, line set, and refrigerant",
    visit: "site estimate",
    qtyHint: "tonnage and labor hours",
    scope: "changeout, charging, and startup",
    shopLine: "an HVAC shop",
  },
  {
    id: "Asphalt",
    label: "Asphalt",
    choice: "Asphalt Driveways",
    example: "Driveways and patch",
    materials: "asphalt, tack, and aggregate",
    visit: "site estimate",
    qtyHint: "tons and labor hours",
    scope: "prep, overlay, and roll",
    shopLine: "an asphalt crew",
  },
  {
    id: "Roofing",
    label: "Roofing",
    choice: "Roofing Tear-off",
    example: "Tear-off and shingles",
    materials: "shingles, felt, and flashing",
    visit: "site estimate",
    qtyHint: "squares and labor hours",
    scope: "tear-off, dry-in, and shingles",
    shopLine: "a roofing shop",
  },
  {
    id: "Construction",
    label: "Construction",
    choice: "Construction General Contracting",
    example: "General contracting",
    materials: "lumber, fasteners, and finishes",
    visit: "site estimate",
    qtyHint: "labor hours and material lots",
    scope: "framing, finishes, and punch",
    shopLine: "a general contractor shop",
  },
  {
    id: "Remodeling",
    label: "Remodeling",
    choice: "Remodeling Interior Remodels",
    example: "Interior remodels",
    materials: "finish materials and fixtures",
    visit: "site estimate",
    qtyHint: "rooms and labor hours",
    scope: "demo, rebuild, and finish",
    shopLine: "a remodeling shop",
  },
  {
    id: "Masonry",
    label: "Masonry",
    choice: "Masonry & Brick",
    example: "Brick, block, and stone",
    materials: "brick, block, stone, and mortar",
    visit: "site estimate",
    qtyHint: "square feet of wall and labor hours",
    scope: "tear-out, lay-up, and tuckpointing",
    shopLine: "a masonry shop",
  },
  {
    id: "Carpentry",
    label: "Carpentry",
    choice: "Carpentry & Framing",
    example: "Framing and trim",
    materials: "lumber, sheathing, trim, and fasteners",
    visit: "site estimate",
    qtyHint: "linear feet, sheets, and labor hours",
    scope: "framing, trim, and repairs",
    shopLine: "a carpentry crew",
  },
  {
    id: "Concrete",
    label: "Concrete",
    choice: "Concrete",
    example: "Slabs, drives, and walks",
    materials: "ready-mix, rebar, and forms",
    visit: "site estimate",
    qtyHint: "square feet, yards, and labor hours",
    scope: "tear-out, forms, pour, and finish",
    shopLine: "a concrete crew",
  },
  {
    id: "Drywall",
    label: "Drywall",
    choice: "Drywall",
    example: "Hang, tape, and finish",
    materials: "board, mud, tape, and bead",
    visit: "site estimate",
    qtyHint: "sheets, square feet, and labor hours",
    scope: "hang, tape, and finish coats",
    shopLine: "a drywall crew",
  },
  {
    id: "Flooring",
    label: "Flooring",
    choice: "Flooring",
    example: "Wood, tile, LVP, and carpet",
    materials: "flooring, underlayment, and trim",
    visit: "site estimate",
    qtyHint: "square feet and labor hours",
    scope: "tear-out, prep, install, and trim",
    shopLine: "a flooring shop",
  },
  {
    id: "Landscaping",
    label: "Landscaping",
    choice: "Landscaping & Lawn",
    example: "Lawns, beds, and cleanups",
    materials: "mulch, plants, sod, and stone",
    visit: "site visit",
    qtyHint: "visits, yards, and labor hours",
    scope: "mowing, beds, and cleanups",
    shopLine: "a lawn and landscape crew",
  },
  {
    id: "Fencing",
    label: "Fencing",
    choice: "Fencing & Decks",
    example: "Fences, gates, and decks",
    materials: "posts, pickets, panels, and concrete",
    visit: "site estimate",
    qtyHint: "linear feet and labor hours",
    scope: "posts, panels, and gates",
    shopLine: "a fence and deck crew",
  },
  {
    id: "Siding",
    label: "Siding",
    choice: "Siding & Gutters",
    example: "Siding and seamless gutters",
    materials: "siding, wrap, trim, and gutters",
    visit: "site estimate",
    qtyHint: "squares, linear feet, and labor hours",
    scope: "tear-off, wrap, siding, and gutters",
    shopLine: "a siding and gutter crew",
  },
  {
    id: "Other",
    label: "Other trade",
    choice: "Other Trade",
    example: "Specialty work",
    materials: "job materials",
    visit: "site estimate",
    qtyHint: "labor hours and materials",
    scope: "the work on the card",
    shopLine: "a trade shop",
  },
] as const;

export const DEFAULT_TRADE: TradeId = "Painting";

export function parseTrade(value: string | null | undefined): TradeLexicon {
  const raw = (value || "").trim();
  const hit =
    TRADES.find((trade) => trade.id.toLowerCase() === raw.toLowerCase()) ||
    TRADES.find((trade) => raw.toLowerCase().includes(trade.id.toLowerCase()));
  return hit || TRADES[0];
}

export function tradeVoiceBlurb(industry?: string | null) {
  const trade = parseTrade(industry);
  return `This shop is ${trade.shopLine}. Talk ${trade.label.toLowerCase()}: ${trade.scope}. Materials means ${trade.materials}. On the estimate visit, price ${trade.qtyHint}.`;
}
