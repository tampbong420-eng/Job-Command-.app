import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listAlerts, markAlertsRead, releaseHeldAlerts } from "@/lib/alerts";
import { ensureVapid } from "@/lib/push";
import { rejectRemovedLogin } from "@/lib/live-session";

export const dynamic = "force-dynamic";

export async function GET() {
  const removed = await rejectRemovedLogin();
  if (removed) return removed;
  const now = new Date();
  await releaseHeldAlerts(now);
  const [alerts, settings, vapid] = await Promise.all([
    listAlerts(now),
    prisma.appSettings.findUnique({ where: { id: "default" } }),
    ensureVapid(),
  ]);
  const live = alerts.filter((alert) => !alert.held);
  return NextResponse.json({
    alerts: live,
    held: alerts.filter((alert) => alert.held).length,
    unread: live.filter((alert) => !alert.readAt).length,
    quietStart: settings?.quietStart || "19:00",
    quietEnd: settings?.quietEnd || "07:00",
    vapidPublic: vapid.publicKey,
  });
}

export async function POST(request: Request) {
  const removed = await rejectRemovedLogin();
  if (removed) return removed;
  const body = (await request.json().catch(() => ({}))) as { ids?: string[]; all?: boolean };
  if (body.all) {
    await prisma.alert.updateMany({
      where: { readAt: null, OR: [{ heldUntil: null }, { heldUntil: { lte: new Date() } }] },
      data: { readAt: new Date() },
    });
  } else {
    await markAlertsRead(Array.isArray(body.ids) ? body.ids.filter(Boolean) : []);
  }
  return GET();
}
