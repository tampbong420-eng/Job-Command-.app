/**
 * Per-trade profile: one place that decides what signup asks, which estimate numbers a shop starts
 * with, which questions come later (just in time), and how the AI co-pilot talks.
 *
 * lib/trade.ts keeps the short lexicon the co-pilot already used (materials, qtyHint, scope …);
 * this file layers the signup + estimate + vocabulary data on top of it. Painting stays the
 * reference trade: its AI wording is the original Top Gun Painting prompt, word for word.
 */
import { parseTrade, type TradeId } from "@/lib/trade";

export const PICKER_TRADES = [
  "Painting",
  "Roofing",
  "Asphalt",
  "Electrical",
  "Plumbing",
  "Masonry",
  "HVAC",
  "Carpentry",
  "Concrete",
  "Drywall",
  "Flooring",
  "Landscaping",
  "Fencing",
  "Siding",
  "Remodeling",
] as const satisfies readonly TradeId[];

export type ProfileId = (typeof PICKER_TRADES)[number] | "Other";

export type ServiceTile = { id: string; label: string; icon: string; on?: boolean };

export type RateField = { key: string; label: string; unit: string; value: number; step: number; prefix?: string };
export type ChoiceField = { key: string; label: string; options: { value: string; label: string }[]; value: string };
export type ExtraField = {
  key: string;
  label: string;
  value: number;
  /** money → "$89", pct → "30%", mult → "1.5×", num → "10" */
  kind: "money" | "pct" | "mult" | "num";
  suffix?: string;
};

export type LaterQuestion = { key: string; label: string; when: string };

export type TradeAi = {
  /** "what they want painted" in the lead-card prompt. */
  leadNoun: string;
  /** Allowed units for estimate lines. */
  units: string;
  /** Example measurements for the site-talk prompt. */
  measures: string;
  /** Example client asks. */
  requests: string;
  /** Fallback rates line when they did not say a price. */
  rates: string;
  /** One scope sentence the way the lead would say it. */
  scopeLine: string;
  /** Words this trade uses. */
  vocab: string[];
  /** What a photo of the job shows (photo prompts). */
  photoScope: string;
};

export type TradeProfile = {
  id: ProfileId;
  /** Tile label (plain words a non-expert recognizes). */
  label: string;
  /** Optional second line on the tile, only where the label is jargon. */
  sub?: string;
  icon: string;
  /** "painters", "electricians" — "Common for painters." */
  who: string;
  services: ServiceTile[];
  estimate: {
    rate: RateField;
    choice?: ChoiceField;
    extras: ExtraField[];
    markupLabel: string;
    markup: number;
    deposit: number;
    validDays: number;
  };
  later: LaterQuestion[];
  ai: TradeAi;
};

const LICENSE: LaterQuestion = { key: "license", label: "License & insurance #", when: "First estimate" };

