"use client";

import { flushSync } from "react-dom";
import { Moon, Sun } from "lucide-react";
import { useShellTheme } from "@/hooks/use-shell-theme";
import { useDeviceLook } from "@/components/command/DeviceLook";
import { PILL_LOOKS, writeDeviceLook } from "@/lib/device-look";
import type { ShellLookId } from "@/lib/shell-theme";
import s from "@/components/command/ThemeSwitch.module.css";

/**
 * DARK | LIGHT in the top bar (Option A v2). One tap flips this phone for this person; it is saved on the
 * phone (cookie) and survives reloads. It never changes the shop's App look in Settings.
 */
export function ThemeSwitch() {
  const { id, setId, look } = useShellTheme();
  const { accountKey } = useDeviceLook();

  const pick = (next: ShellLookId) => {
    writeDeviceLook(accountKey, next);
    if (next === id) return;
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (doc.startViewTransition && !calm) doc.startViewTransition(() => flushSync(() => setId(next)));
    else setId(next);
  };

  return (
    <div
      className={`${s.pill} ${look === "light" ? s.light : s.dark}`}
      role="group"
      aria-label={id === "auto" ? `Dark or light. Auto picked ${look === "light" ? "light" : "dark"}.` : "Dark or light"}
      data-theme-switch={look}
      data-theme-switch-auto={id === "auto" ? "1" : undefined}
    >
      {PILL_LOOKS.map((option) => {
        const on = look === option.id;
        const Icon = option.id === "ink" ? Moon : Sun;
        return (
          <button
            key={option.id}
            type="button"
            className={`${s.half}${on ? ` ${s.on}` : ""}`}
            aria-pressed={on}
            data-look={option.id}
            onClick={() => pick(option.id)}
          >
            <Icon aria-hidden="true" strokeWidth={2.5} />
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
