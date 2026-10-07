import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { runJobCostSync } from "@/lib/job-cost";
import { forEachShop } from "@/lib/shop-of";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  // Every shop, each in its own scope (multi-shop B2). The first shop's numbers stay at the top level.
  const shops = await forEachShop(() => runJobCostSync());
  const first = shops[0]?.result || {};
  return NextResponse.json({ ok: true, ...first, shops: shops.length, errors: shops.filter((s) => s.error).length });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
