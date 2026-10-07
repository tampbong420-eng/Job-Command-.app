"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Bottom sheet for the unified Schedule (stop editor, day editor, add flow).
 * Portaled into `.app-shell` so the shop's skin (Lime Industrial, Standard Dark, Light…) still paints it,
 * and it sits over the dock instead of under it.
 */
export function ScheduleSheet({
  open,
  title,
  kicker,
  tone,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  kicker?: string;
  tone?: "JOB" | "ESTIMATE";
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(document.querySelector<HTMLElement>(".app-shell") || document.body);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !host) return null;
  return createPortal(
    <div className="sched-sheet-veil" data-no-swipe onClick={onClose}>
      <section
        className="sched-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-tone={tone || undefined}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="sched-sheet-grip" aria-hidden="true" />
        <header className="sched-sheet-head">
          <div>
            {kicker ? <span className="sched-sheet-kicker">{kicker}</span> : null}
            <h2>{title}</h2>
          </div>
          <button type="button" className="sched-sheet-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="sched-sheet-body">{children}</div>
        {footer ? <footer className="sched-sheet-foot">{footer}</footer> : null}
      </section>
    </div>,
    host
  );
}
