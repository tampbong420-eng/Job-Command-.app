/**
 * Where the one floating mic rests. It lives bottom-right above the dock; when the page stops
 * with a Next/step button (must) or a tag/heading (nice) under it, it slides up just clear —
 * but only to a spot that is clear too, and never more than `max` px.
 */
export type MicBox = { top: number; bottom: number; left: number; right: number };

export const MAX_MIC_LIFT = 150;

/** How far to raise the mic so it rests clear of `steps` (must) and `marks` (if a clear spot is near). */
export function micLift(base: MicBox, steps: MicBox[], marks: MicBox[], max = MAX_MIC_LIFT): number {
  const hit = (list: MicBox[], lift: number) =>
    list.filter((r) => r.bottom > base.top - lift && r.top < base.bottom - lift && r.right > base.left && r.left < base.right);
  const climb = (list: MicBox[]) => {
    let lift = 0;
    for (let i = 0; i < 8; i++) {
      const over = hit(list, lift);
      if (!over.length) return lift;
      lift = Math.max(lift, ...over.map((r) => base.bottom - r.top + 6));
      if (lift > max) return -1;
    }
    return -1;
  };
  if (!hit(steps, 0).length && !hit(marks, 0).length) return 0;
  const both = climb([...steps, ...marks]);
  if (both >= 0) return Math.round(both);
  if (!hit(steps, 0).length) return 0;
  const only = climb(steps);
  return only >= 0 ? Math.round(only) : 0;
}

