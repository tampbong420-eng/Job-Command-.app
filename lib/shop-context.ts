// Server only. Which shop this request belongs to (multi-shop, go-public B2).
// Order: a pinned shop (runWithShop: cron loops, webhooks, public token pages, tests) → the signed-in session's
// shop → the phone's chosen shop cookie (sign-in / sign-up, signed out) → "default" (Top Gun; scripts, seed).
import { AsyncLocalStorage } from "node:async_hooks";
import { DEFAULT_SHOP, SHOP_COOKIE, validShopId } from "@/lib/shop-scope-core";

const pinned = new AsyncLocalStorage<string>();

export function runWithShop<T>(shopId: string, fn: () => T): T {
  return pinned.run(validShopId(shopId) || DEFAULT_SHOP, fn);
}

export function pinnedShop() {
  return pinned.getStore() || "";
}

export async function currentShopId(): Promise<string> {
  const fixed = pinned.getStore();
  if (fixed) return fixed;
  try {
    const { cookies } = await import("next/headers");
    const jar = cookies();
    const { decodeSession, SESSION_COOKIE } = await import("@/lib/session");
    const session = await decodeSession(jar.get(SESSION_COOKIE)?.value);
    // A signed-in phone is always its login's shop (old cookies without shopId = the first shop).
    if (session) return validShopId(session.shopId) || DEFAULT_SHOP;
    const chosen = validShopId(jar.get(SHOP_COOKIE)?.value);
    if (chosen) return chosen;
  } catch {
    /* not in a request (scripts, seed, tests): the first shop */
  }
  return DEFAULT_SHOP;
}
