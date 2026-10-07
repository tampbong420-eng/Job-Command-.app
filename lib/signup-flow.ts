/**
 * New first-launch signup (approved 2026-10-02): 5 sections, 1–2 questions per screen.
 * Pure rules only — no React — so the skip/validation/payload logic is unit-tested.
 */
import { clampDeposit } from "@/lib/pay-prefs";
import { normalizePinDigits, pinProblem } from "@/lib/signup-pin";
import {
  defaultEstimate,
  defaultServices,
  otherProfile,
  tradeProfile,
  type EstimateDefaults,
  type ProfileId,
  type TradeProfile,
} from "@/lib/trade-profiles";
import { WORK_DAYS, type ShopProfileInput, type WorkDaysId } from "@/lib/signup-shop";

export const SECTIONS = [
  { key: "you", label: "You" },
  { key: "shop", label: "Shop" },
  { key: "crew", label: "Crew" },
  { key: "paid", label: "Paid" },
  { key: "ready", label: "Ready" },
] as const;
export type SectionKey = (typeof SECTIONS)[number]["key"];

export type SignupStepKey =
  | "welcome"
  | "you"
  | "trade"
  | "services"
  | "company"
  | "area"
  | "size"
  | "people"
  | "methods"
  | "estimate"
  | "trial"
  | "done";

export type SignupStep = {
  key: SignupStepKey;
  section: SectionKey | null;
  kick: string;
  title: string;
  help: string;
  /** Safe to leave blank today — we ask again right when it matters. */
  skippable: boolean;
  /** Spoken out loud when the screen opens. */
  say: string;
};

export const SIGNUP_STEPS: SignupStep[] = [
  {
    key: "welcome",
    section: null,
    kick: "",
    title: "Run the whole shop from the truck.",
    help: "",
    skippable: false,
    say: "Run the whole shop from the truck. Tap Get started.",
  },
  {
    key: "you",
    section: "you",
    kick: "You · 1 of 1",
    title: "Hi! Who’s the boss?",
    help: "",
    skippable: false,
    say: "Hi! Who's the boss? Your name, your cell, and an email.",
  },
  {
    key: "trade",
    section: "shop",
    kick: "Your shop · 1 of 4",
    title: "What’s your trade?",
    help: "Pick your main one. I’ll talk your trade.",
    skippable: false,
    say: "What's your trade? Pick your main one.",
  },
  {
    key: "services",
    section: "shop",
    kick: "Your shop · 2 of 4",
    title: "What do you do?",
    help: "",
    skippable: true,
    say: "What jobs do you take? Pick all that fit.",
  },
  {
    key: "company",
    section: "shop",
    kick: "Your shop · 3 of 4",
    title: "Your company",
    help: "Goes on every estimate and invoice.",
    skippable: true,
    say: "Your company name and shop address.",
  },
  {
    key: "area",
    section: "shop",
    kick: "Your shop · 4 of 4",
    title: "Where and when?",
    help: "How far you’ll drive and when you work. Fix it if I’m off.",
    skippable: true,
    say: "How far will you drive, and when do you work?",
  },
  {
    key: "size",
    section: "crew",
    kick: "Your crew · 1 of 2",
    title: "How many people work with you?",
    help: "Count yourself. Tap one and we move on.",
    skippable: true,
    say: "How many people work with you? Count yourself.",
  },
  {
    key: "people",
    section: "crew",
    kick: "Your crew · 2 of 2",
    title: "Add your people",
    help: "Each one gets a text with their own sign-in link.",
    skippable: true,
    say: "Add your people. Name and phone is plenty.",
  },
  {
    key: "methods",
    section: "paid",
    kick: "Getting paid · 1 of 2",
    title: "How do customers pay you?",
    help: "Pick all that work for you.",
    skippable: true,
    say: "How do customers pay you? Pick all that work.",
  },
  {
    key: "estimate",
    section: "paid",
    kick: "Getting paid · 2 of 2",
    title: "Your estimate numbers",
    help: "",
    skippable: true,
    say: "Your estimate numbers. Fix any I got wrong.",
  },
  {
    key: "trial",
    section: "ready",
    kick: "Ready · 1 of 2",
    title: "Free for 30 days",
    help: "We’ll put a $1 hold on your card to make sure it works, then release it right away.",
    skippable: false,
    say: "Free for thirty days. A one dollar card check, returned right away.",
  },
  {
    key: "done",
    section: "ready",
    kick: "Ready · 2 of 2",
    title: "You’re set",
    help: "",
    skippable: false,
    say: "You're set. Let's add your first job.",
  },
];

