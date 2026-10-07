import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLiveSession } from "@/lib/live-session";
import { can, ownsEmployee } from "@/lib/access";
import { crewInitials, pingIsStale, type CrewPingDTO } from "@/lib/crew-ping";

export const dynamic = "force-dynamic";

function toDTO(row: {
  employeeId: string;
  jobId: string | null;
  lat: number;
  lng: number;
  accuracy: number;
  at: Date;
  employee: { firstName: string; lastName: string; photoUrl: string | null };
}): CrewPingDTO {
  const name = `${row.employee.firstName} ${row.employee.lastName}`.trim();
  return {
    employeeId: row.employeeId,
    name,
    initials: crewInitials(name),
    photoUrl: row.employee.photoUrl,
    lat: row.lat,
    lng: row.lng,
    accuracy: row.accuracy,
    at: row.at.toISOString(),
    jobId: row.jobId,
    stale: pingIsStale(row.at),
  };
}

export async function GET(_request: Request) {
  const session = await getLiveSession();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const since = new Date(Date.now() - 30 * 60 * 1000);
  const rows = await prisma.crewPing.findMany({
    where:
      session.role === "CREW" && session.employeeId
        ? { at: { gte: since }, employeeId: session.employeeId }
        : { at: { gte: since } },
    include: { employee: { select: { firstName: true, lastName: true, photoUrl: true } } },
  });
  return NextResponse.json({ pings: rows.map(toDTO) });
}

export async function POST(request: Request) {
  const session = await getLiveSession();
  if (!can(session, "clock") || !session?.employeeId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    lat?: number;
    lng?: number;
    accuracy?: number;
    jobId?: string | null;
  };
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "Need a GPS fix." }, { status: 400 });
  }
  if (!ownsEmployee(session, session.employeeId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const jobId = body.jobId?.trim() || null;
  const row = await prisma.crewPing.upsert({
    where: { employeeId: session.employeeId },
    create: {
      employeeId: session.employeeId,
      jobId,
      lat,
      lng,
      accuracy: Math.max(0, Number(body.accuracy) || 0),
    },
    update: {
      jobId,
      lat,
      lng,
      accuracy: Math.max(0, Number(body.accuracy) || 0),
      at: new Date(),
    },
    include: { employee: { select: { firstName: true, lastName: true, photoUrl: true } } },
  });
  return NextResponse.json({ ping: toDTO(row) });
}
