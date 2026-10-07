/**
 * Orange "where did that swipe take me" labels (Eric, 2026-10-02) and the one-time
 * "Press and hold to select multiple days" hint for the Schedule calendar.
 */

export type FlashUnit = "week" | "month" | "day" | "job";

/** "← Previous week", "Next month →". Left arrow for back, right arrow for forward. */
export function swipeFlashLabel(unit: FlashUnit, step: -1 | 1): string {
  return step < 0 ? `← Previous ${unit}` : `Next ${unit} →`;
}

export const SWIPE_FLASH_MS = 1000;

/** Per person on this phone, so a second worker on a shared phone still gets the hint once. */
export function holdHintKey(person: string): string {
  const who = (person || "").trim().toLowerCase().replace(/\s+/g, "-") || "anyone";
  return `jc-hold-multi-hint:${who}`;
}

type Store = Pick<Storage, "getItem" | "setItem">;

export function holdHintDone(store: Store | null | undefined, person: string): boolean {
  try {
    return store?.getItem(holdHintKey(person)) === "1";
  } catch {
    return false;
  }
}

export function markHoldHintDone(store: Store | null | undefined, person: string): void {
  try {
    store?.setItem(holdHintKey(person), "1");
  } catch {
    /* private mode: hint may show again next time, harmless */
  }
}

/**
 * What the hint should do after a change:
 *  - first long-press (not done yet) → show
 *  - two or more days picked → hide and remember forever
 */
export function nextHoldHint(state: { done: boolean; showing: boolean }, event: "long-press" | { picked: number }) {
  if (state.done) return { done: true, showing: false, remember: false };
  if (event === "long-press") return { done: false, showing: true, remember: false };
  if (event.picked > 1) return { done: true, showing: false, remember: true };
  return { ...state, remember: false };
}
