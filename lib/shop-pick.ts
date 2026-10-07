// Server only. Resolve the shop for a signed-out sign-in / Forgot PIN request, and remember it on this phone.
import { prismaAllShops } from "@/lib/prisma";
import { pickShop, type ShopPick } from "@/lib/shop-pick-core";
import { SHOP_COOKIE } from "@/lib/shop-scope-core";

export async function resolveShopForRequest(request: Request, typed?: string | null): Promise<ShopPick> {
  const rows = await prismaAllShops.appSettings.findMany({ select: { id: true, companyPhone: true, ownerPhone: true } });
  const cookie = readCookie(request.headers.get("cookie") || "", SHOP_COOKIE);
  return pickShop({ typed, cookie }, rows);
}

function readCookie(header: string, name: string) {
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return "";
}

export function shopCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 400,
  };
}

export const SHOP_NEEDED_LINE = "Type your shop's phone number once on this phone.";
export const SHOP_UNKNOWN_LINE = "We couldn't find that shop. Check the shop phone number.";
