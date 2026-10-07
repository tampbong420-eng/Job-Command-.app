import { getLiveSession } from "@/lib/live-session";
import { isAdmin } from "@/lib/access";
import { prisma } from "@/lib/prisma";

/**
 * Go-public: Office › Records data (receipts, shop-wide customers/invoices/materials) is office/boss only on the
 * SERVER, not just hidden in the UI. Crew get 403 even if they type the URL. Returns null when allowed.
 */
export async function officeOnlyApi(): Promise<Response | null> {
  const session = await getLiveSession();
  if (!session) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!isAdmin(session)) return Response.json({ error: "Office only." }, { status: 403 });
  return null;
}

/** Office, or the owner during first-run setup (no office login yet, or setup not finished). */
export async function setupOrOfficeApi(): Promise<Response | null> {
  const session = await getLiveSession();
  if (isAdmin(session)) return null;
  const admin = await prisma.account.findFirst({ where: { role: "ADMIN" } });
  if (!admin) return null;
  const row = await prisma.appSettings.findUnique({ where: { id: "default" } });
  if (!(row?.setupComplete && row.businessName)) return null;
  return Response.json({ error: session ? "Office only." : "Sign in first." }, { status: session ? 403 : 401 });
}
