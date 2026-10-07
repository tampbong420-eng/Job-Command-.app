import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { runEstimateFollowUps } from "@/lib/estimate-followup";
import { appOrigin } from "@/lib/origin";
import { forEachShop } from "@/lib/shop-of";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  // Every shop, each in its own scope (multi-shop B2).
  const origin = appOrigin(request);
  const shops = await forEachShop(() => runEstimateFollowUps(origin));
  const sent = shops.flatMap((s) => s.result || []);
  return NextResponse.json({ ok: true, sent: sent.length, items: sent, shops: shops.length, errors: shops.filter((s) => s.error).length });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
