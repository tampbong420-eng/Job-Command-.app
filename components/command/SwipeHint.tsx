"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SwipeChevron } from "@/components/command/SwipeChevron";
import { hasSeenSwipeHint, markSwipeHintSeen } from "@/lib/swipe-hint";
import styles from "./SwipeHint.module.css";

export function SwipeHint() {
  const [open, setOpen] = useState(false);
  const startX = useRef<number | null>(null);

  useEffect(() => {
    setOpen(!hasSeenSwipeHint());
  }, []);

  const dismiss = useCallback(() => {
    markSwipeHintSeen();
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    markSwipeHintSeen();
    const timer = window.setTimeout(() => setOpen(false), 5000);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={styles.veil}
      data-swipe-hint="1"
      role="note"
      aria-label="Swipe for jobs"
      onClick={dismiss}
      onPointerDown={(event) => {
        startX.current = event.clientX;
      }}
      onPointerUp={(event) => {
        const origin = startX.current;
        startX.current = null;
        if (origin == null) {
          dismiss();
          return;
        }
        if (Math.abs(event.clientX - origin) >= 24 || event.clientX === origin) dismiss();
      }}
    >
      <span className={styles.right}>
        <SwipeChevron />
      </span>
      <span className={styles.left}>
        <SwipeChevron />
      </span>
    </div>
  );
}
