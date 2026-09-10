import { NextResponse } from "next/server";
import { deleteJob, getJob, updateJob } from "@/lib/jobs";

export const dynamic = "force-dynamic";

function optionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string") return value;
  return undefined;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  return NextResponse.json({ job });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getJob(id)) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const job = updateJob(id, {
    title: optionalString(body.title),
    status: optionalString(body.status) ?? undefined,
    assigned_employee_id: optionalString(body.assigned_employee_id),
    customer_name: optionalString(body.customer_name),
    customer_phone: optionalString(body.customer_phone),
    address: optionalString(body.address),
    street_view_url: optionalString(body.street_view_url),
    boss_notes: optionalString(body.boss_notes),
    required_supplies: optionalString(body.required_supplies),
  });

  return NextResponse.json({ job });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const removed = deleteJob(id);
  if (!removed) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
