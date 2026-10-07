"use client";

import { useEffect } from "react";
import { browserOnline } from "@/lib/offline/net";

export function useCrewBeacon(enabled: boolean, jobId?: string | null) {
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !navigator.geolocation) return;
    let last = 0;
    const watch = navigator.geolocation.watchPosition(
      (fix) => {
        const now = Date.now();
        if (now - last < 12_000) return;
        last = now;
        if (!browserOnline()) return;
        void fetch("/api/crew-ping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lat: fix.coords.latitude,
            lng: fix.coords.longitude,
            accuracy: fix.coords.accuracy,
            jobId: jobId || null,
          }),
        }).catch(() => undefined);
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 12_000 }
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [enabled, jobId]);
}
