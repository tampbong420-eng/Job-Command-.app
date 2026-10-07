import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPin } from "@/lib/pin";

/**
 * ONE-TIME setup (Eric, 2026-10-04):
 * - Admin PIN → 8686
 * - Creates guest account with PIN 0101 (CREW role, full app access, not admin)
 * Hit once via POST, then DELETE this file and remove from middleware PUBLIC.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (body.confirm !== "setup-codes-2026") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  try {
    const adminHash = hashPin("8686");
    const guestHash = hashPin("0101");

    // Update all admin accounts to 8686.
    const admins = await prisma.account.updateMany({
      where: { role: "ADMIN" },
      data: { pinHash: adminHash },
    });

    // Create or update the guest account.
    const existingGuest = await prisma.account.findFirst({
      where: { name: "Guest" },
    });
    let guest;
    if (existingGuest) {
      guest = await prisma.account.update({
        where: { id: existingGuest.id },
        data: { pinHash: guestHash, role: "CREW" },
      });
    } else {
      guest = await prisma.account.create({
        data: {
          name: "Guest",
          role: "CREW",
          pinHash: guestHash,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      adminsUpdated: admins.count,
      guestId: guest.id,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    );
  }
}
