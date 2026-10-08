"use client";

import { useEffect, useState } from "react";
import { reportClientError, shouldAutoReset } from "@/lib/diagnostics";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Inline styles on purpose: the app shell (and its CSS) may be what failed.
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    reportClientError(error, error.digest);
    // Eric 2026-10-08: Always try to recover silently, don't show scary popup
    // The error is logged, user can continue working
    const frame = requestAnimationFrame(() => reset());
    return () => cancelAnimationFrame(frame);
  }, [error, reset]);

  return (
    <html lang="en" className="dark">
      <body
        style={{
          background: "#09090b",
          color: "#fafafa",
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        {stuck ? (
          <div style={{ textAlign: "center", padding: 24 }}>
            <p style={{ fontWeight: 700, margin: "0 0 8px" }}>Something didn&rsquo;t load.</p>
            <p style={{ margin: "0 0 16px", color: "#a1a1aa" }}>Your work is saved. Give it another shot.</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                background: "#b2ff00",
                color: "#0a0a0a",
                border: "none",
                borderRadius: 10,
                padding: "12px 24px",
                fontWeight: 800,
                fontSize: 16,
              }}
            >
              Reload
            </button>
          </div>
        ) : null}
      </body>
    </html>
  );
}
