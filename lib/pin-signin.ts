// Server only. PIN-first sign-in (go-public B1): the gate no longer lists names; the PIN finds the person.
import { verifyPin, normalizePin, pinIsSet } from "@/lib/pin";
import { REMOVED_PIN_HASH } from "@/lib/account-delete-core";
import { lockMessage } from "@/lib/login-throttle-core";
import { pinLockSeconds, recordPinFailure, recordPinSuccess } from "@/lib/login-throttle";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type PinAccount = { id: string; role: string; name: string; employeeId: string | null; pinHash: string };

export type PinSignIn =
  | { kind: "ok"; account: PinAccount }
  | { kind: "choose"; people: { id: string; name: string; role: "ADMIN" | "CREW" }[] }
  | { kind: "wrong"; locked: number }
  | { kind: "locked"; locked: number; message: string }
  | { kind: "bad" };

/**
 * Check a PIN against this shop's logins. With accountId (invite page, or after "two people share this PIN")
 * only that login is checked. Every wrong PIN counts toward the server-side lockout.
 */
export async function signInWithPin(
  db: Db,
  input: { shopId: string; ip: string; pin: unknown; accountId?: string | null; now?: number; accountScope?: Record<string, unknown> }
): Promise<PinSignIn> {
  const pin = normalizePin(input.pin);
  if (!pin) return { kind: "bad" };
  const now = input.now ?? Date.now();
  const lockArgs = { shopId: input.shopId, ip: input.ip, now, db };
  const waiting = await pinLockSeconds(lockArgs);
  if (waiting > 0) return { kind: "locked", locked: waiting, message: lockMessage(waiting) };

  const accountId = String(input.accountId || "").trim();
  const shopWhere = input.accountScope || {};
  const rows: PinAccount[] = accountId
    ? [await db.account.findFirst({ where: { id: accountId, ...shopWhere } })].filter(Boolean)
    : await db.account.findMany({ where: { pinHash: { not: REMOVED_PIN_HASH }, ...shopWhere } });
  const hits = rows.filter((row) => pinIsSet(row.pinHash) && verifyPin(pin, row.pinHash));
  if (!hits.length) {
    const locked = await recordPinFailure(lockArgs);
    return locked > 0 ? { kind: "locked", locked, message: lockMessage(locked) } : { kind: "wrong", locked: 0 };
  }
  await recordPinSuccess(lockArgs);
  if (hits.length === 1) return { kind: "ok", account: hits[0] };
  // Two logins share this PIN: only someone who knows the PIN sees these names.
  return {
    kind: "choose",
    people: hits.map((row) => ({ id: row.id, name: row.name, role: row.role === "CREW" ? "CREW" : "ADMIN" })),
  };
}
