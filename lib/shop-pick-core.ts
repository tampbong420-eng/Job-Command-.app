// Pure. Which shop a signed-out phone is signing in to (multi-shop, go-public B2).
// A shop is named by its phone number (company or owner phone, any format) or its shop id.
import { validShopId } from "@/lib/shop-scope-core";

export type ShopRow = { id: string; companyPhone?: string | null; ownerPhone?: string | null };
export type ShopPick = { kind: "shop"; shopId: string } | { kind: "need" } | { kind: "unknown" };

const tail10 = (v: string | null | undefined) => String(v || "").replace(/\D/g, "").slice(-10);

/** Match what the person typed ("(501) 555-0142", "5015550142", a shop id) to exactly one shop. */
export function matchShop(typed: string, rows: ShopRow[]): string | null {
  const raw = String(typed || "").trim();
  if (!raw) return null;
  const byId = rows.find((r) => r.id === raw);
  if (byId) return byId.id;
  const digits = tail10(raw);
  if (digits.length < 7) return null;
  const hits = rows.filter((r) => [r.companyPhone, r.ownerPhone].some((p) => tail10(p).length >= 7 && tail10(p).endsWith(digits)));
  return hits.length === 1 ? hits[0].id : null; // two shops sharing a number: ask for the shop id instead
}

/** typed (this request) → saved choice on this phone (cookie) → the only shop → ask. */
export function pickShop(input: { typed?: string | null; cookie?: string | null }, rows: ShopRow[]): ShopPick {
  if (String(input.typed || "").trim()) {
    const id = matchShop(String(input.typed), rows);
    return id ? { kind: "shop", shopId: id } : { kind: "unknown" };
  }
  const saved = validShopId(input.cookie);
  if (saved && rows.some((r) => r.id === saved)) return { kind: "shop", shopId: saved };
  if (rows.length <= 1) return { kind: "shop", shopId: rows[0]?.id || "default" };
  return { kind: "need" };
}
