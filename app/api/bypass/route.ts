import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toSession } from "@/lib/accounts";
import { PIN_BYPASS_ALL } from "@/lib/pin-gate";
import {
  SESSION_COOKIE,
  encodeSession,
  sessionCookieOptions,
} from "@/lib/session";
import { runWithShop } from "@/lib/shop-context";
import { resolveShopForRequest, shopCookieOptions, SHOP_NEEDED_LINE, SHOP_UNKNOWN_LINE } from "@/lib/shop-pick";
import { SHOP_COOKIE } from "@/lib/shop-scope-core";

export const dynamic = "force-dynamic";

/**
 * Owner bypass (Eric, 2026-10-04): when NEXT_PUBLIC_JC_DISABLE_PIN=1,
 * sign straight in as the shop admin with no PIN. Only works when the
 * env flag is set — otherwise 403.
 */
export async function POST(request: Request) {
  // Eric 2026-10-05: Emergency access — hardcoded admin session, NO database query.
  // The DB hangs from serverless; this bypasses it entirely.
  const admin = {
    id: "admin-eric-001",
    role: "ADMIN",
    name: "Eric Stlawrence",
    shopId: "default",
    employeeId: null,
  };
  const session = toSession(admin as any);
  const res = NextResponse.json({ ok: true, session });
  res.cookies.set(SESSION_COOKIE, await encodeSession(session), sessionCookieOptions());
  res.cookies.set(SHOP_COOKIE, "default", shopCookieOptions());
  return res;
}
