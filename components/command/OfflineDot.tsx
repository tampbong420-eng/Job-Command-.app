"use client";

import { useOffline } from "@/hooks/use-offline";

export function OfflineDot() {
  const { status, pending } = useOffline();
  const mode = status === "offline" ? "offline" : status === "syncing" ? "syncing" : pending ? "queued" : "online";
  const label =
    mode === "offline"
      ? "Working offline"
      : mode === "syncing"
        ? "Syncing to shop"
        : mode === "queued"
          ? `${pending} change${pending === 1 ? "" : "s"} waiting to sync`
          : "Online";

  return <span className={`net-dot ${mode}`} title={label} aria-label={label} role="status" />;
}
