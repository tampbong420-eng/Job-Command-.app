import {
  WEEKDAY_LONG,
  mostRecentWeekday,
  snapToWeekday,
  todayString,
  type PayFrequency,
} from "@/lib/dates";

export type PersonDraft = {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  jobTitle?: string;
  hourlyRate?: number;
};

export type AccountDraft = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
};

export type SetupDraft = {
  frequency?: "WEEKLY" | "BIWEEKLY";
  startWeekday?: number;
  periodStart?: string;
};

export type BusinessDraft = {
  businessName?: string;
  address?: string;
  industry?: string;
  size?: string;
};

const PHONE_RE = /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const RATE_RE = /\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:an hour|an hr|\/hr|hour|hr)?/i;

export function parsePhone(text: string): string | undefined {
  const match = text.match(PHONE_RE);
  return match?.[0];
}

export function parseAccountTalk(text: string): AccountDraft {
  const email = text.match(EMAIL_RE)?.[0];
  const phone = parsePhone(text);
  const cleaned = text
    .replace(EMAIL_RE, " ")
    .replace(PHONE_RE, " ")
    .replace(/\b(my name is|i am|i'm|this is)\b/gi, " ")
    .replace(/[,]/g, " ")
    .trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" ") || undefined,
    email,
    phone,
  };
}

export function parseBusinessTalk(text: string): BusinessDraft {
  const sizeDraft = parseSizeTalk(text);
  const brand = parseBrandTalk(text);
  return {
    businessName: brand.businessName,
    address: brand.address,
    industry: sizeDraft.industry,
    size: sizeDraft.size,
  };
}

export function parseSizeTalk(text: string): Pick<BusinessDraft, "industry" | "size"> {
  const t = text.toLowerCase();
  const industries = [
    ["paint", "Painting"],
    ["asphalt", "Asphalt"],
    ["paving", "Asphalt"],
    ["hvac", "HVAC"],
    ["electrical", "Electrical"],
    ["electrician", "Electrical"],
    ["plumber", "Plumbing"],
    ["plumbing", "Plumbing"],
    ["roof", "Roofing"],
    ["construct", "Construction"],
    ["remodel", "Remodeling"],
    ["general contractor", "Remodeling"],
    ["heating", "HVAC"],
    ["air condition", "HVAC"],
    ["mason", "Masonry"],
    ["brick", "Masonry"],
    ["carpent", "Carpentry"],
    ["framing", "Carpentry"],
    ["concrete", "Concrete"],
    ["drywall", "Drywall"],
    ["sheetrock", "Drywall"],
    ["floor", "Flooring"],
    ["landscap", "Landscaping"],
    ["lawn", "Landscaping"],
    ["fenc", "Fencing"],
    ["siding", "Siding"],
    ["gutter", "Siding"],
  ] as const;
  const industry = industries.find(([key]) => t.includes(key))?.[1];
  let size: string | undefined;
  if (/just me|only me|solo|one person/.test(t)) size = "JUST_ME";
  else if (/\b2\b|\b3\b|two|three/.test(t) && /people|crew|employees|of us/.test(t))
    size = "2_3";
  else if (/4|5|6|7|8|9|10|four|ten/.test(t)) size = "4_10";
  else if (/11|12|20|plus|\+/.test(t)) size = "10_PLUS";
  return { industry, size };
}

export function parseBrandTalk(text: string): Pick<BusinessDraft, "businessName" | "address"> {
  const addressMatch = text.match(
    /(?:at|address is|located at|street is)\s+(.+)/i
  );
  const nameMatch = text.match(
    /(?:company|business|called|name is)\s+([^,.]+)/i
  );
  const leftover = text
    .replace(/(?:at|address is|located at|street is)\s+.+/i, " ")
    .replace(/(?:company|business|called|name is)\s+/i, " ")
    .trim();
  return {
    businessName: nameMatch?.[1]?.trim() || leftover || undefined,
    address: addressMatch?.[1]?.trim(),
  };
}

