"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
  INTRO_BOOT_ENABLED,
  INTRO_BOOT_MARK,
  INTRO_BOOT_MS,
  INTRO_BOOT_SEEN,
  INTRO_BOOT_WORDMARK,
} from "@/lib/intro-boot";
import styles from "./IntroBoot.module.css";

/* Rim of the shield in the shield image's own pixels (407×402), traced from the original artwork.
   Two halves start at the top center and meet at the bottom point. */
const RIM_LEFT =
  "M204 14 L182.6 14 L176.9 14.5 L171.3 15.8 L21.5 65.9 L17.1 68.2 L15.6 70.1 L14.7 72.4 L14 85.2 L15.1 100.8 L23.9 175.6 L31.3 259.4 L32.5 265.4 L34.4 271.2 L39.9 285.1 L42.3 289.6 L47.2 295.6 L53.8 301 L95.1 330 L128.3 351.8 L191 380.6 L199.2 383.7 L204.3 384.5";
const RIM_RIGHT =
  "M204 14 L224.4 14 L230.1 14.5 L235.6 15.8 L388.8 66.7 L391.9 69.2 L392.6 71 L393 79 L392.3 102.9 L384.7 169 L377 259.5 L376.1 265.1 L373.1 273.9 L364.1 291.1 L360.6 296.2 L356.6 300.2 L307.6 334 L225.5 377.6 L209.7 383.7 L204.3 384.5";

export function IntroBoot() {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!INTRO_BOOT_ENABLED) {
      setOpen(false);
      return;
    }
    let seen = false;
    try {
      seen = sessionStorage.getItem(INTRO_BOOT_SEEN) === "1";
    } catch {
      /* private mode: show the splash */
    }
    if (seen) {
      setOpen(false);
      return;
    }
    // prefers-reduced-motion: the CSS drops every move and keeps one plain fade (same length).
    const done = window.setTimeout(() => {
      try {
        sessionStorage.setItem(INTRO_BOOT_SEEN, "1");
      } catch {
        /* private mode */
      }
      setOpen(false);
    }, INTRO_BOOT_MS);

    return () => window.clearTimeout(done);
  }, []);

  if (!open) return null;

  const shieldMask = `url(${INTRO_BOOT_MARK})`;

  return (
    <div
      className={styles.veil}
      data-logo-burst="1"
      data-intro-boot="1"
      aria-hidden
      style={{ pointerEvents: "none", "--intro-ms": `${INTRO_BOOT_MS}ms` } as CSSProperties}
      onAnimationEnd={(event) => {
        if (event.target !== event.currentTarget) return;
        try {
          sessionStorage.setItem(INTRO_BOOT_SEEN, "1");
        } catch {
          /* private mode */
        }
        setOpen(false);
      }}
    >
      <div className={styles.lockup} style={{ pointerEvents: "none" }}>
        <div className={styles.shieldBox}>
          <span className={styles.bloom} />
          {/* eslint-disable-next-line @next/next/no-img-element -- splash needs a plain, sync-decoded img */}
          <img className={styles.shieldSoft} src={INTRO_BOOT_MARK} alt="" width={814} height={804} decoding="sync" />
          {/* eslint-disable-next-line @next/next/no-img-element -- splash needs a plain, sync-decoded img */}
          <img
            className={styles.shield}
            src={INTRO_BOOT_MARK}
            alt=""
            width={814}
            height={804}
            decoding="sync"
            data-intro-mark="1"
            style={{ pointerEvents: "none" }}
          />
          <span className={styles.sheen} style={{ WebkitMaskImage: shieldMask, maskImage: shieldMask }} />
          <svg className={styles.trace} viewBox="0 0 407 402" aria-hidden focusable="false">
            <path className={styles.traceGlow} d={RIM_LEFT} pathLength={1} />
            <path className={styles.traceGlow} d={RIM_RIGHT} pathLength={1} />
            <path className={styles.traceLine} d={RIM_LEFT} pathLength={1} />
            <path className={styles.traceLine} d={RIM_RIGHT} pathLength={1} />
          </svg>
        </div>
        <div className={styles.wordBox}>
        </div>
      </div>
    </div>
  );
}
