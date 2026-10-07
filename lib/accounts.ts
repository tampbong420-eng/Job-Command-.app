import { prisma } from "@/lib/prisma";
import { UNSET_PIN_HASH } from "@/lib/pin";
import { newPublicToken } from "@/lib/estimate-link";
import type { GatePerson, SessionDTO } from "@/lib/types";
import { REMOVED_PIN_HASH, loginRemoved } from "@/lib/account-delete-core";

function randomInvite() {
  return newPublicToken();
}

export async function ensureAccounts() {
  const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
  const adminName =
    `${settings?.ownerFirstName || ""} ${settings?.ownerLastName || ""}`.trim() || "Office";
  const existingAdmin = await prisma.account.findFirst({
    where: { role: "ADMIN", employeeId: null },
  });
  if (!existingAdmin && settings?.setupComplete) {
    await prisma.account.create({
      data: {
        role: "ADMIN",
        name: adminName,
        // Never the owner phone (go-public B1). Setup saves the PIN the owner picked right after this.
        pinHash: UNSET_PIN_HASH,
      },
    });
  } else if (existingAdmin && settings?.setupComplete && existingAdmin.name !== adminName && adminName !== "Office") {
    await prisma.account.update({
      where: { id: existingAdmin.id },
      data: { name: adminName },
    });
  }

  const employees = await prisma.employee.findMany({ orderBy: [{ lastName: "asc" }, { firstName: "asc" }] });
  for (const employee of employees) {
    const exists = await prisma.account.findUnique({ where: { employeeId: employee.id } });
    if (exists) {
      // A login the person deleted stays gone: no new invite link, no PIN.
      if (loginRemoved(exists)) continue;
      if (!exists.inviteToken) {
        await prisma.account.update({
          where: { id: exists.id },
          data: { inviteToken: randomInvite() },
        });
      }
      continue;
    }
    await prisma.account.create({
      data: {
        role: "CREW",
        name: `${employee.firstName} ${employee.lastName}`.trim(),
        employeeId: employee.id,
        // Never the phone (go-public B1). The person picks it on their invite link.
        pinHash: UNSET_PIN_HASH,
        inviteToken: randomInvite(),
      },
    });
  }
}

export async function listGatePeople(): Promise<GatePerson[]> {
  await ensureAccounts();
  const rows = await prisma.account.findMany({
    where: { pinHash: { not: REMOVED_PIN_HASH } },
    include: { employee: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    role: row.role === "CREW" ? "CREW" : "ADMIN",
    photoUrl: row.employee?.photoUrl || null,
    title: row.role === "CREW" ? row.employee?.jobTitle || "Field" : "Office",
  }));
}

export function toSession(row: { id: string; role: string; name: string; employeeId: string | null; shopId?: string | null }): SessionDTO {
  return {
    accountId: row.id,
    role: row.role === "CREW" ? "CREW" : "ADMIN",
    name: row.name,
    employeeId: row.employeeId,
    shopId: row.shopId || "default",
  };
}
