"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SwipeOpts = {
  enabled?: boolean;
  threshold?: number;
  keys?: boolean;
  yieldToLocal?: boolean;
  /** Attach listeners on the closest `.app-shell` so header/dock participate. */
  shell?: boolean;
  /** `y` swipes the six-step sequence; `x` stays for rolodex / employee decks. */
  axis?: "x" | "y";
  /** Buttons matching this selector still start a swipe. */
  through?: string;
};

type PtrHost = Pick<
  PointerEvent,
  "button" | "clientX" | "clientY" | "pointerId" | "target" | "preventDefault"
> & {
  currentTarget: HTMLElement;
};

const SKIP =
  "input, textarea, select, option, iframe, [contenteditable='true'], [data-no-swipe], button, a, [role='button'], [role='tab'], [role='link'], [role='menuitem'], summary, label";

function scrollerFrom(node: HTMLElement | null) {
  let cur: HTMLElement | null = node;
  while (cur) {
    const style = typeof window !== "undefined" ? window.getComputedStyle(cur) : null;
    const oy = style?.overflowY || "";
    if ((oy === "auto" || oy === "scroll" || oy === "overlay") && cur.scrollHeight > cur.clientHeight + 4) {
      return cur;
    }
    cur = cur.parentElement;
  }
  return node;
}

function atVerticalEdge(node: HTMLElement, dy: number) {
  const box = scrollerFrom(node) || node;
  if (dy > 0) return box.scrollTop <= 2;
  return box.scrollTop + box.clientHeight >= box.scrollHeight - 2;
}

declare global {
  interface Window {
    __jobSwipeClickGuard?: boolean;
    __jobSwipeSuppressUntil?: number;
  }
}

if (typeof window !== "undefined" && !window.__jobSwipeClickGuard) {
  window.__jobSwipeClickGuard = true;
  document.addEventListener(
    "click",
    (event) => {
      if (Date.now() > (window.__jobSwipeSuppressUntil || 0)) return;
      event.preventDefault();
      event.stopPropagation();
    },
    true
  );
}

