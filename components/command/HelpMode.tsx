"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  HELP_HOLD_MS,
  HELP_MODE_BLURB,
  helpControlFrom,
  helpCopyFor,
} from "@/lib/help-mode";
import { TOAST_COPY, pushToast } from "@/lib/toast-center";
import { useHelpMode } from "@/hooks/use-help-mode";
import styles from "./HelpMode.module.css";

type Tip = {
  title: string;
  body: string;
  x: number;
  y: number;
};

export function HelpModeHost() {
  const { on } = useHelpMode();
  const [tip, setTip] = useState<Tip | null>(null);
  const timer = useRef<number>(0);
  const held = useRef(false);

  const clearTimer = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = 0;
  }, []);

  useEffect(() => {
    if (!on) {
      setTip(null);
      return;
    }

    function down(event: PointerEvent) {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const control = helpControlFrom(event.target);
      if (!control) return;
      held.current = false;
      clearTimer();
      const rect = control.getBoundingClientRect();
      const copy = helpCopyFor(control);
      timer.current = window.setTimeout(() => {
        held.current = true;
        const x = Math.min(Math.max(12, rect.left), window.innerWidth - 332);
        const y = Math.min(rect.bottom + 8, window.innerHeight - 160);
        setTip({ ...copy, x, y });
      }, HELP_HOLD_MS);
    }

    function up() {
      clearTimer();
    }

    function click(event: MouseEvent) {
      if (!held.current) return;
      event.preventDefault();
      event.stopPropagation();
      held.current = false;
    }

    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    window.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      window.removeEventListener("click", click, true);
      clearTimer();
    };
  }, [on, clearTimer]);

  if (!on || !tip) return null;

  return (
    <aside
      className={styles.tip}
      data-help-tip="1"
      role="tooltip"
      style={{ left: tip.x, top: tip.y }}
      onClick={() => setTip(null)}
    >
      <p className={styles.kicker}>Help Mode</p>
      <p className={styles.title}>{tip.title}</p>
      <p className={styles.body}>{tip.body}</p>
    </aside>
  );
}

export function HelpModeToggle() {
  const { on, setEnabled } = useHelpMode();
  return (
    <div className={styles.row} data-help-toggle="1">
      <div className={styles.copy}>
        <p className="card-label">Help Mode</p>
        <p className={styles.blurb}>{HELP_MODE_BLURB}</p>
      </div>
      <button
        type="button"
        className={styles.switch}
        role="switch"
        aria-checked={on}
        aria-label="Help Mode"
        data-help-skip="1"
        onClick={() => {
          const next = !on;
          setEnabled(next);
          pushToast(next ? TOAST_COPY.helpOn : TOAST_COPY.helpOff);
        }}
      >
        <span className={styles.knob} />
      </button>
    </div>
  );
}