const PROFILES: Record<ProfileId, TradeProfile> = {
  Painting: {
    id: "Painting",
    label: "Painting",
    icon: "Painting",
    who: "painters",
    services: [
      { id: "interior", label: "Interior", icon: "house", on: true },
      { id: "exterior", label: "Exterior", icon: "sun", on: true },
      { id: "cabinets", label: "Cabinets", icon: "cab", on: true },
      { id: "decks-fences", label: "Decks & fences", icon: "deck", on: true },
      { id: "commercial", label: "Commercial", icon: "bldg" },
      { id: "drywall-repair", label: "Drywall repair", icon: "Drywall" },
      { id: "pressure-wash", label: "Pressure wash", icon: "spray" },
      { id: "stain-seal", label: "Stain & seal", icon: "brush" },
    ],
    estimate: {
      rate: { key: "laborRate", label: "Labor rate", unit: "/ hour", value: 55, step: 5, prefix: "$" },
      extras: [],
      markupLabel: "Markup on paint & supplies",
      markup: 20,
      deposit: 25,
      validDays: 30,
    },
    later: [
      { key: "supplier", label: "Paint brand & store", when: "First materials list" },
      { key: "rrp", label: "Lead-safe (RRP) cert", when: "Pre-1978 house" },
      LICENSE,
    ],
    ai: {
      leadNoun: "what they want painted",
      units: "hr, gal, ea, sf, lf, sheet, or lot",
      measures: "Area 1800 sf, Labor 8 hr, Linear 24 lf, Coats 2",
      requests: "trim color, leave the brick, don't paint the floor",
      rates: "Use Hot Springs paint rates around $45/hr labor and $52/gal paint when they didn't say a price.",
      scopeLine: "Scrape and prime the fascia, two coats Duration.",
      vocab: ["gallons", "coats", "sheen", "primer", "SW/BM color codes", "sq ft of wall"],
      photoScope: "rooms, trim, elevations, prep",
    },
  },
  Roofing: {
    id: "Roofing",
    label: "Roofing",
    icon: "Roofing",
    who: "roofers",
    services: [
      { id: "replacement", label: "Full replacement", icon: "Roofing", on: true },
      { id: "repairs", label: "Repairs & leaks", icon: "drop", on: true },
      { id: "storm", label: "Storm & insurance", icon: "storm", on: true },
      { id: "metal", label: "Metal roofs", icon: "metal" },
      { id: "flat", label: "Flat / low-slope", icon: "flat" },
      { id: "gutters", label: "Gutters", icon: "Siding" },
      { id: "inspections", label: "Inspections", icon: "search", on: true },
      { id: "commercial", label: "Commercial", icon: "bldg" },
    ],
    estimate: {
      rate: { key: "pricePerSquare", label: "Price per square", unit: "/ SQ", value: 450, step: 25, prefix: "$" },
      choice: {
        key: "tearoffLayers",
        label: "Tear-off layers you usually see",
        options: [
          { value: "1", label: "1" },
          { value: "2", label: "2" },
          { value: "3", label: "3+" },
          { value: "0", label: "None" },
        ],
        value: "1",
      },
      extras: [
        { key: "extraLayer", label: "Extra layer tear-off", value: 50, kind: "money", suffix: "/SQ" },
        { key: "waste", label: "Waste factor", value: 10, kind: "pct" },
      ],
      markupLabel: "Markup on materials",
      markup: 15,
      deposit: 50,
      validDays: 30,
    },
    later: [
      { key: "brands", label: "Shingle brands", when: "First materials list" },
      { key: "supplier", label: "Supplier & dumpster", when: "First materials list" },
      { key: "mfr-cert", label: "Manufacturer cert #", when: "First warranty upgrade" },
      LICENSE,
    ],
    ai: {
      leadNoun: "what roof work they need",
      units: "sq, lf, ea, hr, bundle, roll, or lot",
      measures: "Roof 28 sq, Pitch 6/12, Layers 2, Drip edge 180 lf",
      requests: "match the shingle color, save the satellite dish, protect the flower beds",
      rates: "Use about $450 per square installed and $50 per square for each extra layer when they didn't say a price.",
      scopeLine: "Tear off two layers to the deck, ice and water at the eaves, Timberline HDZ Charcoal.",
      vocab: ["squares", "layers", "pitch", "drip edge", "ice & water", "ridge vent", "decking"],
      photoScope: "roof planes, pitch, layers, flashing, vents, decking",
    },
  },
  Asphalt: {
    id: "Asphalt",
    label: "Asphalt & Paving",
    icon: "Asphalt",
    who: "paving crews",
    services: [
      { id: "driveways", label: "Driveways", icon: "Asphalt", on: true },
      { id: "lots", label: "Parking lots", icon: "bldg", on: true },
      { id: "sealcoat", label: "Sealcoating", icon: "brush", on: true },
      { id: "patching", label: "Patching", icon: "wrench", on: true },
      { id: "striping", label: "Striping", icon: "deck" },
      { id: "crack-fill", label: "Crack fill", icon: "drop" },
      { id: "overlay", label: "Overlays", icon: "flat" },
      { id: "commercial", label: "Commercial", icon: "bldg" },
    ],
    estimate: {
      rate: { key: "pricePerSf", label: "Paving price per sq ft", unit: "/ sq ft", value: 3.5, step: 0.25, prefix: "$" },
      choice: {
        key: "thickness",
        label: "Usual thickness",
        options: [
          { value: "2", label: "2 in" },
          { value: "3", label: "3 in" },
          { value: "4", label: "4 in" },
        ],
        value: "2",
      },
      extras: [
        { key: "mobilization", label: "Mobilization fee", value: 350, kind: "money" },
        { key: "sealcoat", label: "Sealcoat per sq ft", value: 0.25, kind: "money" },
      ],
      markupLabel: "Markup on materials",
      markup: 15,
      deposit: 25,
      validDays: 30,
    },
    later: [
      { key: "supplier", label: "Asphalt plant / supplier", when: "First materials list" },
      LICENSE,
    ],
    ai: {
      leadNoun: "what paving they need",
      units: "sf, sy, ton, lf, hr, or lot",
      measures: "Area 2400 sf, Thickness 2 in, Tons 30, Linear 120 lf",
      requests: "keep the apron, fix the low spot, stripe 12 stalls",
      rates: "Use about $3.50/sf for a 2-inch overlay and $0.25/sf for sealcoat when they didn't say a price.",
      scopeLine: "Mill the edges, tack coat, two inches of hot mix, roll it tight.",
      vocab: ["tons", "sq ft", "inches thick", "tack coat", "base", "sealcoat", "striping"],
      photoScope: "pavement area, cracks, low spots, edges, drainage",
    },
  },
  Electrical: {
    id: "Electrical",
    label: "Electrical",
    icon: "Electrical",
    who: "electricians",
    services: [
      { id: "service-calls", label: "Service calls", icon: "van", on: true },
      { id: "panels", label: "Panel upgrades", icon: "panel", on: true },
      { id: "outlets", label: "Outlets & switches", icon: "outlet", on: true },
      { id: "lighting", label: "Lights & fans", icon: "bulb", on: true },
      { id: "ev", label: "EV chargers", icon: "ev" },
      { id: "generators", label: "Generators", icon: "gen" },
      { id: "new-construction", label: "New construction", icon: "frame" },
      { id: "commercial", label: "Commercial", icon: "bldg" },
    ],
    estimate: {
      rate: { key: "laborRate", label: "Hourly rate", unit: "/ hour", value: 95, step: 5, prefix: "$" },
      choice: {
        key: "licenseType",
        label: "Your license",
        options: [
          { value: "master", label: "Master" },
          { value: "journeyman", label: "Journeyman" },
          { value: "residential", label: "Residential" },
        ],
        value: "master",
      },
      extras: [{ key: "serviceCall", label: "Service-call fee", value: 89, kind: "money" }],
      markupLabel: "Markup on parts",
      markup: 30,
      deposit: 0,
      validDays: 30,
    },
    later: [
      { key: "license", label: "Master / journeyman license #", when: "First estimate" },
      { key: "permits", label: "Who pulls permits", when: "First permit job" },
      { key: "supplier", label: "Supply house", when: "First parts list" },
    ],
    ai: {
      leadNoun: "what electrical work they need",
      units: "hr, ea, lf, circuit, or lot",
      measures: "Circuits 3, Wire 120 lf, Panel 200A, Devices 14",
      requests: "keep the old fixture, GFCI by the sink, no holes in the plaster",
      rates: "Use about $95/hr labor and an $89 service call when they didn't say a price.",
      scopeLine: "Swap the 100-amp panel for a 200, new main breaker, label every circuit.",
      vocab: ["amps", "breakers", "circuits", "AWG wire", "GFCI/AFCI", "permits"],
      photoScope: "panel, breakers, wiring, devices, fixtures",
    },
  },
  Plumbing: {
    id: "Plumbing",
    label: "Plumbing",
    icon: "Plumbing",
    who: "plumbers",
    services: [
      { id: "service-repair", label: "Service & repair", icon: "wrench", on: true },
      { id: "water-heaters", label: "Water heaters", icon: "heater", on: true },
      { id: "drains", label: "Drains & sewer", icon: "drain", on: true },
      { id: "leaks", label: "Leak detection", icon: "drop" },
      { id: "fixtures", label: "Fixtures", icon: "faucet", on: true },
      { id: "repipes", label: "Repipes", icon: "pipe" },
      { id: "new-construction", label: "New construction", icon: "frame" },
      { id: "gas", label: "Gas lines", icon: "flame" },
    ],
    estimate: {
      rate: { key: "laborRate", label: "Hourly rate", unit: "/ hour", value: 105, step: 5, prefix: "$" },
      choice: {
        key: "tripFee",
        label: "Trip fee",
        options: [
          { value: "0", label: "None" },
          { value: "49", label: "$49" },
          { value: "79", label: "$79" },
          { value: "99", label: "$99" },
        ],
        value: "79",
      },
      extras: [{ key: "afterHours", label: "After-hours rate", value: 1.5, kind: "mult" }],
      markupLabel: "Markup on parts",
      markup: 25,
      deposit: 0,
      validDays: 30,
    },
    later: [
      { key: "license", label: "Master plumber license #", when: "First estimate" },
      { key: "backflow", label: "Backflow tester cert", when: "First backflow test" },
      { key: "supplier", label: "Supply house & on-call nights", when: "First parts list" },
    ],
    ai: {
      leadNoun: "what plumbing they need",
      units: "hr, ea, lf, gal, or lot",
      measures: "Heater 50 gal, Pipe 40 lf PEX, Fixtures 3",
      requests: "haul the old tank, keep the shutoff reachable, no wall cuts in the bath",
      rates: "Use about $105/hr labor and a $79 trip fee when they didn't say a price.",
      scopeLine: "Pull the old 50-gallon gas heater, set a new one, new flex lines and expansion tank.",
      vocab: ["gallons", "PEX/copper", "fixtures", "shutoffs", "trip fee", "after-hours"],
      photoScope: "fixtures, piping, water heater, drains, leaks",
    },
  },
  Masonry: {
    id: "Masonry",
    label: "Masonry & Brick",
    icon: "Masonry",
    who: "masons",
    services: [
      { id: "brick-repair", label: "Brick repair", icon: "Masonry", on: true },
      { id: "tuckpointing", label: "Tuckpointing", icon: "brush", on: true },
      { id: "stone-veneer", label: "Stone veneer", icon: "Masonry", on: true },
      { id: "chimneys", label: "Chimneys", icon: "house", on: true },
      { id: "retaining-walls", label: "Retaining walls", icon: "deck" },
      { id: "block-walls", label: "Block walls", icon: "Masonry" },
      { id: "patios-steps", label: "Patios & steps", icon: "Concrete" },
      { id: "fireplaces", label: "Fireplaces", icon: "flame" },
    ],
    estimate: {
      rate: { key: "laborRate", label: "Labor rate", unit: "/ hour", value: 65, step: 5, prefix: "$" },
      choice: {
        key: "priceBy",
        label: "You usually price brick work by",
        options: [
          { value: "sf", label: "Sq ft" },
          { value: "hour", label: "Hour" },
          { value: "job", label: "Per job" },
        ],
        value: "sf",
      },
      extras: [{ key: "veneerSf", label: "Veneer price per sq ft", value: 28, kind: "money" }],
      markupLabel: "Markup on brick & mortar",
      markup: 20,
      deposit: 25,
      validDays: 30,
    },
    later: [
      { key: "supplier", label: "Brick & stone supplier", when: "First materials list" },
      LICENSE,
    ],
    ai: {
      leadNoun: "what masonry work they need",
      units: "sf, lf, ea, hr, ton, pallet, or lot",
      measures: "Wall 320 sf, Joints 180 lf, Chimney 1, Brick 2 pallets",
      requests: "match the old mortar color, save the good brick, keep the mailbox",
      rates: "Use about $65/hr labor and $28/sf for veneer when they didn't say a price.",
      scopeLine: "Grind and tuckpoint the north wall, match the buff mortar, rebuild the chimney cap.",
      vocab: ["sq ft", "courses", "mortar", "tuckpoint", "veneer", "lintel", "chimney cap"],
      photoScope: "brick, block, stone, mortar joints, chimney, cracks",
    },
  },
  HVAC: {
    id: "HVAC",
    label: "HVAC",
    sub: "Heating & air",
    icon: "HVAC",
    who: "HVAC shops",
    services: [
      { id: "service-repair", label: "Service & repair", icon: "wrench", on: true },
      { id: "changeouts", label: "System changeouts", icon: "HVAC", on: true },
      { id: "maintenance", label: "Maintenance plans", icon: "search", on: true },
      { id: "ductwork", label: "Ductwork", icon: "pipe", on: true },
      { id: "mini-splits", label: "Mini-splits", icon: "HVAC" },
      { id: "new-construction", label: "New construction", icon: "frame" },
      { id: "air-quality", label: "Indoor air", icon: "storm" },
      { id: "commercial", label: "Commercial", icon: "bldg" },
    ],
    estimate: {
      rate: { key: "laborRate", label: "Hourly rate", unit: "/ hour", value: 95, step: 5, prefix: "$" },
      choice: {
        key: "diagFee",
        label: "Diagnostic fee",
        options: [
          { value: "0", label: "None" },
          { value: "79", label: "$79" },
          { value: "99", label: "$99" },
          { value: "129", label: "$129" },
        ],
        value: "99",
      },
      extras: [{ key: "afterHours", label: "After-hours rate", value: 1.5, kind: "mult" }],
      markupLabel: "Markup on equipment & parts",
      markup: 30,
      deposit: 0,
      validDays: 30,
    },
    later: [
      { key: "license", label: "HVAC license & EPA 608 #", when: "First estimate" },
      { key: "supplier", label: "Equipment brands & supply house", when: "First parts list" },
    ],
    ai: {
      leadNoun: "what heating or air work they need",
      units: "hr, ea, ton, lf, or lot",
      measures: "System 3 ton, Duct 60 lf, SEER 16",
      requests: "keep the thermostat, quiet unit, attic access only",
      rates: "Use about $95/hr labor and a $99 diagnostic when they didn't say a price.",
      scopeLine: "Change out the 3-ton split, new pad and line set, start-up and charge.",
      vocab: ["tons", "SEER", "refrigerant", "line set", "CFM", "ductwork"],
      photoScope: "condenser, air handler, ductwork, thermostat, data plate",
    },
  },
  Carpentry: {
    id: "Carpentry",
    label: "Carpentry & Framing",
    icon: "Carpentry",
    who: "carpenters",
    services: [
      { id: "framing", label: "Framing", icon: "frame", on: true },
      { id: "trim", label: "Trim & molding", icon: "Carpentry", on: true },
      { id: "decks", label: "Decks & porches", icon: "deck", on: true },
      { id: "doors-windows", label: "Doors & windows", icon: "house", on: true },
      { id: "cabinets", label: "Cabinet installs", icon: "cab" },
      { id: "stairs", label: "Stairs & rails", icon: "Fencing" },
      { id: "rot-repair", label: "Rot repair", icon: "wrench" },
      { id: "commercial", label: "Commercial", icon: "bldg" },
    ],
    estimate: {
      rate: { key: "laborRate", label: "Labor rate", unit: "/ hour", value: 60, step: 5, prefix: "$" },
      choice: {
        key: "priceBy",
        label: "You usually price by",
        options: [
          { value: "hour", label: "Hour" },
          { value: "sf", label: "Sq ft" },
          { value: "job", label: "Per job" },
        ],
        value: "hour",
      },
      extras: [],
      markupLabel: "Markup on lumber & hardware",
      markup: 15,
      deposit: 25,
      validDays: 30,
    },
    later: [{ key: "supplier", label: "Lumber yard", when: "First materials list" }, LICENSE],
    ai: {
      leadNoun: "what carpentry they need",
      units: "hr, lf, sf, ea, bf, sheet, or lot",
      measures: "Wall 24 lf, Deck 240 sf, Studs 40, Sheets 12",
      requests: "match the old trim profile, keep the porch light, stain grade only",
      rates: "Use about $60/hr labor when they didn't say a price.",
      scopeLine: "Rip out the rotted fascia, new 1x6 primed pine, caulk it tight.",
      vocab: ["linear feet", "board feet", "studs", "sheathing", "trim profile", "joists"],
      photoScope: "framing, trim, rot, doors, windows, decking",
    },
  },
  Concrete: {
    id: "Concrete",
    label: "Concrete",
    icon: "Concrete",
    who: "concrete crews",
    services: [
      { id: "driveways", label: "Driveways", icon: "Asphalt", on: true },
      { id: "patios", label: "Patios", icon: "Concrete", on: true },
      { id: "sidewalks", label: "Sidewalks", icon: "deck", on: true },
      { id: "slabs", label: "Slabs", icon: "flat", on: true },
      { id: "foundations", label: "Foundations", icon: "frame" },
      { id: "stamped", label: "Stamped & decorative", icon: "brush" },
      { id: "repair", label: "Repair & leveling", icon: "wrench" },
      { id: "commercial", label: "Commercial", icon: "bldg" },
    ],
    estimate: {
      rate: { key: "pricePerSf", label: "Price per sq ft", unit: "/ sq ft", value: 8, step: 0.5, prefix: "$" },
      choice: {
        key: "thickness",
        label: "Usual slab thickness",
        options: [
          { value: "4", label: "4 in" },
          { value: "5", label: "5 in" },
          { value: "6", label: "6 in" },
        ],
        value: "4",
      },
      extras: [
        { key: "demoSf", label: "Tear-out per sq ft", value: 2, kind: "money" },
        { key: "rebarSf", label: "Rebar per sq ft", value: 0.75, kind: "money" },
      ],
      markupLabel: "Markup on materials",
      markup: 15,
      deposit: 25,
      validDays: 30,
    },
    later: [{ key: "supplier", label: "Ready-mix & pump company", when: "First pour" }, LICENSE],
    ai: {
      leadNoun: "what concrete work they need",
      units: "sf, cy, lf, hr, or lot",
      measures: "Slab 600 sf, Thickness 4 in, Yards 8, Rebar 18 in grid",
      requests: "broom finish, keep the tree, slope it away from the house",
      rates: "Use about $8/sf for a 4-inch slab and $2/sf tear-out when they didn't say a price.",
      scopeLine: "Tear out the cracked drive, 4-inch slab, rebar on 18-inch centers, broom finish.",
      vocab: ["yards", "psi", "rebar", "forms", "broom finish", "control joints"],
      photoScope: "slab area, cracks, grade, forms, drainage",
    },
  },
  Drywall: {
    id: "Drywall",
    label: "Drywall",
    icon: "Drywall",
    who: "drywall crews",
    services: [
      { id: "hang-finish", label: "Hang & finish", icon: "Drywall", on: true },
      { id: "patch", label: "Patch & repair", icon: "wrench", on: true },
      { id: "texture", label: "Texture", icon: "spray", on: true },
      { id: "ceilings", label: "Ceilings", icon: "house", on: true },
      { id: "water-damage", label: "Water damage", icon: "drop" },
      { id: "popcorn", label: "Popcorn removal", icon: "brush" },
      { id: "new-construction", label: "New construction", icon: "frame" },
      { id: "commercial", label: "Commercial", icon: "bldg" },
    ],
    estimate: {
      rate: { key: "pricePerSf", label: "Hang & finish per sq ft", unit: "/ sq ft", value: 2.25, step: 0.25, prefix: "$" },
      choice: {
        key: "finishLevel",
        label: "Usual finish level",
        options: [
          { value: "3", label: "Level 3" },
          { value: "4", label: "Level 4" },
          { value: "5", label: "Level 5" },
        ],
        value: "4",
      },
      extras: [{ key: "patchMin", label: "Patch minimum", value: 175, kind: "money" }],
      markupLabel: "Markup on board & mud",
      markup: 15,
      deposit: 25,
      validDays: 30,
    },
    later: [{ key: "supplier", label: "Board & mud supplier", when: "First materials list" }, LICENSE],
    ai: {
      leadNoun: "what drywall work they need",
      units: "sheet, sf, lf, hr, or lot",
      measures: "Walls 1200 sf, Sheets 38, Ceiling 9 ft, Level 4",
      requests: "match the orange peel, keep the dust down, smooth ceiling",
      rates: "Use about $2.25/sf hung and finished, $175 minimum on patches, when they didn't say a price.",
      scopeLine: "Hang 38 sheets of half-inch, tape and three coats, level 4, ready for prime.",
      vocab: ["sheets", "level 4/5", "mud", "tape", "texture", "corner bead"],
      photoScope: "walls, ceilings, seams, holes, water stains, texture",
    },
  },
  Flooring: {
    id: "Flooring",
    label: "Flooring",
    icon: "Flooring",
    who: "flooring installers",
    services: [
      { id: "hardwood", label: "Hardwood", icon: "Flooring", on: true },
      { id: "lvp", label: "LVP / laminate", icon: "Flooring", on: true },
      { id: "tile", label: "Tile", icon: "Masonry", on: true },
      { id: "carpet", label: "Carpet", icon: "flat", on: true },
      { id: "refinishing", label: "Refinishing", icon: "brush" },
      { id: "subfloor", label: "Subfloor repair", icon: "wrench" },
      { id: "stairs", label: "Stairs", icon: "Fencing" },
      { id: "commercial", label: "Commercial", icon: "bldg" },
    ],
    estimate: {
      rate: { key: "pricePerSf", label: "Install price per sq ft", unit: "/ sq ft", value: 3.5, step: 0.25, prefix: "$" },
      choice: {
        key: "materialsBy",
        label: "Who buys the flooring?",
        options: [
          { value: "shop", label: "We supply" },
          { value: "customer", label: "Customer" },
        ],
        value: "shop",
      },
      extras: [
        { key: "tearoutSf", label: "Tear-out per sq ft", value: 1.25, kind: "money" },
        { key: "waste", label: "Waste factor", value: 10, kind: "pct" },
      ],
      markupLabel: "Markup on flooring",
      markup: 20,
      deposit: 50,
      validDays: 30,
    },
    later: [{ key: "supplier", label: "Flooring supplier & brands", when: "First materials list" }, LICENSE],
    ai: {
      leadNoun: "what flooring they need",
      units: "sf, lf, ea, hr, box, or lot",
      measures: "Rooms 3, Floor 640 sf, Stairs 13, Waste 10%",
      requests: "run it the long way, flush transitions, move the piano",
      rates: "Use about $3.50/sf install and $1.25/sf tear-out when they didn't say a price.",
      scopeLine: "Pull the carpet, flatten the subfloor, float 640 sf of LVP, new quarter round.",
      vocab: ["sq ft", "boxes", "underlayment", "transitions", "subfloor", "waste"],
      photoScope: "rooms, floor type, transitions, stairs, subfloor damage",
    },
  },
  Landscaping: {
    id: "Landscaping",
    label: "Landscaping & Lawn",
    icon: "Landscaping",
    who: "lawn & landscape crews",
    services: [
      { id: "mowing", label: "Mowing", icon: "Landscaping", on: true },
      { id: "beds-mulch", label: "Beds & mulch", icon: "Landscaping", on: true },
      { id: "cleanups", label: "Cleanups", icon: "brush", on: true },
      { id: "sod-seed", label: "Sod & seed", icon: "flat", on: true },
      { id: "trees-shrubs", label: "Trees & shrubs", icon: "Landscaping" },
      { id: "irrigation", label: "Irrigation", icon: "drop" },
      { id: "hardscape", label: "Hardscape", icon: "Masonry" },
      { id: "commercial", label: "Commercial", icon: "bldg" },
    ],
    estimate: {
      rate: { key: "laborRate", label: "Labor rate", unit: "/ hour", value: 50, step: 5, prefix: "$" },
      choice: {
        key: "mowBilling",
        label: "Mowing is billed",
        options: [
          { value: "visit", label: "Per visit" },
          { value: "month", label: "Monthly" },
        ],
        value: "visit",
      },
      extras: [
        { key: "mowVisit", label: "Mowing, average yard", value: 45, kind: "money", suffix: "/visit" },
        { key: "mulchYard", label: "Mulch installed", value: 85, kind: "money", suffix: "/yd" },
      ],
      markupLabel: "Markup on plants & materials",
      markup: 25,
      deposit: 0,
      validDays: 30,
    },
    later: [
      { key: "supplier", label: "Nursery & supply yard", when: "First materials list" },
      { key: "applicator", label: "Pesticide applicator license", when: "First spray job" },
      { key: "route", label: "Mowing route days", when: "First repeat customer" },
    ],
    ai: {
      leadNoun: "what yard work they need",
      units: "hr, visit, yd, sf, ea, pallet, or lot",
      measures: "Lawn 8000 sf, Mulch 6 yd, Beds 140 lf, Sod 2 pallets",
      requests: "bag the clippings, stay off the septic field, edge the walk",
      rates: "Use about $50/hr labor, $45 a mow, and $85 a yard of mulch installed when they didn't say a price.",
      scopeLine: "Edge the beds, six yards of brown mulch, trim the hollies.",
      vocab: ["visits", "yards of mulch", "pallets of sod", "beds", "edging"],
      photoScope: "lawn, beds, trees, shrubs, slopes, drainage",
    },
  },
  Fencing: {
    id: "Fencing",
    label: "Fencing & Decks",
    icon: "Fencing",
    who: "fence & deck builders",
    services: [
      { id: "wood-fence", label: "Wood fence", icon: "Fencing", on: true },
      { id: "vinyl-fence", label: "Vinyl fence", icon: "Fencing", on: true },
      { id: "chain-link", label: "Chain-link", icon: "Fencing", on: true },
      { id: "decks", label: "Decks", icon: "deck", on: true },
      { id: "gates", label: "Gates", icon: "Fencing" },
      { id: "repairs", label: "Repairs", icon: "wrench" },
      { id: "railings", label: "Railings", icon: "deck" },
      { id: "staining", label: "Staining", icon: "brush" },
    ],
    estimate: {
      rate: { key: "pricePerLf", label: "Fence price per foot", unit: "/ ft", value: 32, step: 1, prefix: "$" },
      choice: {
        key: "height",
        label: "Usual fence height",
        options: [
          { value: "4", label: "4 ft" },
          { value: "6", label: "6 ft" },
          { value: "8", label: "8 ft" },
        ],
        value: "6",
      },
      extras: [
        { key: "gate", label: "Walk gate, each", value: 350, kind: "money" },
        { key: "deckSf", label: "Deck price per sq ft", value: 35, kind: "money" },
      ],
      markupLabel: "Markup on materials",
      markup: 15,
      deposit: 50,
      validDays: 30,
    },
    later: [
      { key: "supplier", label: "Fence & lumber supplier", when: "First materials list" },
      { key: "locates", label: "811 locate habit", when: "First fence job" },
      LICENSE,
    ],
    ai: {
      leadNoun: "what fence or deck they need",
      units: "lf, sf, ea, post, hr, or lot",
      measures: "Fence 180 lf, Height 6 ft, Posts 24, Gates 2",
      requests: "good side out, keep the dog in, leave the old posts",
      rates: "Use about $32/lf for 6-foot wood fence and $350 a walk gate when they didn't say a price.",
      scopeLine: "180 feet of 6-foot cedar privacy, posts in concrete every 8 feet, two walk gates.",
      vocab: ["linear feet", "posts", "pickets", "panels", "gates", "811 locate"],
      photoScope: "fence line, posts, gates, deck boards, railings",
    },
  },
  Siding: {
    id: "Siding",
    label: "Siding & Gutters",
    icon: "Siding",
    who: "siding & gutter crews",
    services: [
      { id: "siding", label: "Siding", icon: "Siding", on: true },
      { id: "gutters", label: "Gutters", icon: "Siding", on: true },
      { id: "soffit-fascia", label: "Soffit & fascia", icon: "Roofing", on: true },
      { id: "guards", label: "Gutter guards", icon: "flat", on: true },
      { id: "repairs", label: "Repairs", icon: "wrench" },
      { id: "trim-wrap", label: "Trim wrap", icon: "Carpentry" },
      { id: "windows", label: "Windows", icon: "house" },
      { id: "commercial", label: "Commercial", icon: "bldg" },
    ],
    estimate: {
      rate: { key: "pricePerSquare", label: "Siding price per square", unit: "/ SQ", value: 550, step: 25, prefix: "$" },
      choice: {
        key: "siding",
        label: "Siding you install most",
        options: [
          { value: "vinyl", label: "Vinyl" },
          { value: "fiber-cement", label: "Hardie" },
          { value: "wood", label: "Wood" },
        ],
        value: "vinyl",
      },
      extras: [
        { key: "gutterLf", label: "Seamless gutter per foot", value: 12, kind: "money" },
        { key: "downspout", label: "Downspout, each", value: 95, kind: "money" },
      ],
      markupLabel: "Markup on materials",
      markup: 15,
      deposit: 25,
      validDays: 30,
    },
    later: [
      { key: "supplier", label: "Siding brands & supplier", when: "First materials list" },
      { key: "rrp", label: "Lead-safe (RRP) cert", when: "Pre-1978 house" },
      LICENSE,
    ],
    ai: {
      leadNoun: "what siding or gutter work they need",
      units: "sq, lf, ea, hr, or lot",
      measures: "Walls 22 sq, Gutters 160 lf, Downspouts 6, Soffit 140 lf",
      requests: "match the shutters, keep the satellite, white gutters",
      rates: "Use about $550 a square for vinyl siding and $12/lf for seamless gutters when they didn't say a price.",
      scopeLine: "Strip the old siding, house wrap, 22 squares of Dutch-lap vinyl, new 6-inch seamless gutters.",
      vocab: ["squares", "linear feet", "seamless", "downspouts", "soffit", "J-channel"],
      photoScope: "siding walls, gutters, downspouts, soffit, fascia",
    },
  },
  Remodeling: {
    id: "Remodeling",
    label: "Remodeling / General Contractor",
    sub: "Kitchens, baths, additions",
    icon: "Remodeling",
    who: "remodelers",
    services: [
      { id: "kitchens", label: "Kitchens", icon: "cab", on: true },
      { id: "bathrooms", label: "Bathrooms", icon: "faucet", on: true },
      { id: "whole-home", label: "Whole-home", icon: "house", on: true },
      { id: "repairs", label: "Repairs & handyman", icon: "wrench", on: true },
      { id: "additions", label: "Additions", icon: "frame" },
      { id: "basements", label: "Basements", icon: "flat" },
      { id: "permits-plans", label: "Permits & plans", icon: "search" },
      { id: "commercial", label: "Commercial", icon: "bldg" },
    ],
    estimate: {
      rate: { key: "laborRate", label: "Labor rate", unit: "/ hour", value: 70, step: 5, prefix: "$" },
      choice: {
        key: "gcFee",
        label: "Your fee on subs",
        options: [
          { value: "10", label: "10%" },
          { value: "15", label: "15%" },
          { value: "20", label: "20%" },
        ],
        value: "15",
      },
      extras: [{ key: "changeOrderMin", label: "Change-order minimum", value: 150, kind: "money" }],
      markupLabel: "Markup on materials",
      markup: 20,
      deposit: 25,
      validDays: 30,
    },
    later: [
      { key: "license", label: "GC license & insurance #", when: "First estimate" },
      { key: "subs", label: "Subs you hire out", when: "First sub on a job" },
      { key: "supplier", label: "Supplier accounts", when: "First materials list" },
    ],
    ai: {
      leadNoun: "what they want remodeled",
      units: "hr, sf, lf, ea, allowance, or lot",
      measures: "Kitchen 180 sf, Cabinets 22 lf, Tile 90 sf, Fixtures 4",
      requests: "keep the window, soft-close drawers, done before Thanksgiving",
      rates: "Use about $70/hr labor and a 15% fee on sub work when they didn't say a price.",
      scopeLine: "Gut the hall bath, new tub and tile surround, vanity, LVP floor.",
      vocab: ["allowances", "change orders", "subs", "rough-in", "punch list"],
      photoScope: "rooms, cabinets, fixtures, walls, floors, damage",
    },
  },
  Other: {
    id: "Other",
    label: "Other…",
    sub: "Type your trade",
    icon: "Other",
    who: "shops like yours",
    services: [
      { id: "service-calls", label: "Service calls", icon: "van", on: true },
      { id: "repairs", label: "Repairs", icon: "wrench", on: true },
      { id: "installs", label: "Installs", icon: "house", on: true },
      { id: "maintenance", label: "Maintenance", icon: "search" },
      { id: "new-construction", label: "New construction", icon: "frame" },
      { id: "emergency", label: "Emergency calls", icon: "storm" },
      { id: "inspections", label: "Inspections", icon: "search" },
      { id: "commercial", label: "Commercial", icon: "bldg" },
    ],
    estimate: {
      rate: { key: "laborRate", label: "Labor rate", unit: "/ hour", value: 60, step: 5, prefix: "$" },
      extras: [{ key: "serviceCall", label: "Trip / service fee", value: 0, kind: "money" }],
      markupLabel: "Markup on materials",
      markup: 20,
      deposit: 25,
      validDays: 30,
    },
    later: [{ key: "supplier", label: "Supplier", when: "First materials list" }, LICENSE],
    ai: {
      leadNoun: "what work they need",
      units: "hr, ea, sf, lf, or lot",
      measures: "Labor 6 hr, Area 400 sf, Linear 40 lf, Units 3",
      requests: "keep the driveway clear, call before arriving, match the old finish",
      rates: "Use about $60/hr labor when they didn't say a price.",
      scopeLine: "Pull the old unit, set the new one, test it, haul off the old one.",
      vocab: ["hours", "units", "sq ft", "linear feet", "materials"],
      photoScope: "the work area, damage, measurements",
    },
  },
};

