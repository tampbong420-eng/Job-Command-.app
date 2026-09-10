import { NextResponse } from "next/server";
import { createEmployee, listEmployees } from "@/lib/employees";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ employees: listEmployees() });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, role, phone } = (body ?? {}) as {
    name?: unknown;
    role?: unknown;
    phone?: unknown;
  };

  if (typeof name !== "string" || name.trim() === "") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const employee = createEmployee({
    name,
    role: typeof role === "string" ? role : null,
    phone: typeof phone === "string" ? phone : null,
  });

  return NextResponse.json({ employee }, { status: 201 });
}
