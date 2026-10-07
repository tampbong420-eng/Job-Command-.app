"use client";

import { useEffect } from "react";

type ShieldPlugin = {
  enable?: () => Promise<void> | void;
  disable?: () => Promise<void> | void;
};

function plugin(): ShieldPlugin | null {
  if (typeof window === "undefined") return null;
  const cap = (window as Window & { Capacitor?: { Plugins?: { ScreenShield?: ShieldPlugin } } }).Capacitor;
  return cap?.Plugins?.ScreenShield || null;
}

/** No-op in Chrome/Safari. In a Capacitor wrap this turns on FLAG_SECURE / iOS cover. */
export function ScreenShield() {
  useEffect(() => {
    const shield = plugin();
    if (!shield?.enable) return;
    void shield.enable();
    return () => {
      void shield.disable?.();
    };
  }, []);
  return null;
}