/** Old signups saved "Construction"; the 15-tile list folds it into Remodeling / GC. */
const LEGACY: Record<string, ProfileId> = { Construction: "Remodeling" };

export function tradeProfile(industry?: string | null): TradeProfile {
  const raw = (industry || "").trim();
  if (!raw) return PROFILES.Painting;
  const exact = (Object.keys(PROFILES) as ProfileId[]).find((id) => id.toLowerCase() === raw.toLowerCase());
  if (exact) return PROFILES[exact];
  if (LEGACY[raw]) return PROFILES[LEGACY[raw]];
  const lex = parseTrade(raw).id;
  if (lex in PROFILES) return PROFILES[lex as ProfileId];
  if (LEGACY[lex]) return PROFILES[LEGACY[lex]];
  return PROFILES.Other;
}

export function pickerProfiles(): TradeProfile[] {
  return PICKER_TRADES.map((id) => PROFILES[id]);
}

export function otherProfile(): TradeProfile {
  return PROFILES.Other;
}

export function isPainting(industry?: string | null) {
  return tradeProfile(industry).id === "Painting";
}

export function defaultServices(profile: TradeProfile): string[] {
  return profile.services.filter((item) => item.on).map((item) => item.id);
}

export type EstimateDefaults = {
  /** Main rate in profile.estimate.rate.unit (hour, square, sq ft …). */
  rate: number;
  choice: string;
  extras: Record<string, number>;
  markup: number;
  deposit: number;
  validDays: number;
};

