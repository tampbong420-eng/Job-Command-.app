import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  SHOP_KEY,
  commitShop,
  defaultShop,
  getShopSnapshot,
  loadShop,
  resetShop,
  saveShop,
} from "../lib/session";

describe("shop session", { concurrency: false }, () => {
  test("loadShop returns null when window storage is missing", () => {
    const previous = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = undefined;
    assert.equal(loadShop(), null);
    (globalThis as { window?: unknown }).window = previous;
  });

  test("saveShop round-trips shop state", () => {
    const data = new Map<string, string>();
    (globalThis as { window: { localStorage: Pick<Storage, "getItem" | "setItem" | "removeItem"> } }).window = {
      localStorage: {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => {
          data.set(key, value);
        },
        removeItem: (key: string) => {
          data.delete(key);
        },
      },
    };

    const shop = defaultShop();
    shop.settings.account = "FIELD99";
    shop.employeeId = "e-dana";
    saveShop(shop);
    assert.equal(data.has(SHOP_KEY), true);
    const loaded = loadShop();
    assert.equal(loaded?.settings.account, "FIELD99");
    assert.equal(loaded?.employeeId, "e-dana");
    assert.equal(loaded?.jobs.length, shop.jobs.length);
    commitShop({ ...shop, employeeId: "e-liv" });
    assert.equal(getShopSnapshot().employeeId, "e-liv");
    resetShop();
    assert.equal(loadShop(), null);
    assert.equal(getShopSnapshot().employeeId, defaultShop().employeeId);
  });
});
