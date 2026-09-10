import { NextResponse } from "next/server";
import { createJob, listJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ jobs: listJobs() });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const input = (body ?? {}) as Record<string, unknown>;
  const customerName =
    typeof input.customer_name === "string" ? input.customer_name : "";
  if (!customerName.trim()) {
    return NextResponse.json(
      { error: "customer_name is required" },
      { status: 400 },
    );
  }

  const job = createJob({
    title: typeof input.title === "string" ? input.title : null,
    assigned_employee_id:
      typeof input.assigned_employee_id === "string"
        ? input.assigned_employee_id
        : null,
    customer_name: customerName,
    customer_phone:
      typeof input.customer_phone === "string" ? input.customer_phone : null,
    address: typeof input.address === "string" ? input.address : null,
    street_view_url:
      typeof input.street_view_url === "string" ? input.street_view_url : null,
    boss_notes: typeof input.boss_notes === "string" ? input.boss_notes : null,
    required_supplies:
      typeof input.required_supplies === "string"
        ? input.required_supplies
        : null,
  });

  return NextResponse.json({ job }, { status: 201 });
}
