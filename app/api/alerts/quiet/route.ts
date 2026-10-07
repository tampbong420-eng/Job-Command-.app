import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rejectRemovedLogin } from "@/lib/live-session";

export const dynamic = "force-dynamic";

function clock(value: unknown, fallback: string) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return fallback;
  const hours = String(Math.min(23, Number(match[1]))).padStart(2, "0");
  return `${hours}:${match[2]}`;
}

export async function POST(request: Request) {
  const removed = await rejectRemovedLogin();
  if (removed) return removed;
  const body = (await request.json().catch(() => ({}))) as { start?: string; end?: string };
  const quietStart = clock(body.start, "19:00");
  const quietEnd = clock(body.end, "07:00");
  await prisma.appSettings.upsert({
    where: { id: "default" },
    create: { id: "default", periodAnchor: new Date(), quietStart, quietEnd },
    update: { quietStart, quietEnd },
  });
  return NextResponse.json({ quietStart, quietEnd });
}
