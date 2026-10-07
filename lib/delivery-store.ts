import { prisma } from "@/lib/prisma";
import type { DeliveryResult } from "@/lib/delivery";
import { asChannel, asStatus, shouldAdvance } from "@/lib/delivery-log";
import type { DeliveryChannel, DeliveryStatus } from "@/lib/types";

export async function logDelivery(input: {
  estimateId: string;
  customerId?: string | null;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  provider: string;
  providerId?: string;
  toAddress?: string;
  actor?: string;
  createdAt?: Date;
}) {
  return prisma.deliveryEvent.create({
    data: {
      estimateId: input.estimateId,
      customerId: input.customerId ?? null,
      channel: input.channel,
      status: input.status,
      provider: input.provider,
      providerId: input.providerId || "",
      toAddress: input.toAddress || "",
      actor: input.actor || "",
      createdAt: input.createdAt,
    },
  });
}

export async function logChannelResult(input: {
  estimateId: string;
  customerId?: string | null;
  channel: "email" | "sms";
  result: DeliveryResult;
  toAddress: string;
  actor: string;
}) {
  const provider = input.result.mock ? "mock" : input.channel === "email" ? "resend" : "twilio";
  // Not connected (no key): logged as queued with provider "mock" and shown as "Not sent". Never a fake "delivered".
  const status: DeliveryStatus = input.result.mock ? "queued" : input.result.ok ? "sent" : "failed";
  await logDelivery({
    estimateId: input.estimateId,
    customerId: input.customerId,
    channel: input.channel,
    status,
    provider,
    providerId: input.result.id,
    toAddress: input.toAddress,
    actor: input.actor,
  });
}

export async function logEstimateViewed(input: { estimateId: string; customerId?: string | null }) {
  await logDelivery({
    estimateId: input.estimateId,
    customerId: input.customerId,
    channel: "link",
    status: "viewed",
    provider: "job-command",
    actor: "client",
  });
}

export async function applyProviderReceipt(input: {
  provider: "resend" | "twilio";
  providerId: string;
  status: DeliveryStatus;
}) {
  const id = input.providerId.trim();
  if (!id) return null;
  const last = await prisma.deliveryEvent.findFirst({
    where: { providerId: id },
    orderBy: { createdAt: "desc" },
  });
  if (!last) return null;
  if (!shouldAdvance(asStatus(last.status), input.status)) return last;
  return logDelivery({
    estimateId: last.estimateId,
    customerId: last.customerId,
    channel: asChannel(last.channel),
    status: input.status,
    provider: last.provider,
    providerId: last.providerId,
    toAddress: last.toAddress,
    actor: "provider",
  });
}
