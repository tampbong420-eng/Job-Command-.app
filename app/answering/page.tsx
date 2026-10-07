import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getLiveSession } from "@/lib/live-session";
import { can } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SHOP_ID } from "@/lib/answering/config";
import { getAnsweringSettings, loadShopContext, minutesSummary, resolveEstimator } from "@/lib/answering/store";
import { retellStatus } from "@/lib/answering/retell-client";
import { AnsweringSetup } from "@/components/answering/AnsweringSetup";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "AI Answering · jobcommand.app" };

export default async function AnsweringPage() {
  const session = await getLiveSession();
  if (!session || !can(session, "admin")) redirect("/");
  const shopId = DEFAULT_SHOP_ID;
  const [settings, shop, minutes, people, newCalls] = await Promise.all([
    getAnsweringSettings(shopId),
    loadShopContext(shopId),
    minutesSummary(shopId),
    prisma.employee.findMany({
      where: { employmentStatus: { in: ["ACTIVE", "TEMPORARY"] } },
      orderBy: { createdAt: "asc" },
      select: { id: true, firstName: true, lastName: true, jobTitle: true },
    }),
    prisma.callCard.count({ where: { shopId, reviewedAt: null, status: { not: "ringing" }, outcome: { not: "SPAM" } } }),
  ]);
  const estimator = await resolveEstimator(settings.estimatorId);
  const status = retellStatus();
  return (
    <AnsweringSetup
      shopName={shop.agent.shopName}
      shopPhone={shop.companyPhone || shop.ownerPhone}
      hoursLine={shop.agent.hoursLine}
      addonActive={shop.addonActive}
      retellKeySet={status.connected}
      connected={Boolean(status.connected && settings.connectedAt && settings.retellAgentId)}
      settings={{
        enabled: settings.enabled,
        voice: settings.voice === "female" ? "female" : "male",
        estimatorId: estimator?.id || "",
        estimateMinutes: settings.estimateMinutes,
        bufferMinutes: settings.bufferMinutes,
        retellNumber: settings.retellNumber,
      }}
      people={people.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`.trim(), title: p.jobTitle }))}
      minutes={{ used: minutes.usedMinutes, cap: minutes.capMinutes, percent: minutes.percent, overCap: minutes.overCap, calls: minutes.calls, month: minutes.month }}
      newCalls={newCalls}
    />
  );
}
