"use client";

import { useEffect } from "react";
import { startOfflineSync } from "@/lib/offline/sync";
import { queueCount } from "@/lib/offline/queue";

export function ServiceWorkerRegister() {
  useEffect(() => {
    startOfflineSync();
    void queueCount();
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      void navigator.serviceWorker.register("/sw.js?v=29", { scope: "/" }).catch(() => undefined);
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
