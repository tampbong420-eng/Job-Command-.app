/**
 * Dark | Light pill (Eric, 2026-10-02): each person picks Dark (Lime Industrial, id "ink") or Light on their
 * own phone. The pick lives in a cookie on this device, one per signed-in person, so the server paints the
 * right look on the first frame (no flash) and it survives reloads. No pick yet → the shop's App look
 * (Settings), whose default is Dark. Client-safe: no Node APIs.
 */
import { SHELL_THEME_IDS, parseShellTheme, type ShellLookId, type ShellThemeId } from "@/lib/shell-theme";

export const DEVICE_LOOK_COOKIE = "jc_look";
/** Signed-out screens (sign-in, PIN) on this phone use the last pick made here. */
export const DEVICE_LOOK_GUEST = "guest";
const YEAR_SECONDS = 60 * 60 * 24 * 365;

export function deviceLookCookieName(accountKey: string | null | undefined) {
  const key = String(accountKey || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || DEVICE_LOOK_GUEST;
  return `${DEVICE_LOOK_COOKIE}_${key}`;
}

/** A saved pick, or null for none / junk. Only real ids count, so a bad cookie never wins over the shop. */
export function parseDeviceLook(value: string | null | undefined): ShellThemeId | null {
  const id = String(value || "").trim().toLowerCase();
  return (SHELL_THEME_IDS as readonly string[]).includes(id) ? (id as ShellThemeId) : null;
}

/** This person's pick on this phone. Signed out → the phone's last pick. A signed-in person never inherits another person's pick. */
export function deviceLookFromCookies(
  get: (name: string) => string | null | undefined,
  accountKey: string | null | undefined
): ShellThemeId | null {
  if (accountKey) return parseDeviceLook(get(deviceLookCookieName(accountKey)));
  return parseDeviceLook(get(deviceLookCookieName(DEVICE_LOOK_GUEST)));
}

/** What the shell starts on: this phone's pick, else the shop's App look (default Dark). */
export function startingShellChoice(device: ShellThemeId | null | undefined, shop: string | null | undefined): ShellThemeId {
  return device || parseShellTheme(shop);
}

export function deviceLookCookie(accountKey: string | null | undefined, id: ShellThemeId, secure: boolean) {
  return `${deviceLookCookieName(accountKey)}=${id}; Path=/; Max-Age=${YEAR_SECONDS}; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** Save the pick on this phone for this person, and as the phone's last pick for the sign-in screen. */
export function writeDeviceLook(accountKey: string | null | undefined, id: ShellThemeId) {
  if (typeof document === "undefined") return;
  const secure = typeof location !== "undefined" && location.protocol === "https:";
  try {
    document.cookie = deviceLookCookie(accountKey, id, secure);
    if (accountKey) document.cookie = deviceLookCookie(DEVICE_LOOK_GUEST, id, secure);
  } catch {
    /* cookies off: the pick lasts until reload */
  }
}

export const PILL_LOOKS: ReadonlyArray<{ id: ShellLookId; label: string }> = [
  { id: "ink", label: "Dark" },
  { id: "light", label: "Light" },
];
