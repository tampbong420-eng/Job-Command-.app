import "server-only";

import { prisma } from "@/lib/prisma";
import { sendEmail, sendSms, type DeliveryResult } from "@/lib/delivery";
import { logChannelResult } from "@/lib/delivery-store";
import { pickChannels } from "@/lib/delivery-log";
import { estimateMessage } from "@/lib/estimate-copy";
import { ensureEstimateToken } from "@/lib/estimate-link";
import { quoteUrl } from "@/lib/origin";
import { BRAND, documentTotals, type LineKind } from "@/lib/documents";
import { money } from "@/lib/format";
import { loadPayrollSettings } from "@/lib/queries";
import { shopPlace } from "@/lib/shop-brand";

export type SendEstimateResult = {
  estimateId: string;
  url: string;
  email: DeliveryResult | null;
  sms: DeliveryResult | null;
};

export async function deliverEstimate(input: {
  estimateId: string;
  actor: string;
  channels?: Array<"email" | "sms"> | null;
  origin: string;
}): Promise<SendEstimateResult> {
  const estimate = await prisma.estimate.findUnique({
    where: { id: input.estimateId },
    include: { job: true, customer: true, lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!estimate) throw new Error("Estimate not found.");
  const settings = await loadPayrollSettings();
  const company = settings.businessName.trim() || BRAND.tradeName;
  const token = await ensureEstimateToken(estimate.id);
  const url = quoteUrl(input.origin, token);
  const who = estimate.customer?.name || estimate.job.client;
  const totals = documentTotals(
    estimate.lines.map((line) => ({
      ...line,
      kind: (line.kind === "LABOR" || line.kind === "MATERIAL" ? line.kind : "OTHER") as LineKind,
    })),
    estimate.taxRate
  );
  const copy = estimateMessage({
    who,
    company,
    jobName: estimate.job.name,
    site: estimate.job.address || estimate.customer?.address,
    total: money(totals.total),
    url,
    place: shopPlace(settings.businessAddress),
  });

  const emailTo = estimate.customer?.email?.trim() || "";
  const phoneTo = estimate.customer?.phone?.trim() || "";
  const channels = pickChannels({ email: emailTo, phone: phoneTo }, input.channels);
  if (!channels.length) throw new Error("Add a phone or email on the client to send.");

  const wantEmail = channels.includes("email");
  const wantSms = channels.includes("sms");
  const statusCallback = `${input.origin.replace(/\/$/, "")}/api/webhooks/twilio`;

  const [email, sms] = await Promise.all([
    wantEmail ? sendEmail({ to: emailTo, subject: copy.subject, text: copy.text, html: copy.html }) : Promise.resolve(null),
    wantSms ? sendSms({ to: phoneTo, body: copy.sms, statusCallback }) : Promise.resolve(null),
  ]);

  if (email) {
    await logChannelResult({
      estimateId: estimate.id,
      customerId: estimate.customerId,
      channel: "email",
      result: email,
      toAddress: emailTo,
      actor: input.actor,
    });
  }
  if (sms) {
    await logChannelResult({
      estimateId: estimate.id,
      customerId: estimate.customerId,
      channel: "sms",
      result: sms,
      toAddress: phoneTo,
      actor: input.actor,
    });
  }

  const delivered = Boolean(email?.ok || sms?.ok);
  if (delivered) {
    const now = new Date();
    const nextStatus = estimate.status === "ACCEPTED" ? "ACCEPTED" : "SENT";
    await prisma.estimate.update({
      where: { id: estimate.id },
      data: {
        status: nextStatus,
        sentAt: now,
        viewedAt: nextStatus === "ACCEPTED" ? estimate.viewedAt : null,
        sentEmail: estimate.sentEmail || Boolean(email?.ok),
        sentSms: estimate.sentSms || Boolean(sms?.ok),
        lastFollowUpAt: null,
        followUpCount: 0,
      },
    });
  }

  if (email && !email.ok) throw new Error(email.error || "Email failed.");
  if (sms && !sms.ok) throw new Error(sms.error || "Text failed.");
  return { estimateId: estimate.id, url, email, sms };
}
