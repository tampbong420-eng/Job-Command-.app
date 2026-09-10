import { NextResponse } from "next/server";
import { createJob, listJobs } from "@/lib/store";

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

  const { name, command } = (body ?? {}) as {
    name?: unknown;
    command?: unknown;
  };

  if (typeof name !== "string" || name.trim() === "") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (typeof command !== "string" || command.trim() === "") {
    return NextResponse.json({ error: "command is required" }, { status: 400 });
  }

  const job = createJob(name.trim(), command.trim());
  return NextResponse.json({ job }, { status: 201 });
}
