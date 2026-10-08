"use client";

import { flushSync } from "react-dom";
import { Moon, Sun } from "lucide-react";
import { useShellTheme } from "@/hooks/use-shell-theme";
import { useDeviceLook } from "@/components/command/DeviceLook";
import { writeDeviceLook } from "@/lib/device-look";
import type { ShellThemeId } from "@/lib/shell-theme";

/** Skin cycle button (Eric, 2026-10-07). Lives under Edit on the job screen. Tap cycles through all skins. */
const SKIN_CYCLE: ShellThemeId[] = ["ink", "light", "midnight", "ember", "sage"];
const SKIN_LABELS: Record<string, string> = {
  ink: "Lime Industrial",
  light: "Light",
  midnight: "Midnight",
  ember: "Ember",
  sage: "Sage",
};

export function ThemeToggleButton({ className = "" }: { className?: string }) {
  const { id, setId, look } = useShellTheme();
  const { accountKey } = useDeviceLook();

  const cycle = () => {
    const currentId = id === "auto" ? look : id;
    const currentIdx = SKIN_CYCLE.indexOf(currentId as ShellThemeId);
    const next: ShellThemeId = SKIN_CYCLE[(currentIdx + 1) % SKIN_CYCLE.length];
    writeDeviceLook(accountKey, next);
    if (next === id) return;
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (doc.startViewTransition && !calm) doc.startViewTransition(() => flushSync(() => setId(next)));
    else setId(next);
  };

  const currentLabel = SKIN_LABELS[id === "auto" ? look : id] || id;
  const Icon = look === "light" ? Moon : Sun;
  return (
    <button
      type="button"
      className={`theme-toggle-btn ${className}`}
      data-theme-toggle="1"
      aria-label={`Skin: ${currentLabel}. Tap for next skin.`}
      onClick={cycle}
    >
      <Icon className="size-5" aria-hidden="true" />
      <span>{currentLabel}</span>
    </button>
  );
}
