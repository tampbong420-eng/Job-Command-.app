"use client";

import { useCallback, useEffect, useState } from "react";
import { browserOnline } from "@/lib/offline/net";
import type { AlertDTO } from "@/lib/alert-core";

export type AlertFeed = {
  alerts: AlertDTO[];
  unread: number;
  held: number;
  quietStart: string;
  quietEnd: string;
  vapidPublic: string;
};

const empty: AlertFeed = {
  alerts: [],
  unread: 0,
  held: 0,
  quietStart: "19:00",
  quietEnd: "07:00",
  vapidPublic: "",
};

export function useAlerts() {
  const [feed, setFeed] = useState<AlertFeed>(empty);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!browserOnline()) return;
    try {
      const response = await fetch("/api/alerts", { cache: "no-store" });
      if (!response.ok) return;
      const next = (await response.json()) as AlertFeed;
      setFeed({
        alerts: next.alerts || [],
        unread: next.unread || 0,
        held: next.held || 0,
        quietStart: next.quietStart || "19:00",
        quietEnd: next.quietEnd || "07:00",
        vapidPublic: next.vapidPublic || "",
      });
    } catch {
      /* keep last feed */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 6000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener("job-command-synced", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("job-command-synced", onFocus);
    };
  }, [refresh]);

  return { ...feed, open, setOpen, refresh };
}