export function parseAccountingTalk(text: string): "QUICKBOOKS" | "XERO" | "OTHER" | "NONE" | undefined {
  const t = text.toLowerCase();
  if (/quick\s*books|qb online|intuit/.test(t)) return "QUICKBOOKS";
  if (/xero/.test(t)) return "XERO";
  if (/none|don't|dont|no accounting|no books/.test(t)) return "NONE";
  if (/other|something else/.test(t)) return "OTHER";
  return undefined;
}

export function parsePeopleTalk(text: string): PersonDraft[] {
  const raw = text.trim();
  if (!raw || /nobody|no one|none yet|just me|no employees|no other/.test(raw.toLowerCase())) {
    return [];
  }
  const chunks = raw.split(/\s*(?:,| and | then | also )\s*/i).filter(Boolean);
  return chunks.map((chunk) => {
    const phone = parsePhone(chunk);
    const email = chunk.match(EMAIL_RE)?.[0];
    const rateMatch = chunk.match(RATE_RE);
    const hourlyRate = rateMatch ? Number(rateMatch[1]) : undefined;
    const cleaned = chunk
      .replace(PHONE_RE, " ")
      .replace(EMAIL_RE, " ")
      .replace(RATE_RE, " ")
      .replace(/\b(employee|boss|named|name is|is a|works as)\b/gi, " ")
      .trim();
    const parts = cleaned.split(/\s+/).filter(Boolean);
    const firstName = parts[0] || "Crew";
    const maybeTitle = parts.slice(2).join(" ");
    const lastName = parts[1] || "";
    return {
      firstName,
      lastName,
      phone,
      email,
      jobTitle: maybeTitle || undefined,
      hourlyRate,
    };
  }).filter((person) => person.firstName && person.firstName !== "Crew");
}

const DAY_ALIASES: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

export function parsePayrollTalk(
  text: string,
  today = todayString()
): SetupDraft {
  const raw = text.trim();
  if (!raw) return {};
  const t = raw.toLowerCase();
  const draft: SetupDraft = {};

  if (
    /every\s*(two|2)\s*weeks?/.test(t) ||
    /bi[-\s]?weekly/.test(t) ||
    /every other week/.test(t) ||
    /pay\s*every\s*two/.test(t)
  ) {
    draft.frequency = "BIWEEKLY";
  } else if (
    /every week/.test(t) ||
    /weekly/.test(t) ||
    /once a week/.test(t) ||
    /each week/.test(t)
  ) {
    draft.frequency = "WEEKLY";
  }

  const dayMatch = t.match(
    /\b(sundays?|sun|mondays?|mon|tuesdays?|tues|tue|wednesdays?|wed|thursdays?|thurs|thur|thu|fridays?|fri|saturdays?|sat)\b/
  );
  if (dayMatch) {
    const key = dayMatch[1].replace(/s$/, "");
    const weekday =
      DAY_ALIASES[key] ??
      DAY_ALIASES[dayMatch[1]] ??
      DAY_ALIASES[dayMatch[1].slice(0, 3)];
    if (weekday != null) {
      if (/\bpayday\b/.test(t) && !/\bstarts?\b/.test(t)) {
        draft.startWeekday = (weekday + 1) % 7;
      } else {
        draft.startWeekday = weekday;
      }
    }
  }

  const iso = raw.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) {
    draft.periodStart = iso[1];
  }

  if (draft.startWeekday != null) {
    draft.periodStart = snapToWeekday(
      draft.periodStart ?? mostRecentWeekday(draft.startWeekday, today),
      draft.startWeekday
    );
  }

  return draft;
}

export function setupSummary(input: {
  frequency: PayFrequency;
  periodStart: string;
  periodEnd: string;
}): string {
  const weekday = WEEKDAY_LONG[new Date(`${input.periodStart}T00:00:00Z`).getUTCDay()];
  const cadence =
    input.frequency === "BIWEEKLY"
      ? "every two weeks"
      : input.frequency === "ROLLING_3_WEEK"
        ? "every three weeks"
        : "every week";
  return `${cadence}, starting ${weekday}. This period is ${input.periodStart} through ${input.periodEnd}. The next one starts the day after that.`;
}
