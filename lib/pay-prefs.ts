export type PayPrefs = {
  acceptCard: boolean;
  acceptAch: boolean;
  acceptCash: boolean;
  depositPercent: number;
};

export const DEFAULT_PAY_PREFS: PayPrefs = {
  acceptCard: true,
  acceptAch: false,
  acceptCash: true,
  depositPercent: 0,
};

/** First-run setup: nothing preselected. Deposit -1 means unset. */
export const BLANK_SETUP_PAY_PREFS: PayPrefs = {
  acceptCard: false,
  acceptAch: false,
  acceptCash: false,
  depositPercent: -1,
};

export const DEPOSIT_CHOICES = [0, 10, 25, 50] as const;

export function depositIsChosen(value: number | null | undefined) {
  return (DEPOSIT_CHOICES as readonly number[]).includes(Number(value));
}

export function clampDeposit(value: number | null | undefined) {
  const n = Number(value || 0);
  return (DEPOSIT_CHOICES as readonly number[]).includes(n) ? n : 0;
}

export function parsePayPrefs(input: Partial<PayPrefs> | null | undefined): PayPrefs {
  return {
    acceptCard: input?.acceptCard !== false,
    acceptAch: Boolean(input?.acceptAch),
    acceptCash: input?.acceptCash !== false,
    depositPercent: clampDeposit(input?.depositPercent),
  };
}

export function payPrefsSummary(prefs: PayPrefs) {
  const methods = [
    prefs.acceptCard ? "cards" : "",
    prefs.acceptAch ? "ACH" : "",
    prefs.acceptCash ? "cash/check" : "",
  ].filter(Boolean);
  const take = methods.length ? methods.join(", ") : "no methods yet";
  const deposit = prefs.depositPercent > 0 ? `${prefs.depositPercent}% deposit before work` : "no deposit required";
  return `${take}. ${deposit}. Stripe and bank link stay on Company.`;
}

export function parsePayTalk(text: string): Partial<PayPrefs> {
  const t = text.toLowerCase();
  const next: Partial<PayPrefs> = {};
  if (/no card|cash only|check only/.test(t)) next.acceptCard = false;
  if (/credit|debit|card|stripe|visa/.test(t)) next.acceptCard = true;
  if (/\bach\b|bank transfer|e-check/.test(t)) next.acceptAch = true;
  if (/no ach|no bank/.test(t)) next.acceptAch = false;
  if (/cash|check/.test(t)) next.acceptCash = true;
  if (/no cash|cards only/.test(t)) next.acceptCash = false;
  if (/no deposit|don't take a deposit|skip deposit/.test(t)) next.depositPercent = 0;
  const pct = t.match(/\b(10|25|50)\s*%/);
  if (pct) next.depositPercent = Number(pct[1]);
  if (/half down|fifty/.test(t) && /deposit|down/.test(t)) next.depositPercent = 50;
  return next;
}
