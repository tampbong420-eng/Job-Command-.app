import { NextResponse } from "next/server";
import {
  clockEmployee,
  getEmployeeByToken,
  pingEmployeeLocation,
} from "@/lib/employees";
import { listJobsForEmployee } from "@/lib/jobs";

export const dynamic = "force-dynamic";

function coord(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const employee = getEmployeeByToken(token);
  if (!employee) {
    return NextResponse.json({ error: "Link is invalid" }, { status: 404 });
  }
  return NextResponse.json({
    employee,
    jobs: listJobsForEmployee(employee.id),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const employee = getEmployeeByToken(token);
  if (!employee) {
    return NextResponse.json({ error: "Link is invalid" }, { status: 404 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const lat = coord(body.lat ?? body.current_lat);
  const lng = coord(body.lng ?? body.current_lng);
  const action = typeof body.action === "string" ? body.action : "location";

  let next = employee;
  if (action === "clock_in") {
    next = clockEmployee(employee.id, true, { lat, lng }) ?? employee;
  } else if (action === "clock_out") {
    next = clockEmployee(employee.id, false) ?? employee;
  } else if (action === "location") {
    if (lat == null || lng == null) {
      return NextResponse.json(
        { error: "lat and lng are required" },
        { status: 400 },
      );
    }
    next = pingEmployeeLocation(employee.id, lat, lng) ?? employee;
  } else {
    return NextResponse.json(
      { error: `Unsupported action: ${action}` },
      { status: 400 },
    );
  }

  return NextResponse.json({
    employee: next,
    jobs: listJobsForEmployee(next.id),
  });
}