export function defaultEstimate(profile: TradeProfile): EstimateDefaults {
  return {
    rate: profile.estimate.rate.value,
    choice: profile.estimate.choice?.value || "",
    extras: Object.fromEntries(profile.estimate.extras.map((item) => [item.key, item.value])),
    markup: profile.estimate.markup,
    deposit: profile.estimate.deposit,
    validDays: profile.estimate.validDays,
  };
}

export function formatExtra(kind: ExtraField["kind"], value: number, suffix = "") {
  const n = Number.isFinite(value) ? value : 0;
  const tidy = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");
  if (kind === "money") return `$${tidy}${suffix}`;
  if (kind === "pct") return `${tidy}%${suffix}`;
  if (kind === "mult") return `${tidy}×${suffix}`;
  return `${tidy}${suffix}`;
}

/** One line the co-pilot system prompt adds so a non-painting shop never hears paint talk. */
export function tradeVocabLine(industry?: string | null) {
  const profile = tradeProfile(industry);
  return `Talk ${profile.who}: ${profile.ai.vocab.join(", ")}. A line item sounds like "${profile.ai.scopeLine}"`;
}

/** Painting words that must never show up in a non-painting shop's prompts. */
/** ("coats" and "fascia" stay legal: drywall mud coats, asphalt tack coat, gutters hang on fascia.) */
export const PAINT_WORDS = /\b(paint(s|ed|er|ers|ing)?|primer|sheen|Duration|Sherwin|Benjamin Moore|gallons? of paint)\b/i;