export function useSwipeNav(onPrev: () => void, onNext: () => void, opts: SwipeOpts = {}) {
  const { enabled = true, threshold = 52, keys = true, yieldToLocal = false, shell = false, axis = "x", through } = opts;
  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);
  const swiping = useRef(false);
  const pointerId = useRef<number | null>(null);
  const host = useRef<HTMLElement | null>(null);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);

  const skipTarget = useCallback(
    (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      if (through && target.closest(through)) return false;
      if (target.closest(SKIP)) return true;
      if (yieldToLocal && target.closest("[data-swipe-local]")) return true;
      return false;
    },
    [through, yieldToLocal]
  );

  const release = useCallback(() => {
    const node = host.current;
    const id = pointerId.current;
    if (node && id != null && node.hasPointerCapture?.(id)) {
      try {
        node.releasePointerCapture(id);
      } catch {
        /* already released */
      }
    }
    host.current = null;
    pointerId.current = null;
  }, []);

  const reset = useCallback(() => {
    release();
    tracking.current = false;
    swiping.current = false;
    setDragging(false);
    setDrag(0);
  }, [release]);

  const onPointerDown = useCallback(
    (event: PtrHost) => {
      if (!enabled || event.button !== 0 || skipTarget(event.target)) {
        tracking.current = false;
        return;
      }
      tracking.current = true;
      swiping.current = false;
      if (typeof window !== "undefined") {
        window.__jobSwipeSuppressUntil = 0;
      }
      startX.current = event.clientX;
      startY.current = event.clientY;
      host.current = event.currentTarget;
      pointerId.current = event.pointerId;
      setDrag(0);
    },
    [enabled, skipTarget]
  );

  const onPointerMove = useCallback(
    (event: PtrHost) => {
      if (!enabled || !tracking.current) return;
      const dx = event.clientX - startX.current;
      const dy = event.clientY - startY.current;
      if (!swiping.current) {
        if (axis === "y") {
          if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.15) {
            reset();
            return;
          }
          if (Math.abs(dy) > 12) {
            if (!atVerticalEdge(event.currentTarget, dy)) {
              reset();
              return;
            }
            swiping.current = true;
            setDragging(true);
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
              host.current = event.currentTarget;
              pointerId.current = event.pointerId;
            } catch {
              /* capture is best-effort */
            }
          }
        } else {
          if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx) * 1.15) {
            reset();
            return;
          }
          if (Math.abs(dx) > 12) {
            swiping.current = true;
            setDragging(true);
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
              host.current = event.currentTarget;
              pointerId.current = event.pointerId;
            } catch {
              /* capture is best-effort */
            }
          }
        }
      }
      if (swiping.current) {
        event.preventDefault();
        setDrag(axis === "y" ? dy : dx);
      }
    },
    [axis, enabled, reset]
  );

  const onPointerUp = useCallback(
    (event: PtrHost) => {
      if (!enabled || !tracking.current) return;
      const dx = event.clientX - startX.current;
      const dy = event.clientY - startY.current;
      const delta = axis === "y" ? dy : dx;
      const didSwipe = swiping.current && Math.abs(delta) >= threshold;
      if (didSwipe) {
        event.preventDefault();
        if (typeof window !== "undefined") {
          window.__jobSwipeSuppressUntil = Date.now() + 600;
        }
        if (delta > 0) onPrev();
        else onNext();
      }
      reset();
    },
    [axis, enabled, onNext, onPrev, reset, threshold]
  );

  const onPointerCancel = useCallback(() => {
    reset();
  }, [reset]);

  const setRef = useCallback((node: HTMLElement | null) => {
    setRoot(node);
  }, []);

  useEffect(() => {
    if (!shell) return;
    const target = root?.closest(".app-shell") ?? root;
    if (!(target instanceof HTMLElement)) return;

    const down = (event: PointerEvent) => {
      onPointerDown({
        button: event.button,
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
        target: event.target,
        preventDefault: () => event.preventDefault(),
        currentTarget: target,
      });
    };
    const move = (event: PointerEvent) => {
      onPointerMove({
        button: event.button,
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
        target: event.target,
        preventDefault: () => event.preventDefault(),
        currentTarget: target,
      });
    };
    const up = (event: PointerEvent) => {
      onPointerUp({
        button: event.button,
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
        target: event.target,
        preventDefault: () => event.preventDefault(),
        currentTarget: target,
      });
    };

    target.addEventListener("pointerdown", down);
    target.addEventListener("pointermove", move, { passive: false });
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", onPointerCancel);
    return () => {
      target.removeEventListener("pointerdown", down);
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [shell, root, onPointerDown, onPointerMove, onPointerUp, onPointerCancel]);

  useEffect(() => {
    if (!keys || !enabled) return;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select")) return;
      if (axis === "y") {
        if (event.key === "ArrowUp") onPrev();
        if (event.key === "ArrowDown") onNext();
      } else {
        if (event.key === "ArrowLeft") onPrev();
        if (event.key === "ArrowRight") onNext();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [axis, enabled, keys, onNext, onPrev]);

  const fromReact = (handler: (event: PtrHost) => void) => (event: React.PointerEvent<HTMLElement>) => {
    handler({
      button: event.button,
      clientX: event.clientX,
      clientY: event.clientY,
      pointerId: event.pointerId,
      target: event.target,
      preventDefault: () => event.preventDefault(),
      currentTarget: event.currentTarget,
    });
  };

  const bind = shell
    ? {
        ref: setRef,
        style: { touchAction: axis === "y" ? ("pan-y" as const) : ("pan-y" as const) },
      }
    : {
        onPointerDown: fromReact(onPointerDown),
        onPointerMove: fromReact(onPointerMove),
        onPointerUp: fromReact(onPointerUp),
        onPointerCancel,
        style: { touchAction: "pan-y" as const },
      };

  return { drag, dragging, bind, ref: setRef, axis };
}
