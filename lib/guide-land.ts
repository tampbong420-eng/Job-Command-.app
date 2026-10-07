import type { GuideSpot } from "@/lib/guide-next";

/**
 * Where each Guide step lands on its stage page. A stage can mark a spot itself with
 * data-guide-spot="…"; otherwise these selectors find today's control.
 */
export const GUIDE_SPOT_SELECTORS: Record<GuideSpot, string[]> = {
  "lead-phone": ['input[type="tel"]'],
  "lead-call": [".lead-call"],
  "estimate-visit": [".est-schedule-go"],
  "estimate-lines": [".est-line"],
  "estimate-send": [".est-delivery .lead-advance", ".lead-advance.btn-appointment-orange"],
  "schedule-day": ['[data-stage-form="schedule-prep"] > li:nth-child(1)', ".est-schedule-go"],
  "schedule-crew": ['[data-stage-form="schedule-prep"] > li:nth-child(2)'],
  "schedule-materials": ['[data-stage-form="schedule-prep"] > li:nth-child(n+3):not(.on)', '[data-stage-form="schedule-prep"] > li:nth-child(n+3)'],
  "invoice-send": [".lead-advance.invoice"],
  close: [".lead-advance.archive"],
  "clock-in": ['[data-guide-spot~="clock-in"]'],
  "on-clock": ['.ja-card[data-card="tasks"]', ".ja"],
};

/** For an estimate, land on the first line that still needs words or a price. */
function firstEmptyLine(root: ParentNode): HTMLElement | null {
  const rows = [...root.querySelectorAll<HTMLElement>(".est-line")];
  return (
    rows.find((row) => [...row.querySelectorAll<HTMLInputElement>("input")].some((input) => !input.value.trim())) ||
    rows[0] ||
    null
  );
}

export function findGuideSpot(spot: GuideSpot, root: ParentNode = document): HTMLElement | null {
  const marked = root.querySelector<HTMLElement>(`[data-guide-spot~="${spot}"]`);
  if (marked) return marked;
  if (spot === "estimate-lines") return firstEmptyLine(root);
  for (const selector of GUIDE_SPOT_SELECTORS[spot]) {
    const hit = root.querySelector<HTMLElement>(selector);
    if (hit) return hit;
  }
  return null;
}

/**
 * Wait for the stage to render, scroll the spot to the middle of the screen, light it up, and put
 * the cursor in it when it's a box. Gives up quietly after ~3 s (the stage still opened).
 */
export function landOnGuideSpot(spot: GuideSpot, opts: { root?: () => ParentNode | null; timeoutMs?: number; onTap?: () => void } = {}) {
  if (typeof window === "undefined") return () => undefined;
  const started = performance.now();
  const limit = opts.timeoutMs ?? 3000;
  let raf = 0;
  let clear = 0;
  let lit: HTMLElement | null = null;
  const onTap = opts.onTap;
  const tapHandler = () => {
    // Single tap on the highlighted target advances the Guide (Eric, 2026-10-03):
    // even if the task isn't done, move to the next one.
    if (lit) {
      lit.classList.remove("guide-spot");
      lit.style.removeProperty("--guide-pulse");
    }
    onTap?.();
  };
  const tick = () => {
    const root = opts.root?.() || document;
    const el = findGuideSpot(spot, root);
    if (!el) {
      if (performance.now() - started < limit) raf = requestAnimationFrame(tick);
      return;
    }
    lit = el;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("guide-spot");
    // Pulse color matches the button's own theme (Eric, 2026-10-03): orange for main,
    // green for go, whatever the pipeline stage uses. Falls back to amber.
    try {
      const bg = window.getComputedStyle(el).backgroundColor;
      if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
        el.style.setProperty("--guide-pulse", bg);
      }
    } catch {
      /* keep the fallback */
    }
    // Tap once to skip to the next Guide task (Eric, 2026-10-03).
    if (onTap) el.addEventListener("click", tapHandler, { once: true });
    const box = el.matches("input, textarea, select") ? el : el.querySelector<HTMLElement>("input:not([type=hidden]), textarea");
    if (box && (spot === "lead-phone" || spot === "estimate-lines")) {
      window.setTimeout(() => box.focus({ preventScroll: true }), 450);
    }
    clear = window.setTimeout(() => {
      el.classList.remove("guide-spot");
      el.style.removeProperty("--guide-pulse");
      if (onTap) el.removeEventListener("click", tapHandler);
    }, 8000);
  };
  // Let React paint the stage first.
  raf = requestAnimationFrame(() => requestAnimationFrame(tick));
  return () => {
    cancelAnimationFrame(raf);
    window.clearTimeout(clear);
    if (lit) {
      lit.classList.remove("guide-spot");
      lit.style.removeProperty("--guide-pulse");
      if (onTap) lit.removeEventListener("click", tapHandler);
    }
    lit = null;
  };
}
