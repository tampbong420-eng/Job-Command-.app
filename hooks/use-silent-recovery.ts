"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/diagnostics";

function post(message: string) {
  reportClientError(message);
  if (typeof navigator === "undefined" || !navigator.onLine) return;
  void fetch("/api/diagnostics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
    keepalive: true,
  }).catch(() => undefined);
}

function bundlerNoise(message: string) {
  return /webpack|__webpack_require__|options\.factory|Loading chunk|ChunkLoadError/i.test(message);
}

export function useSilentRecovery() {
  useEffect(() => {
    function onError(event: ErrorEvent) {
      const message = event.message || "script";
      if (bundlerNoise(message)) return;
      post(message);
    }
    function onReject(event: PromiseRejectionEvent) {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason || "unhandled");
      if (bundlerNoise(message)) return;
      post(message);
    }
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onReject);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onReject);
    };
  }, []);
}
