"use client";

import { useEffect, useRef, useState } from "react";
import type { PackSuggestion } from "@/lib/proximity";

export function usePackedSlot(input: {
  destination: string;
  employeeId: string;
  jobId: string;
  enabled?: boolean;
}) {
  const [pack, setPack] = useState<{
    suggestion: PackSuggestion;
    faster: PackSuggestion | null;
    shop: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const stamp = useRef(0);

  useEffect(() => {
    const destination = input.destination.trim();
    if (!input.enabled || destination.length < 5 || !input.employeeId) {
      setPack(null);
      setError("");
      return;
    }
    const id = window.setTimeout(() => {
      const token = (stamp.current += 1);
      setLoading(true);
      fetch("/api/schedule/pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination,
          employeeId: input.employeeId,
          jobId: input.jobId,
        }),
      })
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Could not pack a slot.");
          return data as { suggestion: PackSuggestion; faster: PackSuggestion | null; shop: string };
        })
        .then((data) => {
          if (stamp.current === token) {
            setPack(data);
            setError("");
          }
        })
        .catch((err: unknown) => {
          if (stamp.current === token) {
            setPack(null);
            setError(err instanceof Error ? err.message : "Could not pack a slot.");
          }
        })
        .finally(() => {
          if (stamp.current === token) setLoading(false);
        });
    }, 420);
    return () => window.clearTimeout(id);
  }, [input.destination, input.employeeId, input.jobId, input.enabled]);

  return { pack, loading, error };
}
