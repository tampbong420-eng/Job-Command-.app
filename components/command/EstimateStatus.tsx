"use client";

import { estimateStatusLabel, type EstimateStatus } from "@/lib/estimate-status";

export function EstimateStatusBar({
  number,
  status,
  viewedAt,
  signedName,
  clientNote,
  followUpCount,
}: {
  number?: string;
  status: EstimateStatus;
  viewedAt?: string | null;
  signedName?: string;
  clientNote?: string;
  followUpCount?: number;
}) {
  if (status === "DRAFT") return null;
  return (
    <section className={`est-status-bar ${status.toLowerCase()}`}>
      <p className="card-label">{number ? `Client estimate ${number}` : "Client estimate"}</p>
      <b>{estimateStatusLabel(status)}</b>
      {status === "VIEWED" && viewedAt ? <span>Opened. Waiting on a signature.</span> : null}
      {status === "SENT" ? <span>Sent. Nudge goes out if they don’t open it in 24 hours.</span> : null}
      {status === "ACCEPTED" && signedName ? <span>Signed by {signedName}.</span> : null}
      {status === "CHANGES" && clientNote ? <span>{clientNote}</span> : null}
      {followUpCount ? <small>{followUpCount} auto follow-up{followUpCount === 1 ? "" : "s"} sent.</small> : null}
    </section>
  );
}
