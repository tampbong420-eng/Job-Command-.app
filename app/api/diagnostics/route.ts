import { NextResponse } from "next/server";
import { reportServerError } from "@/lib/diagnostics";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { message?: string };
  reportServerError(body.message || "client");
  return NextResponse.json({ ok: true });
}
