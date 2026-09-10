import { NextResponse } from "next/server";
import {
  deleteEmployee,
  getEmployee,
  rotateEmployeeLink,
  updateEmployee,
} from "@/lib/employees";

export const dynamic = "force-dynamic";

function optionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string") return value;
  return undefined;
}

function optionalBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  return undefined;
}

function optionalCoord(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const employee = getEmployee(id);
  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }
  return NextResponse.json({ employee });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getEmployee(id)) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  if (body.action === "rotate_link") {
    return NextResponse.json({ employee: rotateEmployeeLink(id) });
  }

  const employee = updateEmployee(id, {
    name: optionalString(body.name) ?? undefined,
    role: optionalString(body.role),
    phone: optionalString(body.phone),
    is_on_clock: optionalBool(body.is_on_clock),
    current_lat: optionalCoord(body.current_lat),
    current_lng: optionalCoord(body.current_lng),
  });

  return NextResponse.json({ employee });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const removed = deleteEmployee(id);
  if (!removed) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
