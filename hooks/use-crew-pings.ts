"use client";

import { useEffect, useState } from "react";
import { browserOnline } from "@/lib/offline/net";
import type { CrewPingDTO } from "@/lib/crew-ping";

export function useCrewPings(jobId?: string | null) {
  const [pings, setPings] = useState<CrewPingDTO[]>([]);

  useEffect(() => {
    let live = true;
    async function pull() {
      if (!browserOnline()) return;
      const query = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
      try {
        const response = await fetch(`/api/crew-ping${query}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { pings?: CrewPingDTO[] };
        if (live) setPings(payload.pings || []);
      } catch {
        /* keep last pings */
      }
    }
    void pull();
    const timer = window.setInterval(() => void pull(), 8000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [jobId]);

  return pings;
}
