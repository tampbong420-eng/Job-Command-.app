import { NextResponse } from "next/server";
import { driveTime } from "@/lib/drive";
import { shopAddress } from "@/lib/maps";
import { loadPayrollSettings } from "@/lib/queries";
import { rejectRemovedLogin } from "@/lib/live-session";

export async function POST(request: Request) {
  const removed = await rejectRemovedLogin();
  if (removed) return removed;
  const body = (await request.json().catch(() => ({}))) as {
    origin?: string;
    destination?: string;
  };
  const settings = await loadPayrollSettings();
  const origin = (body.origin || shopAddress(settings.businessAddress)).trim();
  const destination = (body.destination || "").trim();
  if (!destination) {
    return NextResponse.json({ error: "Need a destination address." }, { status: 400 });
  }
  const leg = await driveTime(origin, destination);
  return NextResponse.json(leg);
}
