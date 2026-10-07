import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { releaseHeldAlerts } from "@/lib/alerts";
import { forEachShop } from "@/lib/shop-of";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  // Every shop, each in its own scope (multi-shop B2).
  const shops = await forEachShop(() => releaseHeldAlerts());
  const released = shops.reduce((n, s) => n + (Number(s.result) || 0), 0);
  return NextResponse.json({ ok: true, released, shops: shops.length, errors: shops.filter((s) => s.error).length });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
