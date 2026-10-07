import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rejectRemovedLogin } from "@/lib/live-session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const removed = await rejectRemovedLogin();
  if (removed) return removed;
  const body = (await request.json().catch(() => ({}))) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    role?: string;
  };
  const endpoint = String(body.endpoint || "").trim();
  const p256dh = String(body.keys?.p256dh || "").trim();
  const auth = String(body.keys?.auth || "").trim();
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Subscription is incomplete." }, { status: 400 });
  }
  const role = body.role === "crew" ? "crew" : "office";
  await prisma.pushDevice.upsert({
    where: { endpoint },
    create: { endpoint, p256dh, auth, role },
    update: { p256dh, auth, role },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const removed = await rejectRemovedLogin();
  if (removed) return removed;
  const body = (await request.json().catch(() => ({}))) as { endpoint?: string };
  const endpoint = String(body.endpoint || "").trim();
  if (endpoint) {
    await prisma.pushDevice.deleteMany({ where: { endpoint } });
  }
  return NextResponse.json({ ok: true });
}