export const SIZES = [
  { id: "JUST_ME", label: "Just me", sub: "I do the work myself", icon: "user" },
  { id: "2_3", label: "2–3 people", sub: "Me plus a helper or two", icon: "users" },
  { id: "4_10", label: "4–10 people", sub: "A real crew", icon: "users" },
  { id: "10_PLUS", label: "10 or more", sub: "Several crews", icon: "bldg" },
] as const;
export type SizeId = (typeof SIZES)[number]["id"];

export type SignupPerson = {
  firstName: string;
  lastName: string;
  phone: string;
  role: "crew" | "boss";
  /** Contact photo (object/data URL on this phone only; never uploaded). */
  photo?: string;
};

export type SignupState = {
  firstName: string;
  lastName: string;
  cell: string;
  email: string;
  /** The office PIN the owner picks (4–6 numbers). Required; never made from the cell. */
  pin: string;
  trade: ProfileId | "";
  tradeOther: string;
  services: string[];
  companyName: string;
  address: string;
  /** "" = same as my cell. */
  companyPhone: string;
  radius: number;
  workDays: WorkDaysId;
  workStart: string;
  workEnd: string;
  size: SizeId | "";
  people: SignupPerson[];
  /** How many invite texts were opened in Messages after setup (for "3 invites sent"). */
  invitesSent?: number;
  acceptCard: boolean;
  acceptCash: boolean;
  acceptAch: boolean;
  estimate: EstimateDefaults;
  terms: boolean;
  /** Company logo URL (uploaded during signup, optional). */
  logoUrl?: string | null;
  /** App skin picked during signup (Eric, 2026-10-03). Defaults to teal (midnight). */
  shellTheme?: string;
};

export const SIZE_PREPICK: SizeId = "4_10";

export function blankSignup(): SignupState {
  return {
    firstName: "",
    lastName: "",
    cell: "",
    email: "",
    pin: "",
    trade: "",
    tradeOther: "",
    services: [],
    companyName: "",
    address: "",
    companyPhone: "",
    radius: 30,
    workDays: "MON_FRI",
    workStart: "07:00",
    workEnd: "17:00",
    // Mockup: one option is already picked (a real crew), so Next works without a tap.
    size: SIZE_PREPICK,
    people: [],
    // Card + cash on by default: that's what most shops take, and Next never blocks here.
    acceptCard: true,
    acceptCash: true,
    acceptAch: false,
    estimate: defaultEstimate(tradeProfile("Painting")),
    terms: false,
  };
}

export function stepIndex(key: SignupStepKey) {
  return SIGNUP_STEPS.findIndex((step) => step.key === key);
}

export function profileFor(state: Pick<SignupState, "trade">): TradeProfile {
  return state.trade ? tradeProfile(state.trade) : otherProfile();
}

/** Switching trades swaps in that trade's job tiles and estimate numbers. */
export function withTrade(state: SignupState, trade: ProfileId): SignupState {
  if (state.trade === trade) return state;
  const profile = tradeProfile(trade);
  return {
    ...state,
    trade,
    tradeOther: trade === "Other" ? state.tradeOther : "",
    services: defaultServices(profile),
    estimate: defaultEstimate(profile),
  };
}

