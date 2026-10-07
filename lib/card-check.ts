/**
 * $1 card check before the 30-day trial (pure; safe for client and server).
 * A $1 authorization hold that is released right away (never captured). Mock mode (no Stripe keys)
 * runs the same screens with our own card fields; only last4, brand, and a SHA-256 of the number
 * ever leave the phone, never the card number.
 */

export const CARD_CHECK_CENTS = 100;
/** How long a passing check stays good for finishing setup. */
export const CARD_CHECK_TTL_MS = 2 * 60 * 60 * 1000;

export type CardBrand = "visa" | "mastercard" | "amex" | "discover" | "card";

export function cardDigits(raw = "") {
  return String(raw).replace(/\D/g, "").slice(0, 19);
}

export function luhnValid(raw = "") {
  const digits = cardDigits(raw);
  if (digits.length < 13) return false;
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    let digit = Number(digits[digits.length - 1 - index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

export function cardBrand(raw = ""): CardBrand {
  const digits = cardDigits(raw);
  if (/^4/.test(digits)) return "visa";
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(digits)) return "mastercard";
  if (/^3[47]/.test(digits)) return "amex";
  if (/^(6011|65|64[4-9])/.test(digits)) return "discover";
  return "card";
}

export function brandLabel(brand = "") {
  const key = String(brand).toLowerCase();
  if (key === "visa") return "Visa";
  if (key === "mastercard") return "Mastercard";
  if (key === "amex" || key === "american express") return "Amex";
  if (key === "discover") return "Discover";
  return "Card";
}

/** "4242424242424242" → "4242 4242 4242 4242" (Amex 4-6-5). */
export function formatCardNumber(raw = "") {
  const digits = cardDigits(raw);
  const groups = cardBrand(digits) === "amex" ? [4, 6, 5] : [4, 4, 4, 4, 3];
  const out: string[] = [];
  let at = 0;
  for (const size of groups) {
    if (at >= digits.length) break;
    out.push(digits.slice(at, at + size));
    at += size;
  }
  return out.join(" ");
}

/** "1129" / "11/29" → "11/29". */
export function formatExpiry(raw = "") {
  const digits = String(raw).replace(/\D/g, "").slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

export function expiryProblem(raw: string, now = new Date()) {
  const match = formatExpiry(raw).match(/^(\d{2})\/(\d{2})$/);
  if (!match) return "Add the month and year, like 11/29.";
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) return "That month doesn’t look right.";
  const lastDay = new Date(year, month, 0, 23, 59, 59);
  if (lastDay < now) return "That card is expired. Try another card.";
  return "";
}

/** First thing wrong with the typed card (mock fields), or "" when it can be checked. */
export function cardFieldsProblem(input: { number: string; expiry: string; cvc: string; zip: string }, now = new Date()) {
  const digits = cardDigits(input.number);
  if (digits.length < 13) return "Add the whole card number.";
  if (!luhnValid(digits)) return "That card number doesn’t look right. Check the digits.";
  const expiry = expiryProblem(input.expiry, now);
  if (expiry) return expiry;
  const cvcLength = cardBrand(digits) === "amex" ? 4 : 3;
  if (String(input.cvc).replace(/\D/g, "").length !== cvcLength) return `Add the ${cvcLength}-digit code on the card.`;
  if (String(input.zip).replace(/\D/g, "").length !== 5) return "Add the 5-digit ZIP for the card.";
  return "";
}

export type Declined = { code: string; title: string; line: string };

/** Stripe decline/error code → plain words. "Nothing was charged" is always true for a failed hold. */
export function declineCopy(code = "", declineCode = ""): Declined {
  const key = (declineCode || code || "").toLowerCase();
  const title = "That card didn’t work";
  const lines: Record<string, string> = {
    insufficient_funds: "Your bank said there isn’t enough on the card for the $1 check.",
    expired_card: "Your bank says that card is expired.",
    incorrect_cvc: "The 3-digit code didn’t match. Check the back of the card.",
    invalid_cvc: "The 3-digit code didn’t match. Check the back of the card.",
    incorrect_zip: "The ZIP code didn’t match what your bank has.",
    incorrect_number: "That card number doesn’t look right. Check the digits.",
    invalid_number: "That card number doesn’t look right. Check the digits.",
    invalid_expiry_month: "The expiration date doesn’t look right.",
    invalid_expiry_year: "The expiration date doesn’t look right.",
    processing_error: "Your bank had a hiccup. Try again in a minute.",
    authentication_required: "Your bank wants you to confirm it’s you. Try again and approve it.",
    card_velocity_exceeded: "Your bank paused the card for too many tries. Try another card.",
    rate_limited: "Too many tries. Wait a few minutes, then try again.",
  };
  return { code: key || "card_declined", title, line: lines[key] || "Your bank said no to the $1 check." };
}

/** Mock-mode test cards (same last4 as Stripe's test cards): 0002 declines, 9995 is insufficient funds. */
export function mockCardOutcome(last4: string): { ok: true } | { ok: false; code: string } {
  if (last4 === "0002") return { ok: false, code: "card_declined" };
  if (last4 === "9995") return { ok: false, code: "insufficient_funds" };
  if (last4 === "0069") return { ok: false, code: "expired_card" };
  if (last4 === "0127") return { ok: false, code: "incorrect_cvc" };
  return { ok: true };
}

export function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

/** Has this shop passed the $1 check recently, with the same one-use token the client holds? */
export function cardCheckPassed(
  row: { cardCheckAt?: Date | string | null; cardCheckToken?: string | null } | null | undefined,
  token: string | null | undefined,
  now = new Date()
) {
  if (!row?.cardCheckAt || !row.cardCheckToken || !token) return false;
  if (!safeEqual(row.cardCheckToken, token)) return false;
  const at = new Date(row.cardCheckAt).getTime();
  return Number.isFinite(at) && now.getTime() - at >= 0 && now.getTime() - at <= CARD_CHECK_TTL_MS;
}

/**
 * Server backstop in completeOnboarding: a recent passing check whose token hasn't been used yet,
 * and the trial guard didn't block this card/shop (the blocked path closes the window first).
 */
export function cardCheckOnFile(
  row: { cardCheckAt?: Date | string | null; cardCheckToken?: string | null; trialGuard?: string | null } | null | undefined,
  now = new Date()
) {
  if (String(row?.trialGuard || "").startsWith("blocked:")) return false;
  return Boolean(row?.cardCheckToken) && cardCheckPassed(row, row?.cardCheckToken, now);
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

/** "Nov 1" for the timeline / hold copy. */
export function trialEndLabel(start: Date, days = 30) {
  const end = new Date(start.getTime());
  end.setDate(end.getDate() + days);
  return end.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * SHA-256 hex in plain JS. crypto.subtle only exists on https/localhost; a phone on the shop's
 * LAN address (http://192.168…) still needs to hash the card number before anything is sent.
 */
export function sha256Hex(message: string) {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
    0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
    0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const bytes = Array.from(new TextEncoder().encode(message));
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let shift = 56; shift >= 0; shift -= 8) bytes.push(Math.floor(bitLength / 2 ** shift) & 0xff);
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const rotr = (value: number, bits: number) => (value >>> bits) | (value << (32 - bits));
  const W = new Array<number>(64);
  for (let chunk = 0; chunk < bytes.length; chunk += 64) {
    for (let i = 0; i < 16; i += 1) {
      W[i] = (bytes[chunk + i * 4] << 24) | (bytes[chunk + i * 4 + 1] << 16) | (bytes[chunk + i * 4 + 2] << 8) | bytes[chunk + i * 4 + 3];
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + W[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0;
    H[1] = (H[1] + b) | 0;
    H[2] = (H[2] + c) | 0;
    H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0;
    H[5] = (H[5] + f) | 0;
    H[6] = (H[6] + g) | 0;
    H[7] = (H[7] + h) | 0;
  }
  return H.map((value) => (value >>> 0).toString(16).padStart(8, "0")).join("");
}
