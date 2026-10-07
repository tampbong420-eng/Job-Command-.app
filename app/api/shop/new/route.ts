import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getLiveSession } from "@/lib/live-session";
import { SHOP_COOKIE } from "@/lib/shop-scope-core";
import { shopCookieOptions } from "@/lib/shop-pick";
import { appOrigin } from "@/lib/origin";

export const dynamic = "force-dynamic";

/**
 * Open sign-up (multi-shop, go-public B2). GET /api/shop/new gives this phone a brand-new, empty shop and opens
 * company setup for it; nothing from any other shop is visible there. GET /api/shop/new?leave=1 forgets the
 * chosen shop on this phone (back to the normal sign-in). A signed-in phone must sign out first.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const home = new URL("/", appOrigin(request));
  const session = await getLiveSession();
  if (session) return NextResponse.redirect(home, { status: 303 });
  if (url.searchParams.get("leave") === "1") {
    const response = NextResponse.redirect(home, { status: 303 });
    response.cookies.set(SHOP_COOKIE, "", { ...shopCookieOptions(), maxAge: 0 });
    return response;
  }
  const shopId = `s_${randomBytes(12).toString("base64url").replace(/[^A-Za-z0-9]/g, "x")}`;
  const response = NextResponse.redirect(home, { status: 303 });
  response.cookies.set(SHOP_COOKIE, shopId, shopCookieOptions());
  return response;
}
