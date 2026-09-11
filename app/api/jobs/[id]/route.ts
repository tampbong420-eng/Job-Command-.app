import { NextResponse } from "next/server";
import { deleteJob, getJob, runJob } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getJob(id)) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  let action = "run";
  try {
    const body = (await request.json()) as { action?: unknown };
    if (typeof body?.action === "string") action = body.action;
  } catch {
    // No body provided: default to "run".
  }

  if (action !== "run") {
    return NextResponse.json(
      { error: `Unsupported action: ${action}` },
      { status: 400 },
    );
  }

  const job = runJob(id);
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
