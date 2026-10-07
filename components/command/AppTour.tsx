"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  APP_TOUR_INTEGRITY,
  APP_TOUR_REPLAY_EVENT,
  hasSeenAppTour,
  markAppTourSeen,
  incrementTourOpenCount,
  requestAppTourReplay,
  tourStepsForRole,
} from "@/lib/app-tour";
import { TOAST_COPY, pushToast } from "@/lib/toast-center";
import styles from "./AppTour.module.css";

/**
 * Rebuilt tour (Eric, 2026-10-03): every step navigates to the exact tab it is
 * describing and a big pulsing orange arrow points at the thing being talked
 * about — like the Guide button's arrow. The veil is gone in guide mode so the
 * real UI shows through; the card floats above the dock and the arrow does the
 * pointing. Targets live on each step (`tab`, `target` selector).
 */
export function AppTour({
  field = false,
  onTab,
}: {
  field?: boolean;
  onTab?: (tab: "crew" | "command" | "company") => void;
}) {
  const steps = tourStepsForRole(field);
  const [mode, setMode] = useState<"off" | "ask" | "guide">("off");
  const [step, setStep] = useState(0);
  const [arrow, setArrow] = useState<{ x: number; y: number } | null>(null);
  const stepRef = useRef(0);
  stepRef.current = step;

  const close = useCallback((reason: "skip" | "done" = "skip") => {
    markAppTourSeen();
    setMode("off");
    setStep(0);
    setArrow(null);
    pushToast(reason === "done" ? TOAST_COPY.tourDone : TOAST_COPY.tourSkip);
  }, []);

  useEffect(() => {
    // Count this app open toward the 15 auto-shows (Eric, 2026-10-05)
    incrementTourOpenCount();
    if (!hasSeenAppTour()) setMode("ask");
    const replay = () => {
      setStep(0);
      setMode("ask");
    };
    window.addEventListener(APP_TOUR_REPLAY_EVENT, replay);
    return () => window.removeEventListener(APP_TOUR_REPLAY_EVENT, replay);
  }, []);

  // Guide mode: open the step's tab, then point the orange arrow at its target.
  useEffect(() => {
    if (mode !== "guide") return;
    const current = steps[stepRef.current];
    if (current.tab) onTab?.(current.tab);
    let glowEl: Element | null = null;
    let cancelled = false;
    let retryCount = 0;
    const MAX_RETRIES = 10;

    const place = () => {
      if (cancelled) return;
      const el = document.querySelector(current.target);
      if (glowEl && glowEl !== el) glowEl.classList.remove(styles.spotlight);
      glowEl = el;
      if (!el) {
        // Element not ready yet — retry (Eric 2026-10-05: arrows weren't pointing)
        retryCount++;
        if (retryCount < MAX_RETRIES) {
          window.setTimeout(place, 400);
        } else {
          setArrow(null);
        }
        return;
      }
      // Found it — scroll into view and position arrow
      el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
      // Measure after layout settles (multiple checks for accuracy)
      const measure = (attempts: number) => {
        if (cancelled) return;
        const r = el.getBoundingClientRect();
        // Only position if element is actually visible (has size)
        if (r.width > 0 && r.height > 0) {
          el.classList.add(styles.spotlight);
          setArrow({ x: r.left + r.width / 2, y: r.top });
        } else if (attempts > 0) {
          window.setTimeout(() => measure(attempts - 1), 200);
        }
      };
      window.setTimeout(() => measure(3), 100);
    };

    // Start after tab content begins rendering
    const t = window.setTimeout(place, 400);

    const onResize = () => {
      const el = document.querySelector(current.target);
      if (!el) return setArrow(null);
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setArrow({ x: r.left + r.width / 2, y: r.top });
      }
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
      window.removeEventListener("resize", onResize);
      glowEl?.classList.remove(styles.spotlight);
      setArrow(null);
    };
  }, [mode, step, steps, onTab]);

  if (mode === "off") return null;

  const current = steps[step];
  const last = step >= steps.length - 1;

  if (mode === "ask") {
    return (
      <div className={styles.veil} data-app-tour="1" role="dialog" aria-label="App tutorial">
        <div className={styles.card}>
          <p className={styles.kicker}>jobcommand.app</p>
          <h2 className={styles.title}>Take a 30-second tour?</h2>
          <p className={styles.body}>
            I’ll walk the dock and the job tumbler. You can skip or replay it later from Company.
          </p>
          <p className={styles.safe}>{APP_TOUR_INTEGRITY}</p>
          <div className={`${styles.actions} ${styles.ask}`}>
            <button type="button" className={styles.ghost} onClick={() => close("skip")}>
              Skip
            </button>
            <button type="button" className={styles.next} onClick={() => setMode("guide")}>
              Start tour
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Guide mode: no veil — the app stays visible, the orange arrow points at the
  // real thing, and the card floats above the dock.
  return (
    <>
      {arrow && (
        <div
          aria-hidden
          className={styles.arrow}
          style={{ left: arrow.x, top: Math.max(4, arrow.y - 74) }}
          data-testid="app-tour-arrow"
        >
          <svg viewBox="0 0 48 72" width="44" height="66" fill="none">
            <path
              d="M24 4 L24 44 M10 30 L24 46 L38 30"
              stroke="#f59e0b"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="24" cy="4" r="5" fill="#f59e0b" />
          </svg>
        </div>
      )}
      <div
        className={styles.guideCard}
        data-app-tour="1"
        role="dialog"
        aria-label={`Tour ${step + 1} of ${steps.length}: ${current.title}`}
      >
        <button type="button" className={styles.skip} onClick={() => close("skip")} aria-label="Skip tour">
          ✕
        </button>
        <p className={styles.kicker}>
          {current.kicker} · {step + 1} of {steps.length}
        </p>
        <h2 className={styles.title}>{current.title}</h2>
        <p className={styles.body}>{current.body}</p>
        <div className={styles.dots} aria-hidden>
          {steps.map((item, index) => (
            <i key={item.id} className={index === step ? styles.on : undefined} />
          ))}
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.ghost}
            onClick={() => (step === 0 ? setMode("ask") : setStep((value) => value - 1))}
          >
            Back
          </button>
          <button
            type="button"
            className={styles.next}
            onClick={() => (last ? close("done") : setStep((value) => value + 1))}
          >
            {last ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </>
  );
}

export function ReplayAppTutorial() {
  return (
    <div className={styles.replay} data-app-tour-replay="1">
      <p className="card-label">App tutorial</p>
      <button type="button" onClick={() => requestAppTourReplay()}>
        Replay App Tutorial
      </button>
      <small>{APP_TOUR_INTEGRITY}</small>
    </div>
  );
}
