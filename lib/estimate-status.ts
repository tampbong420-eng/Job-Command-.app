export type EstimateStatus = "DRAFT" | "SENT" | "VIEWED" | "ACCEPTED" | "CHANGES";

export function parseEstimateStatus(value: string | null | undefined): EstimateStatus {
  if (value === "SENT" || value === "VIEWED" || value === "ACCEPTED" || value === "CHANGES") return value;
  return "DRAFT";
}

export function estimateStatusLabel(status: EstimateStatus) {
  if (status === "SENT") return "Estimate sent";
  if (status === "VIEWED") return "Opened — waiting signature";
  if (status === "ACCEPTED") return "Approved";
  if (status === "CHANGES") return "Changes requested";
  return "Draft";
}

export function estimateWasSent(status: EstimateStatus, sentAt?: string | null) {
  return Boolean(sentAt) || status === "SENT" || status === "VIEWED" || status === "ACCEPTED" || status === "CHANGES";
}
