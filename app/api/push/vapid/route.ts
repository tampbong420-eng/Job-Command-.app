import { NextResponse } from "next/server";
import { ensureVapid } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function GET() {
  const keys = await ensureVapid();
  return NextResponse.json({ publicKey: keys.publicKey });
}
