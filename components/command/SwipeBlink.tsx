"use client";

import { useEffect, useState } from "react";
import { SwipeChevron } from "@/components/command/SwipeChevron";
import styles from "./SwipeBlink.module.css";

function seen(key: string) {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return true;
  }
}

export function SwipeBlink({ storageKey }: { storageKey: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(!seen(storageKey));
  }, [storageKey]);

  useEffect(() => {
    if (!open) return;
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      /* private mode */
    }
    const timer = window.setTimeout(() => setOpen(false), 5000);
    return () => window.clearTimeout(timer);
  }, [open, storageKey]);

  if (!open) return null;

  return (
    <div className={styles.mark} role="note" aria-label="Swipe sideways">
      <span className={styles.right}>
        <SwipeChevron />
      </span>
      <span className={styles.left}>
        <SwipeChevron />
      </span>
    </div>
  );
}
