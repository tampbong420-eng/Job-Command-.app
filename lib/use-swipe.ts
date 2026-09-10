import { useCallback, useEffect, useRef, useState } from "react";

const THRESHOLD = 42;

export function useSwipe(
  onStep: (delta: 1 | -1) => void,
  axis: "x" | "y" = "x",
) {
  const [drag, setDrag] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const last = useRef(0);
  const onStepRef = useRef(onStep);

  useEffect(() => {
    onStepRef.current = onStep;
  }, [onStep]);

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    start.current = { x: event.clientX, y: event.clientY };
    moved.current = false;
    last.current = 0;
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!start.current) return;
      const dx = event.clientX - start.current.x;
      const dy = event.clientY - start.current.y;
      const value = axis === "x" ? dx : dy;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) moved.current = true;
      last.current = value;
      setDrag(value);
    },
    [axis],
  );

  const onPointerUp = useCallback(() => {
    const value = last.current;
    start.current = null;
    last.current = 0;
    setDrag(0);
    if (Math.abs(value) > THRESHOLD) {
      onStepRef.current(value < 0 ? 1 : -1);
    }
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (axis === "x") {
        if (event.key === "ArrowLeft") onStepRef.current(-1);
        if (event.key === "ArrowRight") onStepRef.current(1);
      } else {
        if (event.key === "ArrowUp") onStepRef.current(-1);
        if (event.key === "ArrowDown") onStepRef.current(1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [axis]);

  return {
    drag,
    dragging: Math.abs(drag) > 8,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
}
