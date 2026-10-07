export const SWIPE_HINT_KEY = "job_command_seen_swipe_hint";

export function hasSeenSwipeHint(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(SWIPE_HINT_KEY) === "true";
  } catch {
    return true;
  }
}

export function markSwipeHintSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SWIPE_HINT_KEY, "true");
  } catch {
    /* private mode */
  }
}
