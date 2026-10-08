"use client";

import type { CSSProperties } from "react";
import type { HomeLayoutItem } from "@/lib/home-apps";

/**
 * "Make an app" button — lives in the top-right corner of profiles/pages.
 * (Eric 2026-10-08: "in the same spot every time, like in the top right hand corner")
 *
 * Tap it and whatever you're looking at (employee, job, customer…)
 * becomes an app on your home screen.
 * Inline styles only.
 */

interface MakeAppButtonProps {
  /** What this button will pin: "job" | "employee" | "customer" | "custom" */
  kind: HomeLayoutItem["kind"];
  /** id of the thing (job id, employee id…) */
  refId: string;
  /** display title for the home-screen tile */
  title: string;
  /** emoji for the tile */
  emoji?: string;
  onMakeApp: (item: HomeLayoutItem) => void;
}

const LIME = "#a3e635";

export function MakeAppButton({ kind, refId, title, emoji, onMakeApp }: MakeAppButtonProps) {
  const style: CSSProperties = {
    background: "transparent",
    border: `2px solid ${LIME}`,
    color: LIME,
    borderRadius: 8,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 6,
    whiteSpace: "nowrap",
  };

  return (
    <button
      style={style}
      onClick={() => onMakeApp({ kind, refId, title, emoji })}
      aria-label={`Make an app for ${title}`}
      title="Pin this to your home screen"
    >
      <span style={{ fontSize: 14 }}>📌</span> Make an app
    </button>
  );
}
