"use client";

import s from "@/components/signup/signup.module.css";

export const ARROW = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export function cx(...names: (string | false | null | undefined)[]) {
  return names.filter(Boolean).join(" ");
}

/** Bottom sheet in the signup look. The primary row leaves room on the right for the one floating mic. */
export function Sheet({
  children,
  onClose,
  label,
  noMic = false,
}: {
  children: React.ReactNode;
  onClose: () => void;
  label?: string;
  /** Lists with nothing to say into: hide the floating mic so it never covers a row. */
  noMic?: boolean;
}) {
  return (
    <>
      <div className={s.scrim} onClick={onClose} aria-hidden="true" />
      <div className={s.sheet} role="dialog" aria-modal="true" aria-label={label} data-no-mic={noMic ? "1" : undefined}>
        <div className={s.grab} />
        {children}
      </div>
    </>
  );
}
