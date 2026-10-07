"use client";

import { useEffect } from "react";

/**
 * Auto-focus the first text input when a page/form mounts (Eric, 2026-10-03).
 * No tapping needed — just start typing.
 * 
 * Usage: Call in a page component that has a form.
 * The hook finds the first visible, enabled text input and focuses it.
 */
export function useAutofocusFirstInput(enabled: boolean = true, key?: string | number) {
  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => {
      const input = document.querySelector(
        'main input:not([type="hidden"]):not([disabled]), ' +
        '.page input:not([type="hidden"]):not([disabled]), ' +
        'form input:not([type="hidden"]):not([disabled])'
      ) as HTMLElement | null;
      // Only focus if it's actually visible.
      if (input && input.offsetParent !== null) {
        input.focus({ preventScroll: true });
      }
    }, 200);
    return () => clearTimeout(t);
  }, [enabled, key]);
}
