"use client";

import { useEffect, useRef, useState } from "react";

export function parseFreeNumber(raw: string, min?: number) {
  if (raw === "" || raw === "." || raw === "-") return min ?? 0;
  const next = Number(raw);
  if (!Number.isFinite(next)) return min ?? 0;
  if (min != null && next < min) return min;
  return next;
}

function allowed(raw: string, integer: boolean) {
  if (raw === "") return true;
  return integer ? /^\d+$/.test(raw) : /^\d*\.?\d*$/.test(raw);
}

export function FreeNumberInput({
  name,
  value,
  onValue,
  onCommit,
  integer = false,
  min,
  ariaLabel,
  disabled,
  className,
}: {
  name?: string;
  value: number;
  onValue?: (next: number) => void;
  onCommit?: (next: number) => void;
  integer?: boolean;
  min?: number;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(() => String(value ?? min ?? 0));
  const focused = useRef(false);

  useEffect(() => {
    if (focused.current) return;
    setText(String(value ?? min ?? 0));
  }, [value, min]);

  function emit(next: number, kind: "live" | "commit") {
    if (kind === "live") onValue?.(next);
    else (onCommit ?? onValue)?.(next);
  }

  return (
    <input
      name={name}
      className={className}
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      aria-label={ariaLabel}
      disabled={disabled}
      value={text}
      data-no-swipe
      data-free-number="1"
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(event) => {
        const raw = event.target.value;
        if (!allowed(raw, integer)) return;
        setText(raw);
        if (raw === "" || raw === ".") {
          emit(min ?? 0, "live");
          return;
        }
        emit(parseFreeNumber(raw, min), "live");
      }}
      onBlur={() => {
        focused.current = false;
        const next = parseFreeNumber(text, min);
        setText(String(next));
        emit(next, "commit");
      }}
    />
  );
}
