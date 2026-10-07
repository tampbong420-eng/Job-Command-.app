"use client";

import { useEffect, useState } from "react";
import { PIN_GATE_ENABLED } from "@/lib/pin-gate";

/**
 * Runtime PIN gate status. Checks the database flag via API,
 * falling back to the build-time constant if the API is unavailable.
 * Returns: { enabled: boolean, loading: boolean }
 */
export function usePinGateStatus() {
  const [enabled, setEnabled] = useState(PIN_GATE_ENABLED);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Use /api/session (public) to get PIN gate status
        const res = await fetch("/api/session", { method: "GET" });
        if (!res.ok) throw new Error("API failed");
        const data = await res.json();
        if (!cancelled && typeof data.pinGateDisabled === "boolean") {
          // DB flag overrides build-time constant
          // If DB says disabled, gate is off. If DB says enabled, use build-time.
          setEnabled(data.pinGateDisabled ? false : PIN_GATE_ENABLED);
        }
      } catch {
        // Keep build-time default on error
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { enabled, loading };
}
