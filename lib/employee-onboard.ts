export const PAY_METHODS = ["W2", "CASH"] as const;
export type PayMethod = (typeof PAY_METHODS)[number];

export const FILING_STATUSES = [
  "SINGLE",
  "MARRIED",
  "MARRIED_SEPARATE",
  "HEAD",
  "EXEMPT",
] as const;
export type FilingStatus = (typeof FILING_STATUSES)[number];

export const FILING_STATUS_LABEL: Record<FilingStatus, string> = {
  SINGLE: "Single",
  MARRIED: "Married, jointly",
  MARRIED_SEPARATE: "Married, separately",
  HEAD: "Head of household",
  EXEMPT: "Exempt — no withhold",
};

export const PAY_METHOD_LABEL: Record<PayMethod, string> = {
  W2: "W-2 (taxable wages)",
  CASH: "Cash / alternative",
};

const FEDERAL_BASE: Record<FilingStatus, number> = {
  SINGLE: 15,
  MARRIED: 10,
  MARRIED_SEPARATE: 14,
  HEAD: 12,
  EXEMPT: 0,
};

const STATE_BASE: Record<FilingStatus, number> = {
  SINGLE: 5,
  MARRIED: 3.9,
  MARRIED_SEPARATE: 5,
  HEAD: 4.4,
  EXEMPT: 0,
};

export type EmployeeOnboardInput = {
  token?: string | null;
  username?: string | null;
  password?: string | null;
  payMethod?: string | null;
  filingStatus?: string | null;
  allowances?: number | string | null;
};

export type ParsedEmployeeOnboard = {
  token: string;
  username: string;
  password: string;
  payMethod: PayMethod;
  filingStatus: FilingStatus;
  allowances: number;
};

export type WithholdElection = {
  payMethod: PayMethod;
  filingStatus: FilingStatus;
  allowances: number;
};

export type WithholdPercents = {
  federalWithholdPct: number;
  stateWithholdPct: number;
};

function roundPct(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function parsePayMethod(value: unknown): PayMethod | "" {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "W2" || raw === "W-2") return "W2";
  if (raw === "CASH" || raw === "ALTERNATIVE" || raw === "CASH/ALTERNATIVE") return "CASH";
  return "";
}

export function parseFilingStatus(value: unknown): FilingStatus | "" {
  const raw = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if ((FILING_STATUSES as readonly string[]).includes(raw)) return raw as FilingStatus;
  if (raw === "MARRIED_JOINT" || raw === "MFJ") return "MARRIED";
  if (raw === "MFS") return "MARRIED_SEPARATE";
  if (raw === "HOH") return "HEAD";
  return "";
}

export function parseAllowances(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(20, Math.round(n)));
}

export function parseUsername(value: unknown) {
  const raw = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(raw)) return "";
  return raw;
}

export function parsePassword(value: unknown) {
  const raw = String(value || "");
  if (raw.length < 8 || raw.length > 128) return "";
  if (!/\S/.test(raw)) return "";
  return raw;
}

export function withholdFromElection(input: WithholdElection): WithholdPercents {
  if (input.payMethod === "CASH" || input.filingStatus === "EXEMPT") {
    return { federalWithholdPct: 0, stateWithholdPct: 0 };
  }
  const allowances = parseAllowances(input.allowances);
  const federal = Math.max(0, FEDERAL_BASE[input.filingStatus] - allowances * 1.5);
  const state = Math.max(0, STATE_BASE[input.filingStatus] - allowances * 0.25);
  return {
    federalWithholdPct: roundPct(federal, 2),
    stateWithholdPct: roundPct(state, 2),
  };
}

export function parseEmployeeOnboard(
  input: EmployeeOnboardInput
): { ok: true; value: ParsedEmployeeOnboard } | { ok: false; error: string } {
  const token = String(input.token || "").trim();
  const username = parseUsername(input.username);
  const password = parsePassword(input.password);
  const payMethod = parsePayMethod(input.payMethod);
  const filingStatus = parseFilingStatus(input.filingStatus);
  const allowances = parseAllowances(input.allowances);
  if (!username) {
    return { ok: false, error: "Username must be 3–32 letters, numbers, dots, or dashes." };
  }
  if (!password) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  if (!payMethod) {
    return { ok: false, error: "Pick W-2 or cash / alternative pay." };
  }
  if (!filingStatus) {
    return { ok: false, error: "Pick a filing status for withholdings." };
  }
  return {
    ok: true,
    value: { token, username, password, payMethod, filingStatus, allowances },
  };
}

export function onboardPayrollSnapshot(input: WithholdElection & WithholdPercents) {
  return {
    payMethod: input.payMethod,
    filingStatus: input.filingStatus,
    allowances: parseAllowances(input.allowances),
    federalWithholdPct: input.federalWithholdPct,
    stateWithholdPct: input.stateWithholdPct,
  };
}