/** The office PIN the owner typed. Never made from the cell any more (go-public B1). */
export function pinFor(state: Pick<SignupState, "pin" | "cell">) {
  return normalizePinDigits(state.pin);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What stops Next on this screen, in plain words. null = good to go. */
export function stepProblem(key: SignupStepKey, state: SignupState): string | null {
  if (key === "you") {
    if (!state.firstName.trim()) return "Type your first name.";
    if (!state.email.trim()) return "Type your email — receipts go there.";
    if (!EMAIL.test(state.email.trim())) return "That email looks off. Check it.";
    const pinIssue = pinProblem(state.pin, [state.cell, (state as Partial<SignupState>).companyPhone]);
    if (pinIssue) return pinIssue;
    return null;
  }
  if (key === "trade") {
    if (!state.trade) return "Tap your trade.";
    if (state.trade === "Other" && !state.tradeOther.trim()) return "Type your trade.";
    return null;
  }
  if (key === "estimate") {
    if (!Number.isFinite(state.estimate.rate) || state.estimate.rate < 0) return "Set your rate.";
    return null;
  }
  if (key === "trial") {
    return state.terms ? null : "Check the box to agree to the Terms and Privacy Policy.";
  }
  // services, company, area, size, people, methods: never block.
  return null;
}

export function canSkip(key: SignupStepKey) {
  return SIGNUP_STEPS.find((step) => step.key === key)?.skippable ?? false;
}

/** "Just me" skips the add-people screen. */
export function nextStepKey(key: SignupStepKey, state: SignupState): SignupStepKey {
  const order = SIGNUP_STEPS.map((step) => step.key);
  let index = order.indexOf(key) + 1;
  if (order[index] === "people" && state.size === "JUST_ME") index += 1;
  return order[Math.min(index, order.length - 1)];
}

export function prevStepKey(key: SignupStepKey, state: SignupState): SignupStepKey {
  const order = SIGNUP_STEPS.map((step) => step.key);
  let index = order.indexOf(key) - 1;
  if (order[index] === "people" && state.size === "JUST_ME") index -= 1;
  return order[Math.max(index, 0)];
}

/** Big orange button text. "Looks right" when I already filled the screen in for them. */
export function nextLabel(key: SignupStepKey, state: SignupState) {
  if (key === "welcome") return "Get started";
  if (key === "trial") return "Start free trial";
  if (key === "done") return "Add my first job";
  if (key === "people") return state.people.some((person) => person.firstName.trim()) ? "Send invites" : "Next";
  if (key === "services") return "Next";
  if (key === "area" || key === "estimate") return "Looks right";
  if (key === "methods") return "Next";
  return "Next";
}

export function skipLabel(key: SignupStepKey) {
  if (key === "people") return "Skip — just me for now";
  return "Skip for now";
}

export function timeLeft(key: SignupStepKey) {
  switch (key) {
    case "people":
      return "~45 sec left";
    case "methods":
      return "~30 sec left";
    case "estimate":
      return "~20 sec left";
    case "trial":
      return "Last step";
    case "done":
    case "welcome":
      return "";
    default:
      return "~1 min left";
  }
}

/** 0–1 fill for the current section's bar. */
export function sectionFill(key: SignupStepKey) {
  const step = SIGNUP_STEPS.find((item) => item.key === key);
  if (!step?.section) return 0;
  const inSection = SIGNUP_STEPS.filter((item) => item.section === step.section && item.key !== "done");
  const at = inSection.findIndex((item) => item.key === key);
  if (at < 0) return 1;
  return (at + 0.5) / inSection.length;
}

export function sectionIndex(key: SignupStepKey) {
  if (key === "done") return SECTIONS.length;
  const step = SIGNUP_STEPS.find((item) => item.key === key);
  return step?.section ? SECTIONS.findIndex((section) => section.key === step.section) : -1;
}

export function tradeName(state: Pick<SignupState, "trade" | "tradeOther">) {
  if (state.trade === "Other") return state.tradeOther.trim() || "Your trade";
  return state.trade ? tradeProfile(state.trade).label : "";
}

export function workDaysLabel(id: WorkDaysId) {
  return WORK_DAYS.find((item) => item.id === id)?.label || "Mon–Fri";
}

/** "Hot Springs, AR" from "118 Central Ave, Hot Springs, AR 71901". */
export function townFrom(address: string) {
  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return "";
  const town = parts[1];
  const state = (parts[2] || "").replace(/\s*\d{5}(-\d{4})?$/, "").trim();
  return state ? `${town}, ${state}` : town;
}

export function rateSummary(profile: TradeProfile, estimate: EstimateDefaults) {
  const rate = profile.estimate.rate;
  const value = Number.isInteger(estimate.rate) ? String(estimate.rate) : estimate.rate.toFixed(2);
  const unit = rate.unit.replace(/^\/\s*/, "/").replace("/hour", "/hr");
  return `${rate.prefix || ""}${value}${unit}`;
}

/** The gold-check lines on "You're set". */
export function doneSummary(state: SignupState) {
  const profile = profileFor(state);
  const lines: string[] = [];
  const name = tradeName(state);
  lines.push(state.services.length ? `${name} · ${state.services.length} job types` : name);
  const town = townFrom(state.address);
  lines.push(`${state.radius} mi${town ? ` of ${town}` : ""} · ${workDaysLabel(state.workDays)}`);
  const crew = state.people.filter((person) => person.firstName.trim());
  const sent = Math.min(state.invitesSent || 0, crew.length);
  lines.push(
    !crew.length
      ? "Just you for now"
      : sent
        ? `${sent} invite${sent === 1 ? "" : "s"} sent`
        : `${crew.length} invite${crew.length === 1 ? "" : "s"} ready to text`
  );
  const deposit = clampDeposit(state.estimate.deposit);
  lines.push(`${rateSummary(profile, state.estimate)} · ${deposit ? `${deposit}% deposit` : "no deposit"}`);
  return lines;
}

export type LaterItem = { key: string; label: string; when: string; icon: string; href?: string };

/** "Finish later": nothing here blocks — each is asked once, right when it matters. */
export function laterItems(state: Pick<SignupState, "trade" | "size" | "people">, done: string[] = []): LaterItem[] {
  const profile = profileFor(state);
  // Mockup order: logo, license, bank, pay rates, answering, books; then the trade's own items.
  const items: LaterItem[] = [{ key: "logo", label: "Company logo", when: "First estimate", icon: "img", href: "/?tab=company" }];
  const license = profile.later.find((item) => item.key === "license");
  if (license) items.push({ key: "license", label: license.label, when: license.when, icon: "book" });
  items.push({ key: "bank", label: "Link your bank", when: "First card invoice", icon: "bank", href: "/?tab=company" });
  if (state.size !== "JUST_ME" || state.people.length) {
    items.push({ key: "payroll", label: "Crew pay rates & pay day", when: "First timesheet", icon: "users", href: "/?tab=crew" });
  }
  items.push({ key: "answering", label: "AI answering line", when: "After a missed call", icon: "phone", href: "/?tab=company" });
  items.push({ key: "books", label: "QuickBooks / Xero", when: "Anytime in Office", icon: "book", href: "/?tab=company" });
  // Mockup item: the link customers tap to leave a Google review (saved now, sent after the first paid job).
  items.push({ key: "review", label: "Google review link", when: "First paid job", icon: "spark" });
  for (const item of profile.later) {
    if (item.key === "license") continue;
    items.push({ key: item.key, label: item.label, when: item.when, icon: item.key === "supplier" ? "pin" : "info", href: "/?tab=company" });
  }
  // Built item kept in the final merge: light or dark look.
  items.push({ key: "look", label: "Light or dark look", when: "Anytime in Office", icon: "sun", href: "/?tab=company" });
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.key) || done.includes(item.key)) return false;
    seen.add(item.key);
    return true;
  });
}

