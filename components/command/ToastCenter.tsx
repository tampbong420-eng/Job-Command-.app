"use client";

import type { ReactNode } from "react";
import { ToastContext, useToastCenter, useToastEngine } from "@/hooks/use-toast-center";
import styles from "./ToastCenter.module.css";

function Icon({ kind }: { kind: "success" | "error" | "info" }) {
  if (kind === "error") {
    return (
      <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.4" />
        <path d="M12 7v7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="12" cy="17" r="1.2" fill="currentColor" />
      </svg>
    );
  }
  if (kind === "info") {
    return (
      <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.4" />
        <circle cx="12" cy="8" r="1.2" fill="currentColor" />
        <path d="M12 11v6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Viewport() {
  const { toasts, dismiss } = useToastCenter();
  if (!toasts.length) return null;
  return (
    <div className={styles.region} data-toast-center="1" role="status" aria-live="polite" aria-relevant="additions">
      {toasts.map((item) => (
        <article key={item.id} className={styles.card} data-kind={item.kind} data-toast-card="1">
          <Icon kind={item.kind} />
          <div className={styles.copy}>
            <p className={styles.kicker}>{item.kind === "error" ? "Needs a look" : item.kind === "info" ? "Update" : "Done"}</p>
            <p className={styles.title}>{item.title}</p>
            {item.body ? <p className={styles.body}>{item.body}</p> : null}
          </div>
          <button type="button" className={styles.close} aria-label="Dismiss notice" onClick={() => dismiss(item.id)}>
            ×
          </button>
        </article>
      ))}
    </div>
  );
}

export function ToastCenter() {
  const api = useToastEngine();
  return (
    <ToastContext.Provider value={api}>
      <Viewport />
    </ToastContext.Provider>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const api = useToastEngine();
  return (
    <ToastContext.Provider value={api}>
      {children}
      <Viewport />
    </ToastContext.Provider>
  );
}
