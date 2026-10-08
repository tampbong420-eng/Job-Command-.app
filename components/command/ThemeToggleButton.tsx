"use client";

import { flushSync } from "react-dom";
import type { MouseEvent as ReactMouseEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { Moon, Sun } from "lucide-react";
import { useShellTheme } from "@/hooks/use-shell-theme";
import { useDeviceLook } from "@/components/command/DeviceLook";
import { writeDeviceLook } from "@/lib/device-look";
import type { ShellThemeId } from "@/lib/shell-theme";
import { DARK_TYPE_INKS, LIGHT_TYPE_INKS } from "@/lib/shell-ink";

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
  const { id, setId, look, ink, setInk } = useShellTheme();
  const { accountKey } = useDeviceLook();
  // Current text color dot (Eric 2026-10-07) - tappable to cycle text colors
  const isLight = look === "light";
  const inks = isLight ? LIGHT_TYPE_INKS : DARK_TYPE_INKS;
  const currentInkId = isLight ? ink?.light : ink?.dark;
  const currentInk = inks.find((i) => i.id === currentInkId);
  const dotColor = currentInk?.color || (isLight ? "#111111" : "#b2ff00");
  const cycleInk = (e: ReactMouseEvent) => {
    e.stopPropagation();
    const currentIdx = inks.findIndex((i) => i.id === currentInkId);
    const next = inks[(currentIdx + 1) % inks.length];
    if (isLight) {
      setInk({ dark: ink?.dark || "", light: next.id as any });
    } else {
      setInk({ dark: next.id as any, light: ink?.light || "" });
    }
  };

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
      <span
        role="button"
        tabIndex={0}
        aria-label="Change text color"
        onClick={cycleInk}
        onKeyDown={(e: ReactKeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); cycleInk(e as any); } }}
        style={{
          width: "28px",
          height: "28px",
          borderRadius: "6px",
          background: dotColor,
          border: "2px solid rgba(0,0,0,0.4)",
          flexShrink: 0,
          cursor: "pointer",
          display: "inline-block",
        }}
      />
    </button>
  );
}
