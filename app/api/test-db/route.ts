import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (body.confirm !== "test-db-2026") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  try {
    // Use direct (non-pooler) connection for DDL
    const { PrismaClient } = await import("@prisma/client");
    const direct = new PrismaClient({
      datasources: {
        db: {
          url: "postgresql://neondb_owner:npg_10IilZheUArx@ep-nameless-rain-b82iq8uz.c-14.us-east-1.aws.neon.tech/neondb?sslmode=require",
        },
      },
    });
    await direct.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "_test" ("id" TEXT PRIMARY KEY)');
    const tables = await direct.$queryRawUnsafe(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    ) as { table_name: string }[];
    await direct.$executeRawUnsafe('DROP TABLE IF EXISTS "_test"');
    await direct.$disconnect();
    return NextResponse.json({ ok: true, tables: tables.map(t => t.table_name).slice(0, 20) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message.slice(0, 500) : "Unknown" },
      { status: 500 }
    );
  }
}
