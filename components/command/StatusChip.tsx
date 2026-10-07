"use client";

import { cn } from "@/lib/utils";
import { STATUS_LABEL, type EntryStatus } from "@/lib/types";

const TONE: Record<EntryStatus, string> = {
  SCHEDULED: "off",
  IN_PROGRESS: "active",
  COMPLETE: "done",
  EARLY_CLOCK_OUT: "warn",
  INCOMPLETE: "warn",
  MISSED: "off",
};

export function StatusChip({
  status,
  className,
}: {
  status: EntryStatus;
  className?: string;
}) {
  return (
    <span className={cn("status-pill", TONE[status], className)}>
      <span className="status-dot" />
      {STATUS_LABEL[status]}
    </span>
  );
}
