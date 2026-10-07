import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { inShopOfToken } from "@/lib/shop-of";
import { getLiveSession } from "@/lib/live-session";
import { AccessGate } from "@/components/command/AccessGate";
import { BrandLockup } from "@/components/command/BrandLockup";
import { EmployeeOnboard } from "@/components/command/EmployeeOnboard";
import { loadPayrollSettings } from "@/lib/queries";
import type { GatePerson } from "@/lib/types";

export const dynamic = "force-dynamic";

async function CrewJoinPageInShop({ params }: { params: { token: string } }) {
  const token = params.token?.trim();
  if (!token) notFound();
  const account = await prisma.account.findUnique({
    where: { inviteToken: token },
    include: { employee: true },
  });
  if (!account || account.role !== "CREW" || !account.employee) notFound();
  const session = await getLiveSession();
  if (session?.accountId === account.id && account.employee.onboardedAt) redirect("/?tab=crew");
  const settings = await loadPayrollSettings();
  const person: GatePerson = {
    id: account.id,
    name: account.name,
    role: "CREW",
    photoUrl: account.employee.photoUrl,
    title: account.employee.jobTitle || "Field",
  };
  const needsOnboard = !account.employee.onboardedAt;
  return (
    <main className="app-shell theme-boss">
      <div className="grain" />
      <header className="topbar">
        <BrandLockup settings={settings} />
      </header>
      <section className="page">
        {needsOnboard ? (
          <EmployeeOnboard
            token={token}
            firstName={account.employee.firstName}
            shop={settings.businessName}
          />
        ) : (
          <>
            <p className="card-label">Field phone</p>
            <AccessGate people={[person]} shop={settings.businessName} shopId={account.shopId} />
          </>
        )}
      </section>
    </main>
  );
}

// Signed-out public link: read everything from the shop that owns the link (multi-shop B2).
export default async function CrewJoinPage(props: { params: { token: string } }) {
  return inShopOfToken("invite", props.params?.token, () => CrewJoinPageInShop(props));
}
