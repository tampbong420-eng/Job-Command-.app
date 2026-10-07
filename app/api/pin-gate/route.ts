import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET: Returns whether the PIN gate is currently disabled
export async function GET() {
  // Eric 2026-10-07: PIN gate disabled — he doesn't know the PIN, bypass it.
  return NextResponse.json({
    ok: true,
    pinGateDisabled: true,
  });
}

// POST: Toggle the PIN gate (admin only)
// Body: { disabled: boolean, confirm: "toggle-pin-gate" }
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (body.confirm !== "toggle-pin-gate" || typeof body.disabled !== "boolean") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  try {
    // Verify admin session
    const { sessionFromCookieHeader } = await import("@/lib/session");
    const { can } = await import("@/lib/access");
    const session = await sessionFromCookieHeader(request.headers.get("cookie"));
    if (!session || !can(session, "admin")) {
      return NextResponse.json({ ok: false, error: "admin required" }, { status: 403 });
    }

    const { prisma } = await import("@/lib/prisma");
    await prisma.appSettings.upsert({
      where: { id: "default" },
      update: { pinGateDisabled: body.disabled },
      create: {
        id: "default",
        periodAnchor: new Date(),
        pinGateDisabled: body.disabled,
      },
    });
    return NextResponse.json({ ok: true, pinGateDisabled: body.disabled });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message.slice(0, 300) : "Unknown" },
      { status: 500 }
    );
  }
}
