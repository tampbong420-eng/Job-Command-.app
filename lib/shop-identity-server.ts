import "server-only";
import { prisma } from "@/lib/prisma";
import { setShopTimeZone } from "@/lib/dates";
import { US_STATES, shopPlaceFor } from "@/lib/shop-place";

export type ShopIdentityLite = {
  /** The shop's own name from sign-up / Company. Empty until they type one. */
  name: string;
  /** Town-level label ("Tulsa, OK"), never the street: this reaches signed-out phones too. */
  place: string;
  /** Rough state-level spot for sunrise/sunset, or null when the address doesn't say. */
  lat: number | null;
  lng: number | null;
  /** IANA zone from the address, or "" when the address doesn't say. */
  timeZone: string;
  /** Trade from sign-up ("Painting", "Plumbing"…); "" for older shops (= painting). */
  trade: string;
};

const EMPTY: ShopIdentityLite = { name: "", place: "", lat: null, lng: null, timeZone: "", trade: "" };

/**
 * The shop's name and place, read from its own settings row. Used by the root layout for the page
 * title and the shop clock. Never throws: a missing table or DB just means "no shop yet".
 */
export async function loadShopIdentity(): Promise<ShopIdentityLite> {
  try {
    // Ensure logoUrl column exists (schema has it, production DB may not — prevents Server Components crash)
    await prisma.$executeRaw`ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT`;
    const row = await prisma.appSettings.findUnique({
      where: { id: "default" },
      select: { businessName: true, businessAddress: true, industry: true },
    });
    if (!row) return EMPTY;
    const place = shopPlaceFor(row.businessAddress);
    const identity: ShopIdentityLite = {
      name: row.businessName.trim(),
      place: place?.label || "",
      lat: place?.lat ?? null,
      lng: place?.lng ?? null,
      timeZone: place?.timeZone || "",
      trade: row.industry || "",
    };
    setShopTimeZone(identity.timeZone || null);
    return identity;
  } catch {
    return EMPTY;
  }
}

/** Town/state and trade for the market price check (lib/market-pricing.ts). */
export async function loadShopMarketPlace(): Promise<{ region: string; state: string; trade: string }> {
  try {
    const row = await prisma.appSettings.findUnique({
      where: { id: "default" },
      select: { businessAddress: true, industry: true },
    });
    const place = shopPlaceFor(row?.businessAddress);
    const state = place ? US_STATES.find((item) => item.code === place.state)?.name || "" : "";
    return { region: place?.label || "", state, trade: row?.industry || "" };
  } catch {
    return { region: "", state: "", trade: "" };
  }
}
