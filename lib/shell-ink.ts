/** Letter colors picked beside a color scheme. Empty means the theme keeps its own ink. */

export const SHELL_INK_STORAGE_KEY = "jc-shell-ink";

export const DARK_TYPE_INKS = [
  { id: "forange", label: "Fluorescent orange", color: "#ff9a00" },
  { id: "pink", label: "Fluorescent pink", color: "#ff2bd6" },
  { id: "fluoro", label: "Fluorescent yellow", color: "#d8ff3a" },
  { id: "white", label: "White", color: "#ffffff" },
] as const;

export const LIGHT_TYPE_INKS = [
  { id: "red", label: "Red", color: "#b10e0e" },
  { id: "orange", label: "Orange", color: "#c2410c" },
  { id: "black", label: "Black", color: "#111111" },
  { id: "hpink", label: "Hot pink", color: "#be185d" },
  { id: "white", label: "White", color: "#ffffff" },
  { id: "fluoro", label: "Fluorescent yellow", color: "#d8ff3a" },
] as const;

export type DarkTypeInkId = (typeof DARK_TYPE_INKS)[number]["id"];
export type LightTypeInkId = (typeof LIGHT_TYPE_INKS)[number]["id"];

export type ShellInk = {
  dark: DarkTypeInkId | "";
  light: LightTypeInkId | "";
};

const DARK_IDS = new Set<string>(DARK_TYPE_INKS.map((ink) => ink.id));
const LIGHT_IDS = new Set<string>(LIGHT_TYPE_INKS.map((ink) => ink.id));

export const EMPTY_SHELL_INK: ShellInk = { dark: "", light: "" };

export function parseShellInk(value: string | null | undefined): ShellInk {
  const text = (value || "").trim().toLowerCase();
  if (!text) return { ...EMPTY_SHELL_INK };
  const [dark, light] = text.split(",");
  return {
    dark: DARK_IDS.has(dark || "") ? (dark as DarkTypeInkId) : "",
    light: LIGHT_IDS.has(light || "") ? (light as LightTypeInkId) : "",
  };
}

export function formatShellInk(ink: ShellInk | null | undefined): string {
  const next = ink || EMPTY_SHELL_INK;
  if (!next.dark && !next.light) return "";
  return `${next.dark},${next.light}`;
}

/** A dark-theme ink never paints a light page, and the other way around. */
export function typeInkColor(ink: ShellInk, canvas: "dark" | "light"): string | null {
  if (canvas === "light") {
    return LIGHT_TYPE_INKS.find((item) => item.id === ink.light)?.color ?? null;
  }
  return DARK_TYPE_INKS.find((item) => item.id === ink.dark)?.color ?? null;
}

export function readStoredShellInk(): ShellInk {
  if (typeof window === "undefined") return { ...EMPTY_SHELL_INK };
  try {
    return parseShellInk(window.localStorage.getItem(SHELL_INK_STORAGE_KEY));
  } catch {
    return { ...EMPTY_SHELL_INK };
  }
}

export function persistShellInk(ink: ShellInk) {
  if (typeof window === "undefined") return;
  try {
    const stored = formatShellInk(ink);
    if (stored) window.localStorage.setItem(SHELL_INK_STORAGE_KEY, stored);
    else window.localStorage.removeItem(SHELL_INK_STORAGE_KEY);
  } catch {
    /* private mode */
  }
}
