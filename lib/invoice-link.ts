import { newPublicToken } from "@/lib/estimate-link";
import { prisma } from "@/lib/prisma";

export async function ensureInvoiceToken(invoiceId: string) {
  const current = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, publicToken: true },
  });
  if (!current) throw new Error("Invoice not found.");
  if (current.publicToken) return current.publicToken;
  const token = newPublicToken();
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { publicToken: token },
  });
  return token;
}
