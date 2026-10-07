import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLiveSession } from "@/lib/live-session";
import { cleanNativeToken, nativeEndpoint } from "@/lib/push-native-core";

export const dynamic = "force-dynamic";

/** The iPhone app registers its APNs device token here (signed-in phones only). */
export async function POST(request: Request) {
  const session = await getLiveSession();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { token?: string; platform?: string };
  const clean = cleanNativeToken(body.platform, body.token);
  if (!clean) return NextResponse.json({ error: "Bad device token." }, { status: 400 });
  const endpoint = nativeEndpoint(clean.platform, clean.token);
  // Role comes from the signed session, never from the request body.
  const role = session.role === "ADMIN" ? "office" : "crew";
  await prisma.pushDevice.upsert({
    where: { endpoint },
    create: { endpoint, p256dh: "native", auth: clean.platform, role },
    update: { role },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = await getLiveSession();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { token?: string; platform?: string };
  const clean = cleanNativeToken(body.platform, body.token);
  if (clean) await prisma.pushDevice.deleteMany({ where: { endpoint: nativeEndpoint(clean.platform, clean.token) } });
  return NextResponse.json({ ok: true });
}
