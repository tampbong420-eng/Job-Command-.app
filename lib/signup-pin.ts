/**
 * Client-safe PIN rules (lib/pin.ts pulls in node:crypto, so the shared rules live here).
 *
 * Go-public blocker B1 (Oct 2 2026): PINs are never made from a phone number any more. Every PIN is picked by
 * the person, 4 to 6 numbers, and the easy ones are refused: all one number (0000), runs (1234, 9876), a short
 * list of the most-guessed PINs, and the last digits of the shop's or the person's own phone (those phone
 * numbers are printed on every invoice).
 */
export const PIN_MIN = 4;
export const PIN_MAX = 6;

/** 4–6 digits, or "" when the value is not a usable PIN. */
export function normalizePinDigits(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= PIN_MIN && digits.length <= PIN_MAX ? digits : "";
}

/** The most-guessed short PINs (beyond all-same and straight runs, which are caught by rule). */
const COMMON = new Set([
  "1212", "1122", "2580", "0852", "6969", "1004", "2000", "1313", "4321", "2001", "1010", "0101",
  "5683", "0007", "1999", "2468", "1357", "7410", "0110", "1221", "2112", "1984", "1001", "4242",
  "112233", "121212", "123123", "654321", "696969", "159753", "147258", "111222", "102030", "131313",
  "101010", "000111", "222333", "789456", "456789", "098765",
]);

function isRun(pin: string) {
  let up = true;
  let down = true;
  for (let i = 1; i < pin.length; i += 1) {
    const step = Number(pin[i]) - Number(pin[i - 1]);
    if (step !== 1 && !(pin[i - 1] === "9" && pin[i] === "0")) up = false;
    if (step !== -1 && !(pin[i - 1] === "0" && pin[i] === "9")) down = false;
  }
  return up || down;
}

/** True for 0000, 1234, 9876, 1212 and friends. */
export function isTrivialPin(pin: string) {
  const digits = String(pin || "");
  if (!digits) return true;
  if (/^(\d)\1+$/.test(digits)) return true;
  if (isRun(digits)) return true;
  if (COMMON.has(digits)) return true;
  // Two-number repeats like 1212 / 4545 / 121212.
  if (/^(\d\d)\1+$/.test(digits)) return true;
  return false;
}

/** True when the PIN is the tail of any of these phone numbers (last 4, or last 5/6 for longer PINs). */
export function pinMatchesPhone(pin: string, phones: Array<string | null | undefined>) {
  const digits = String(pin || "");
  if (!digits) return false;
  return phones.some((phone) => {
    const tail = String(phone || "").replace(/\D/g, "");
    if (tail.length < 4) return false;
    if (tail.slice(-digits.length) === digits) return true;
    // A 5/6-digit PIN that still ends in the phone's last 4 is just as easy to guess.
    return digits.length > 4 && digits.slice(-4) === tail.slice(-4);
  });
}

/** Plain-words reason the PIN can't be used, or null when it's fine. */
export function pinProblem(value: unknown, phones: Array<string | null | undefined> = []): string | null {
  const raw = String(value ?? "").replace(/\D/g, "");
  if (!raw) return "Pick a PIN: 4 to 6 numbers.";
  const pin = normalizePinDigits(raw);
  if (!pin) return "The PIN is 4 to 6 numbers.";
  if (pinMatchesPhone(pin, phones)) return "Don't use the end of a phone number. It's printed on your invoices.";
  if (isTrivialPin(pin)) return "That PIN is too easy to guess. Pick another.";
  return null;
}
