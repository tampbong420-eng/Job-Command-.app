import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { normalizePinDigits } from "@/lib/signup-pin";

export { pinProblem, isTrivialPin, pinMatchesPhone, PIN_MIN, PIN_MAX } from "@/lib/signup-pin";

/**
 * Stored for a login that has no PIN picked yet (new crew before they open their invite link).
 * Not a "salt:hash" pair, so verifyPin() can never match it.
 */
export const UNSET_PIN_HASH = "UNSET";

/**
 * Last 4 digits of a phone. ONLY used to DETECT an old phone-made PIN (to show "please change your PIN").
 * Never use it to make a PIN (go-public blocker B1).
 */
export function phoneTail(phone?: string | null) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : "";
}

/** @deprecated kept for old tests/imports; never use it to make a PIN. */
export function pinFromPhone(phone?: string | null, fallback = "1001") {
  return phoneTail(phone) || fallback;
}

/** 4–6 digits, or "". */
export function normalizePin(value: unknown) {
  return normalizePinDigits(value);
}

export function hashPin(pin: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPin(pin: string, stored: string) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash || !pin) return false;
  try {
    const next = scryptSync(pin, salt, 32);
    const prev = Buffer.from(hash, "hex");
    if (prev.length !== next.length) return false;
    return timingSafeEqual(prev, next);
  } catch {
    return false;
  }
}

export function pinIsSet(stored: string | null | undefined) {
  return String(stored || "").includes(":");
}

/** True when the stored PIN is still the last 4 of one of these phones (an old phone-made PIN). */
export function storedPinIsPhoneTail(stored: string, phones: Array<string | null | undefined>) {
  if (!pinIsSet(stored)) return false;
  const tails = new Set(phones.map(phoneTail).filter(Boolean));
  for (const tail of tails) if (verifyPin(tail, stored)) return true;
  return false;
}

