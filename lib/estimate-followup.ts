import { prisma } from "@/lib/prisma";
import { emailConnected, sendEmail, sendSms, smsConnected } from "@/lib/delivery";
import { logChannelResult } from "@/lib/delivery-store";
import { quoteUrl } from "@/lib/origin";
import { BRAND } from "@/lib/documents";
import { estimateMessage } from "@/lib/estimate-copy";
import { shopPlace } from "@/lib/shop-brand";

const DAY = 24 * 60 * 60 * 1000;

export async function runEstimateFollowUps(origin: string, now = new Date()) {
  // Go-public B4: with no email/text keys nothing would leave, so don't pretend to follow up.
  const canEmail = emailConnected();
  const canText = smsConnected();
  if (!canEmail && !canText) return [] as { id: string; kind: "unviewed" | "unsigned" }[];
  const open = await prisma.estimate.findMany({
    where: {
      sentAt: { not: null },
      status: { in: ["SENT", "VIEWED"] },
      followUpCount: { lt: 2 },
    },
    include: { job: true, customer: true },
  });

  const sent: { id: string; kind: "unviewed" | "unsigned" }[] = [];
  for (const estimate of open) {
    if (!estimate.sentAt) continue;
    const last = estimate.lastFollowUpAt?.getTime() || 0;
    if (last && now.getTime() - last < DAY) continue;
    const age = now.getTime() - estimate.sentAt.getTime();
    const unviewed = !estimate.viewedAt && age >= DAY;
    const unsigned = Boolean(estimate.viewedAt) && estimate.status !== "ACCEPTED" && age >= 2 * DAY;
    if (!unviewed && !unsigned) continue;

    const shop = await shopNameAndPlace();
    const company = shop.name || BRAND.tradeName;
    const token = estimate.publicToken;
    if (!token) continue;
    const url = quoteUrl(origin, token);
    const who = estimate.customer?.name || estimate.job.client;
    const kind = unviewed ? "unviewed" : "unsigned";
    const copy = estimateMessage({
      who,
      company,
      jobName: estimate.job.name,
      url,
      followUp: kind,
      place: shop.place,
    });
    const emailTo = canEmail ? estimate.customer?.email?.trim() : "";
    const phoneTo = canText ? estimate.customer?.phone?.trim() : "";
    if (!emailTo && !phoneTo) continue;
    if (emailTo) {
      const email = await sendEmail({ to: emailTo, subject: copy.subject, text: copy.text, html: copy.html });
      await logChannelResult({
        estimateId: estimate.id,
        customerId: estimate.customerId,
        channel: "email",
        result: email,
        toAddress: emailTo,
        actor: "Job Command",
      });
    }
    if (phoneTo) {
      const sms = await sendSms({
        to: phoneTo,
        body: copy.sms,
        statusCallback: `${origin.replace(/\/$/, "")}/api/webhooks/twilio`,
      });
      await logChannelResult({
        estimateId: estimate.id,
        customerId: estimate.customerId,
        channel: "sms",
        result: sms,
        toAddress: phoneTo,
        actor: "Job Command",
      });
    }
    await prisma.estimate.update({
      where: { id: estimate.id },
      data: {
        lastFollowUpAt: now,
        followUpCount: { increment: 1 },
      },
    });
    await prisma.auditLog.create({
      data: {
        actor: "Job Command",
        action: kind === "unviewed" ? "Follow-up: estimate unviewed" : "Follow-up: estimate unsigned",
        field: "estimate",
        newValue: estimate.id,
      },
    });
    sent.push({ id: estimate.id, kind });
  }
  return sent;
}

async function shopNameAndPlace() {
  const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
  return { name: settings?.businessName.trim() || "", place: shopPlace(settings?.businessAddress) };
}
