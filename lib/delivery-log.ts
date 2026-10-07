import type { DeliveryChannel, DeliveryEventDTO, DeliveryStatus, EstimateDTO } from "@/lib/types";

export const STATUS_RANK: Record<DeliveryStatus, number> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  opened: 3,
  viewed: 4,
  failed: 0,
};

export function pickChannels(
  contact: { email?: string | null; phone?: string | null },
  requested?: Array<"email" | "sms"> | null
): Array<"email" | "sms"> {
  const email = Boolean(contact.email?.trim());
  const phone = Boolean(contact.phone?.trim());
  const available: Array<"email" | "sms"> = [
    ...(email ? (["email"] as const) : []),
    ...(phone ? (["sms"] as const) : []),
  ];
  if (!requested?.length) return available;
  return requested.filter((channel) => available.includes(channel));
}

export function shouldAdvance(current: DeliveryStatus | null | undefined, next: DeliveryStatus) {
  if (!current) return true;
  if (next === "failed") return current !== "failed";
  if (current === "failed") return next !== "queued";
  return STATUS_RANK[next] >= STATUS_RANK[current];
}

export function mapResendType(type: string): DeliveryStatus | null {
  const key = type.trim().toLowerCase();
  if (key === "email.sent") return "sent";
  if (key === "email.delivered") return "delivered";
  if (key === "email.opened" || key === "email.clicked") return "opened";
  if (key === "email.bounced" || key === "email.complained" || key === "email.failed") return "failed";
  return null;
}

export function mapTwilioStatus(status: string): DeliveryStatus | null {
  const key = status.trim().toLowerCase();
  if (key === "queued" || key === "accepted" || key === "sending") return "queued";
  if (key === "sent") return "sent";
  if (key === "delivered") return "delivered";
  if (key === "undelivered" || key === "failed") return "failed";
  if (key === "read") return "opened";
  return null;
}

export function channelLabel(channel: string) {
  if (channel === "sms") return "Text";
  if (channel === "email") return "Email";
  if (channel === "link") return "Link";
  return channel;
}

export function statusLabel(status: string) {
  if (status === "queued") return "Queued";
  if (status === "sent") return "Sent";
  if (status === "delivered") return "Delivered";
  if (status === "opened") return "Opened";
  if (status === "viewed") return "Viewed";
  if (status === "failed") return "Failed";
  return status;
}

export function shortWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const hour = date.getHours();
  const minute = String(date.getMinutes()).padStart(2, "0");
  const ampm = hour >= 12 ? "p" : "a";
  return `${months[date.getMonth()]} ${date.getDate()} ${hour % 12 || 12}:${minute}${ampm}`;
}

export type TrailRow = {
  id: string;
  estimateId: string;
  number: string;
  channel: string;
  status: DeliveryStatus;
  createdAt: string;
  line: string;
};

export function collapseTrail(
  events: Array<{ id: string; estimateId: string; channel: string; status: string; createdAt: string; provider?: string }>,
  numbers: Record<string, string>
): TrailRow[] {
  const latest = new Map<string, (typeof events)[number]>();
  const ordered = [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  for (const event of ordered) {
    latest.set(`${event.estimateId}:${event.channel}`, event);
  }
  return [...latest.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    .map((event) => {
      const number = numbers[event.estimateId] || "Estimate";
      const when = shortWhen(event.createdAt);
      return {
        id: event.id,
        estimateId: event.estimateId,
        number,
        channel: event.channel,
        status: (event.status as DeliveryStatus) || "sent",
        createdAt: event.createdAt,
        line: [number, channelLabel(event.channel), event.provider === "mock" ? "Not sent (not connected yet)" : statusLabel(event.status), when]
          .filter(Boolean)
          .join(" · "),
      };
    });
}

export function trailFromEstimates(estimates: EstimateDTO[]): TrailRow[] {
  const numbers: Record<string, string> = {};
  const events: DeliveryEventDTO[] = [];
  for (const estimate of estimates) {
    numbers[estimate.id] = estimate.number;
    for (const event of estimate.deliveries || []) events.push(event);
  }
  return collapseTrail(events, numbers);
}

export function trailToggleLabel(rows: TrailRow[]) {
  if (!rows.length) return "";
  if (rows.length === 1) {
    const row = rows[0];
    return `${row.number} · ${statusLabel(row.status).toLowerCase()}`;
  }
  const viewed = rows.some((row) => row.status === "viewed" || row.status === "opened");
  return viewed ? `${rows.length} deliveries · viewed` : `${rows.length} deliveries on file`;
}

export function asChannel(value: string): DeliveryChannel {
  if (value === "sms" || value === "link") return value;
  return "email";
}

export function asStatus(value: string): DeliveryStatus {
  if (value === "queued" || value === "delivered" || value === "opened" || value === "viewed" || value === "failed") {
    return value;
  }
  return "sent";
}

export function deliveryDTO(row: {
  id: string;
  estimateId: string;
  customerId: string | null;
  channel: string;
  status: string;
  provider: string;
  toAddress: string;
  createdAt: Date | string;
}): DeliveryEventDTO {
  return {
    id: row.id,
    estimateId: row.estimateId,
    customerId: row.customerId,
    channel: asChannel(row.channel),
    status: asStatus(row.status),
    provider: row.provider,
    toAddress: row.toAddress,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  };
}
