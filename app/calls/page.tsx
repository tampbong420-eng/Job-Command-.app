import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getLiveSession } from "@/lib/live-session";
import { can } from "@/lib/access";
import { DEFAULT_SHOP_ID } from "@/lib/answering/config";
import { listCallCards, loadShopContext, minutesSummary } from "@/lib/answering/store";
import { CallList } from "@/components/answering/CallList";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Calls · jobcommand.app" };

export default async function CallsPage() {
  const session = await getLiveSession();
  if (!session || !can(session, "admin")) redirect("/");
  const [cards, shop, minutes] = await Promise.all([listCallCards(DEFAULT_SHOP_ID), loadShopContext(DEFAULT_SHOP_ID), minutesSummary(DEFAULT_SHOP_ID)]);
  return (
    <CallList
      timeZone={shop.timeZone}
      minutes={{ used: minutes.usedMinutes, cap: minutes.capMinutes }}
      cards={cards.map((c) => ({
        id: c.id,
        callerName: c.callerName,
        callerPhone: c.callerPhone,
        fromNumber: c.fromNumber,
        outcome: c.outcome,
        jobType: c.jobType,
        summary: c.summary,
        bookedDate: c.bookedDate,
        bookedStart: c.bookedStart,
        bookedEnd: c.bookedEnd,
        createdAt: c.createdAt.toISOString(),
        reviewed: Boolean(c.reviewedAt),
        simulated: c.simulated,
      }))}
    />
  );
}
