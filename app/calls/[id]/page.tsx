import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getLiveSession } from "@/lib/live-session";
import { can } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SHOP_ID } from "@/lib/answering/config";
import { getCallCard, loadShopContext, readTranscript } from "@/lib/answering/store";
import { CallCardView } from "@/components/answering/CallCardView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Call Card · jobcommand.app" };

export default async function CallCardPage({ params }: { params: { id: string } }) {
  const session = await getLiveSession();
  if (!session || !can(session, "admin")) redirect("/");
  const card = await getCallCard(params.id, DEFAULT_SHOP_ID);
  if (!card) notFound();
  const [shop, job] = await Promise.all([
    loadShopContext(DEFAULT_SHOP_ID),
    card.jobId ? prisma.job.findUnique({ where: { id: card.jobId }, select: { id: true, code: true } }) : Promise.resolve(null),
  ]);
  return (
    <CallCardView
      timeZone={shop.timeZone}
      card={{
        id: card.id,
        callerName: card.callerName,
        callerPhone: card.callerPhone,
        fromNumber: card.fromNumber,
        outcome: card.outcome,
        mode: card.mode,
        address: card.address,
        jobType: card.jobType,
        details: card.details,
        preferredTime: card.preferredTime,
        urgency: card.urgency,
        summary: card.summary,
        transcript: readTranscript(card.transcript),
        recordingUrl: card.recordingUrl,
        durationSec: card.durationSec,
        bookedDate: card.bookedDate,
        bookedStart: card.bookedStart,
        bookedEnd: card.bookedEnd,
        createdAt: card.createdAt.toISOString(),
        reviewed: Boolean(card.reviewedAt),
        simulated: card.simulated,
        job: job ? { id: job.id, code: job.code } : null,
      }}
    />
  );
}
