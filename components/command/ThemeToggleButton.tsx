"use client";

import { flushSync } from "react-dom";
import { Moon, Sun } from "lucide-react";
import { useShellTheme } from "@/hooks/use-shell-theme";
import { useDeviceLook } from "@/components/command/DeviceLook";
import { writeDeviceLook } from "@/lib/device-look";

/** DARK|LIGHT toggle button (Eric, 2026-10-03). Lives under Edit on the job screen. */
export function ThemeToggleButton({ className = "" }: { className?: string }) {
  const { id, setId, look } = useShellTheme();
  const { accountKey } = useDeviceLook();

  const toggle = () => {
    const next = look === "light" ? "ink" : "light";
    writeDeviceLook(accountKey, next);
    if (next === id) return;
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (doc.startViewTransition && !calm) doc.startViewTransition(() => flushSync(() => setId(next)));
    else setId(next);
  };

  const Icon = look === "light" ? Moon : Sun;
  return (
    <button
      type="button"
      className={`theme-toggle-btn ${className}`}
      data-theme-toggle="1"
      aria-label={look === "light" ? "Switch to dark" : "Switch to light"}
      onClick={toggle}
    >
      <Icon className="size-5" aria-hidden="true" />
      <span>{look === "light" ? "Dark" : "Light"}</span>
    </button>
  );
}
