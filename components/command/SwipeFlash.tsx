"use client";

import { useCallback, useEffect, useState } from "react";
import { SWIPE_FLASH_MS } from "@/lib/swipe-flash";

/** A brief orange label ("Next week →") after a left/right move. Never blocks taps. */
export function useSwipeFlash() {
  const [msg, setMsg] = useState<{ text: string; key: number } | null>(null);
  const flash = useCallback((text: string) => setMsg({ text, key: Date.now() }), []);
  useEffect(() => {
    if (!msg) return;
    const timer = window.setTimeout(() => setMsg(null), SWIPE_FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [msg]);
  const node = msg ? (
    <div key={msg.key} className="swipe-flash" role="status" aria-live="polite" data-swipe-flash="1">
      {msg.text}
    </div>
  ) : null;
  return { flash, node };
}
