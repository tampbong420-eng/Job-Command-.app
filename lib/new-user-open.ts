/** Isolated first-open client reset. Overlay keys only — never wipes jobs, clients, crew, or hours. */

import { APP_TOUR_KEY } from "./app-tour";
import { HELP_MODE_KEY } from "./help-mode";
import { INTRO_BOOT_SEEN } from "./intro-boot";
import { SWIPE_HINT_KEY } from "./swipe-hint";

export const NEW_USER_PARAM = "start";
export const NEW_USER_VALUE = "new";

export function isFreshStartRequest(search = typeof window === "undefined" ? "" : window.location.search) {
  try {
    return new URLSearchParams(search.startsWith("?") || search.length === 0 ? search : `?${search}`).get(NEW_USER_PARAM) === NEW_USER_VALUE;
  } catch {
    return false;
  }
}

export function clearFreshClientGuides() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(APP_TOUR_KEY);
    window.localStorage.removeItem(HELP_MODE_KEY);
    window.localStorage.removeItem(SWIPE_HINT_KEY);
    window.sessionStorage.removeItem(INTRO_BOOT_SEEN);
  } catch {
    /* private mode */
  }
}