export type PayClock = { frequency: "WEEKLY" | "BIWEEKLY"; periodStart: string };

/** Everything completeOnboarding + the shop profile need, from the screens' answers. */
export function buildSignupPayload(
  state: SignupState,
  input: { pay: PayClock; answeringLine: string; shellTheme: string; shellInk: string; logoUrl?: string | null }
) {
  const profile = profileFor(state);
  const named = (person: SignupPerson) => person.firstName.trim() || person.lastName.trim();
  const people = state.people.filter(named);
  const size: SizeId = state.size || (people.length >= 4 ? "4_10" : people.length ? "2_3" : "JUST_ME");
  const businessName =
    state.companyName.trim() || `${state.firstName.trim() || "My"}’s ${tradeName(state) || "Business"}`.trim();
  const onboarding = {
    actor: `${state.firstName} ${state.lastName}`.trim() || "Owner",
    owner: {
      firstName: state.firstName.trim(),
      lastName: state.lastName.trim(),
      email: state.email.trim(),
      phone: state.cell.trim(),
      pin: pinFor(state),
    },
    business: {
      name: businessName,
      address: state.address.trim(),
      email: state.email.trim(),
      industry: profile.id,
      size,
      logoUrl: input.logoUrl ?? null,
    },
    accountingSoftware: "NONE" as const,
    frequency: input.pay.frequency,
    periodStart: input.pay.periodStart,
    bosses: people
      .filter((person) => person.role === "boss")
      .map((person) => ({ firstName: person.firstName.trim(), lastName: person.lastName.trim(), phone: person.phone.trim() })),
    crew: people
      .filter((person) => person.role === "crew")
      .map((person) => ({
        firstName: person.firstName.trim(),
        lastName: person.lastName.trim(),
        jobTitle: "Field",
        phone: person.phone.trim(),
        hourlyRate: 0,
      })),
    companyPhone: (state.companyPhone || state.cell).trim(),
    answeringLine: input.answeringLine,
    termsAccepted: state.terms,
    shellTheme: input.shellTheme,
    shellInk: input.shellInk,
    payPrefs: {
      acceptCard: state.acceptCard,
      acceptAch: state.acceptAch,
      acceptCash: state.acceptCash,
      depositPercent: clampDeposit(state.estimate.deposit),
    },
  };
  const shop: ShopProfileInput = {
    tradeLabel: state.trade === "Other" ? state.tradeOther.trim() : "",
    services: state.services,
    serviceRadiusMi: state.radius,
    workDays: state.workDays,
    workStart: state.workStart,
    workEnd: state.workEnd,
    laborRate: state.estimate.rate,
    materialsMarkup: state.estimate.markup,
    estimateValidDays: state.estimate.validDays,
    tradeDefaults: { choice: state.estimate.choice, extras: state.estimate.extras },
  };
  return { onboarding, shop };
}

