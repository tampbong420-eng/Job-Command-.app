import "server-only";

import { prisma } from "@/lib/prisma";

/** The shop's saved trade ("" for older shops = Painting). Feeds the co-pilot prompts. */
export async function shopIndustry(): Promise<string> {
  try {
    const row = await prisma.appSettings.findUnique({ where: { id: "default" }, select: { industry: true } });
    return row?.industry || "";
  } catch {
    return "";
  }
}
