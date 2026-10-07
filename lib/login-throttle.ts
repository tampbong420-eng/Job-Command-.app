// Server only (database). Durable PIN lockout, survives restarts and every server instance shares it.
import { prisma } from "@/lib/prisma";
import {
  afterFailure,
  afterSuccess,
  blankRow,
  lockedFor,
  throttleKeys,
  type ThrottleRow,
} from "@/lib/login-throttle-core";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function read(db: Db, key: string): Promise<ThrottleRow | null> {
  const row = await db.loginThrottle.findUnique({ where: { key } }).catch(() => null);
  return row ? { key, failures: row.failures, lockCount: row.lockCount, lockedUntil: row.lockedUntil, lastFailAt: row.lastFailAt } : null;
}

async function write(db: Db, key: string, row: ThrottleRow | null) {
  if (!row) {
    await db.loginThrottle.deleteMany({ where: { key } }).catch(() => undefined);
    return;
  }
  const data = { failures: row.failures, lockCount: row.lockCount, lockedUntil: row.lockedUntil, lastFailAt: row.lastFailAt };
  await db.loginThrottle.upsert({ where: { key }, create: { key, ...data }, update: data });
}

/** Seconds until this phone may try again (0 = open). Checks the phone/IP lock and the shop-wide lock. */
export async function pinLockSeconds(input: { shopId: string; ip: string; now?: number; db?: Db }) {
  const db = input.db || prisma;
  const now = input.now ?? Date.now();
  const keys = throttleKeys(input.shopId, input.ip);
  const [ip, shop] = await Promise.all([read(db, keys.ip), read(db, keys.shop)]);
  return Math.max(lockedFor(ip, now), lockedFor(shop, now));
}

/** Count one wrong PIN. Returns seconds locked after it (0 = still open). */
export async function recordPinFailure(input: { shopId: string; ip: string; now?: number; db?: Db }) {
  const db = input.db || prisma;
  const now = input.now ?? Date.now();
  const keys = throttleKeys(input.shopId, input.ip);
  let locked = 0;
  for (const key of [keys.ip, keys.shop]) {
    const next = afterFailure((await read(db, key)) || blankRow(key), now);
    next.key = key;
    await write(db, key, next);
    locked = Math.max(locked, lockedFor(next, now));
  }
  return locked;
}

export async function recordPinSuccess(input: { shopId: string; ip: string; db?: Db }) {
  const db = input.db || prisma;
  const keys = throttleKeys(input.shopId, input.ip);
  for (const key of [keys.ip, keys.shop]) {
    const row = await read(db, key);
    if (row) await write(db, key, afterSuccess(row));
  }
}
