import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

export function newPublicToken() {
  return randomBytes(24).toString("base64url");
}

export async function ensureEstimateToken(estimateId: string) {
  const current = await prisma.estimate.findUnique({
    where: { id: estimateId },
    select: { id: true, publicToken: true },
  });
  if (!current) throw new Error("Estimate not found.");
  if (current.publicToken) return current.publicToken;
  const token = newPublicToken();
  await prisma.estimate.update({
    where: { id: estimateId },
    data: { publicToken: token },
  });
  return token;
}
