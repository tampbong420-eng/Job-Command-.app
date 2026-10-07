/**
 * PIN lockout rules (go-public blocker B1). Pure: no database, so tests can drive the clock.
 *
 * Two counters guard every sign-in:
 *  - per phone/IP ("ip:<ip>"):   5 wrong PINs  → locked 5 min, then 10, 20, 40 … (max 24 h)
 *  - whole shop ("shop"):        25 wrong PINs → locked 5 min, then 10, 20 … (stops guessing from many IPs)
 * A right PIN clears that phone's counter and the shop's running count (not the shop's backoff level).
 * Backoff levels fade after 24 hours with no wrong PIN.
 */
export type ThrottleRow = {
  key: string;
  failures: number;
  lockCount: number;
  lockedUntil: Date | null;
  lastFailAt: Date | null;
};

export const IP_LIMIT = 3;
export const SHOP_LIMIT = 25;
export const BASE_LOCK_MS = 30_000;
export const MAX_LOCK_MS = 30_000;
export const DECAY_MS = 24 * 60 * 60_000;

export function limitForKey(key: string) {
  return key.endsWith("|shop") ? SHOP_LIMIT : IP_LIMIT;
}

export function lockMsFor(lockCount: number) {
  return Math.min(MAX_LOCK_MS, BASE_LOCK_MS * 2 ** Math.max(0, lockCount));
}

export function blankRow(key: string): ThrottleRow {
  return { key, failures: 0, lockCount: 0, lockedUntil: null, lastFailAt: null };
}

/** Seconds left on a lock, 0 when open. */
export function lockedFor(row: ThrottleRow | null | undefined, now: number) {
  if (!row?.lockedUntil) return 0;
  const left = row.lockedUntil.getTime() - now;
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

/** Row after one wrong PIN. */
export function afterFailure(row: ThrottleRow | null | undefined, now: number): ThrottleRow {
  const base = row ? { ...row } : blankRow("");
  if (base.lastFailAt && now - base.lastFailAt.getTime() > DECAY_MS) {
    base.lockCount = 0;
    base.failures = 0;
  }
  // A lock that ran out starts a fresh count (backoff level kept).
  if (base.lockedUntil && base.lockedUntil.getTime() <= now) base.lockedUntil = null;
  base.failures += 1;
  base.lastFailAt = new Date(now);
  if (base.failures >= limitForKey(base.key || (row?.key ?? ""))) {
    base.lockedUntil = new Date(now + lockMsFor(base.lockCount));
    base.lockCount += 1;
    base.failures = 0;
  }
  return base;
}

/** Row after a right PIN. Phone/IP rows clear fully; the shop row keeps its backoff level. */
export function afterSuccess(row: ThrottleRow | null | undefined): ThrottleRow | null {
  if (!row) return null;
  if (row.key.endsWith("|shop")) return { ...row, failures: 0 };
  return null; // delete
}

export function throttleKeys(shopId: string, ip: string) {
  const shop = shopId || "default";
  return { ip: `${shop}|ip:${ip || "local"}`, shop: `${shop}|shop` };
}

export function lockMessage(seconds: number) {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `Too many wrong PINs. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}
