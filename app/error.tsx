"use client";

import { useEffect, useState } from "react";
import { reportClientError, shouldAutoReset } from "@/lib/diagnostics";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // A repeated error stops auto-resetting (diagnostics guard): show a way back
  // instead of a blank screen.
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    reportClientError(error, error.digest);
    if (!shouldAutoReset(error.digest || error.message)) {
      setStuck(true);
      return;
    }
    const frame = requestAnimationFrame(() => reset());
    return () => cancelAnimationFrame(frame);
  }, [error, reset]);

  if (!stuck) return <div className="app-shell theme-boss" aria-hidden />;

  return (
    <div className="app-shell theme-boss" data-error-fallback="1">
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          minHeight: "60dvh",
          textAlign: "center",
          padding: 24,
        }}
      >
        <p className="card-label">Something didn&rsquo;t load</p>
        <p>Your work is saved. Give it another shot.</p>
        <button
          type="button"
          className="ghost-action"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </div>
    </div>
  );
}
