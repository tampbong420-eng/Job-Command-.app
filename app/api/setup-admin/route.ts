import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (body.confirm !== "setup-admin-2026") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  try {
    const { prisma } = await import("@/lib/prisma");
    const { hashPin } = await import("@/lib/pin");

    // Check if admin already exists
    const existing = await prisma.account.findFirst({
      where: { role: "ADMIN" },
    });
    if (existing) {
      return NextResponse.json({ ok: true, message: "Admin already exists" });
    }

    // Create admin account with PIN 8686
    const admin = await prisma.account.create({
      data: {
        id: randomUUID(),
        role: "ADMIN",
        name: "Eric Stlawrence",
        pinHash: hashPin("8686"),
        shopId: "default",
      },
    });

    return NextResponse.json({ ok: true, adminId: admin.id });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message.slice(0, 500) : "Unknown" },
      { status: 500 }
    );
  }
}