type SettingsLike = {
  setupComplete: boolean;
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail: string;
  ownerPhone: string;
  businessName: string;
  businessAddress: string;
  companyPhone: string;
  industry: string;
  businessSize: string;
  acceptCard: boolean;
  acceptAch: boolean;
  acceptCash: boolean;
  depositPercent: number;
  shop?: import("@/lib/signup-shop").ShopProfileDTO;
};

/**
 * First run starts blank (no example values — Eric's rule). Only a shop that already
 * finished setup and re-opens it (/?setup=1) gets its saved answers back ("Looks right").
 */
export function signupFromSettings(settings: SettingsLike): SignupState {
  const blank = blankSignup();
  if (!(settings.setupComplete && settings.industry)) return blank;
  const profile = tradeProfile(settings.industry);
  const shop = settings.shop;
  const estimate = defaultEstimate(profile);
  const size = SIZES.some((item) => item.id === settings.businessSize) ? (settings.businessSize as SizeId) : "";
  return {
    ...blank,
    firstName: settings.ownerFirstName,
    lastName: settings.ownerLastName,
    cell: settings.ownerPhone,
    email: settings.ownerEmail,
    trade: profile.id,
    tradeOther: profile.id === "Other" ? shop?.tradeLabel || "" : "",
    services: shop?.services.length ? shop.services : defaultServices(profile),
    companyName: settings.businessName,
    address: settings.businessAddress,
    companyPhone: settings.companyPhone && settings.companyPhone !== settings.ownerPhone ? settings.companyPhone : "",
    radius: shop?.serviceRadiusMi ?? blank.radius,
    workDays: shop?.workDays ?? blank.workDays,
    workStart: shop?.workStart ?? blank.workStart,
    workEnd: shop?.workEnd ?? blank.workEnd,
    size,
    acceptCard: settings.acceptCard,
    acceptAch: settings.acceptAch,
    acceptCash: settings.acceptCash,
    estimate: {
      rate: shop?.laborRate ? shop.laborRate : estimate.rate,
      choice: shop?.tradeDefaults.choice || estimate.choice,
      extras: { ...estimate.extras, ...(shop?.tradeDefaults.extras || {}) },
      markup: shop ? shop.materialsMarkup : estimate.markup,
      deposit: clampDeposit(settings.depositPercent),
      validDays: shop?.estimateValidDays || estimate.validDays,
    },
  };
}
