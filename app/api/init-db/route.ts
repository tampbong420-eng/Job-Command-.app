import { NextResponse } from "next/server";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * ONE-TIME database initialization (Eric, 2026-10-04).
 * Pushes the Prisma schema to the fresh Neon database.
 * Delete this file after use.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (body.confirm !== "init-db-2026") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  try {
    const { prisma } = await import("@/lib/prisma");

    // Check if tables already exist
    const tables = await prisma.$queryRawUnsafe(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Account'"
    ) as { table_name: string }[];

    if (tables.length > 0) {
      return NextResponse.json({ ok: true, message: "Tables already exist" });
    }

    // Execute the pre-generated schema SQL as a single batch
    const sql = readFileSync(join(process.cwd(), "prisma", "init-schema.sql"), "utf8");
    // Remove comments and execute all at once (Postgres handles multiple statements)
    const cleanSql = sql
      .split("\n")
      .filter(line => !line.trim().startsWith("--"))
      .join("\n");
    await prisma.$executeRawUnsafe(cleanSql);

    return NextResponse.json({ ok: true, message: "Schema created" });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message.slice(0, 500) : "Unknown" },
      { status: 500 }
    );
  }
}
