"use client";

import { useEffect, useState } from "react";
import styles from "./PhotoSwipeHint.module.css";

/**
 * Photo swipe hint (Eric, 2026-10-03): shows once on app start over the job
 * cover photo — "swipe" with curved orange arrows like Eric drew, demonstrating
 * the swipe gesture. Fades after 4s or on touch, then never shows again.
 */

const SEEN_KEY = "jc-photo-swipe-hint-seen-v2";

export function PhotoSwipeHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY)) return;
    } catch {
      return;
    }
    const appear = window.setTimeout(() => setShow(true), 1000);
    const hide = window.setTimeout(() => {
      setShow(false);
      try {
        localStorage.setItem(SEEN_KEY, "1");
      } catch {
        /* ignore */
      }
    }, 5000);
    const onTouch = () => {
      setShow(false);
      try {
        localStorage.setItem(SEEN_KEY, "1");
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("touchstart", onTouch, { once: true, passive: true });
    return () => {
      window.clearTimeout(appear);
      window.clearTimeout(hide);
      window.removeEventListener("touchstart", onTouch);
    };
  }, []);

  if (!show) return null;

  // Curved swipe arrows like Eric drew (orange, showing left-right motion).
  const curve = (flip: boolean) => (
    <svg viewBox="0 0 80 40" fill="none" style={flip ? { transform: "scaleX(-1)" } : undefined}>
      <path
        d={flip ? "M70 8 Q 40 20, 12 28 M12 28 L20 20 M12 28 L22 32" : "M10 8 Q 40 20, 68 28 M68 28 L60 20 M68 28 L58 32"}
        stroke="#fb923c"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );

  return (
    <div className={styles.hint} aria-hidden>
      <div className={styles.swipeMotion}>
        <div className={styles.curveLeft}>{curve(false)}</div>
        <span className={styles.text}>swipe</span>
        <div className={styles.curveRight}>{curve(true)}</div>
      </div>
    </div>
  );
}
