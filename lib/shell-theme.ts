/**
 * What a shop can pick: Auto, Lime Industrial, or Light. "auto" is a mode, not a look:
 * it resolves to "ink" (Lime Industrial) or "light" at run time (lib/theme-auto.ts).
 * The Lime Industrial id stays "ink" so phones and shops saved on it keep it.
 */
export const SHELL_THEME_IDS = ["auto", "ink", "light", "midnight", "ember", "sage"] as const;

export type ShellThemeId = (typeof SHELL_THEME_IDS)[number];

/** A look that actually paints the shell. */
export type ShellLookId = Exclude<ShellThemeId, "auto">;

/** Dark (Lime Industrial) for everyone on first load: new shops, new phones, junk values (Eric, 2026-10-02). Auto is opt-in. */
export const DEFAULT_SHELL_THEME: ShellThemeId = "ink";

/** Auto falls back to this look until it knows better. */
export const DEFAULT_SHELL_LOOK: ShellLookId = "ink";

export const SHELL_STORAGE_KEY = "jc-shell-theme-v2";

/**
 * Looks that were removed (Standard Dark, Color, Harbor, Steel, Grove, Dusk) and old aliases.
 * Anyone saved on a removed look moves to Dark (Lime Industrial). "white" was only ever another name for Light.
 */
const LEGACY_SHELL_THEMES: Record<string, ShellThemeId> = {
  white: "light",
  dark: "ink",
  color: "ink",
  workflow: "ink",
  field: "ink",
  shop: "ink",
  night: "ink",
  "harbor-night": "ink",
  "harbor-day": "ink",
  "signal-night": "ink",
  "signal-day": "ink",
  "grove-night": "ink",
  "grove-day": "ink",
  "dusk-night": "ink",
  "dusk-day": "ink",
};

export type LayoutPalette = {
  bg: string;
  card: string;
  ink: string;
  muted: string;
  accent: string;
  accentInk: string;
  line: string;
};

export type ShellTheme = {
  id: ShellLookId;
  name: string;
  label: string;
  blurb: string;
  line: string;
  tint: number;
  canvas: "dark" | "light";
  wash: boolean;
  invertedButtons: boolean;
  palette?: LayoutPalette;
};

function contrastRatio(a: string, b: string) {
  const lum = (hex: string) => {
    const n = hex.replace("#", "");
    const ch = [0, 2, 4].map((index) => {
      const channel = parseInt(n.slice(index, index + 2), 16) / 255;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const left = lum(a);
  const right = lum(b);
  const [hi, lo] = left > right ? [left, right] : [right, left];
  return (hi + 0.05) / (lo + 0.05);
}

/** Body type at least 7:1. Muted type and button type at least 4.5:1. */
export function paletteReadable(palette: LayoutPalette) {
  return (
    contrastRatio(palette.ink, palette.bg) >= 7 &&
    contrastRatio(palette.ink, palette.card) >= 7 &&
    contrastRatio(palette.muted, palette.bg) >= 4.5 &&
    contrastRatio(palette.muted, palette.card) >= 4.5 &&
    contrastRatio(palette.accentInk, palette.accent) >= 4.5
  );
}

/** The looks. Auto picks between them; the picker lists Auto first (SHELL_THEME_CHOICES). */
export const SHELL_THEMES: readonly ShellTheme[] = [
  {
    // Was "Color-Coordinated Ink". The id stays "ink" so phones and shops saved on Ink open on this skin.
    id: "ink",
    name: "Lime Industrial",
    label: "Lime Industrial",
    blurb: "Brushed black page, charcoal plates with a thin neon-lime edge, gold metadata, safety-orange actions.",
    line: "Brushed black, lime edges, orange actions.",
    tint: 0.22,
    canvas: "dark",
    wash: false,
    invertedButtons: false,
    palette: {
      bg: "#0A0A0A",
      card: "#161616",
      ink: "#F5F5F5",
      muted: "#D6B85A",
      accent: "#B2FF00",
      accentInk: "#0A0A0A",
      line: "#9EFF00",
    },
  },
  {
    id: "light",
    name: "Light",
    label: "Light",
    blurb: "Crisp white canvas, light gray cards, plain white buttons with dark edges and bold black type. No wash, no glow.",
    line: "Clean white canvas, dark type.",
    tint: 0,
    canvas: "light",
    wash: false,
    invertedButtons: true,
  },
  {
    // Eric's palette picks (2026-10-03): three new skins from his color boards.
    id: "midnight",
    name: "Midnight",
    label: "Midnight",
    blurb: "Deep teal-black page, dark slate cards, purple accent glow.",
    line: "Dark teal and purple.",
    tint: 0.18,
    canvas: "dark",
    wash: false,
    invertedButtons: false,
    palette: {
      bg: "#0d1b1e",
      card: "#16282c",
      ink: "#e8f0f0",
      muted: "#8a9a9a",
      accent: "#6c5ce7",
      accentInk: "#0d1b1e",
      line: "#2d4a4f",
    },
  },
  {
    id: "ember",
    name: "Ember",
    label: "Ember",
    blurb: "Warm dark page, bronze cards, gold and rust accents.",
    line: "Warm dark with gold and rust.",
    tint: 0.18,
    canvas: "dark",
    wash: false,
    invertedButtons: false,
    palette: {
      bg: "#1a1512",
      card: "#2a221c",
      ink: "#f5efe6",
      muted: "#c9a227",
      accent: "#e07a3f",
      accentInk: "#1a1512",
      line: "#5a4a3a",
    },
  },
  {
    id: "sage",
    name: "Sage",
    label: "Sage",
    blurb: "Soft sage canvas, white cards, muted green accents.",
    line: "Soft greens, calm and clean.",
    tint: 0,
    canvas: "light",
    wash: false,
    invertedButtons: true,
    palette: {
      bg: "#f0f0e8",
      card: "#ffffff",
      ink: "#2a2e2a",
      muted: "#8a9a7a",
      accent: "#7a9a7a",
      accentInk: "#ffffff",
      line: "#d0d8c8",
    },
  },
] as const;

export type ShellThemeChoice = { id: ShellThemeId; label: string; line: string };

/** The theme buttons in the picker, in order. */
export const SHELL_THEME_CHOICES: readonly ShellThemeChoice[] = [
  { id: "auto", label: "Auto", line: "Light when it's bright out, Lime Industrial when it's dark." },
  { id: "ink", label: "Lime Industrial", line: "Always Lime Industrial." },
  { id: "light", label: "Light", line: "Always Light." },
  { id: "midnight", label: "Midnight", line: "Dark teal and purple." },
  { id: "ember", label: "Ember", line: "Warm dark with gold and rust." },
  { id: "sage", label: "Sage", line: "Soft greens, calm and clean." },
] as const;

export const WORKFLOW_STEPS = [
  { id: 1, key: "lead", label: "New Lead Call", pulse: "#dc2626", rgb: "220, 38, 38" },
  { id: 2, key: "estimate", label: "Schedule Estimate", pulse: "#f97316", rgb: "249, 115, 22" },
  { id: 3, key: "schedule", label: "Assign Crew and Materials", pulse: "#eab308", rgb: "234, 179, 8" },
  { id: 4, key: "active", label: "Active on Job", pulse: "#4ade80", rgb: "74, 222, 128" },
  { id: 5, key: "pay", label: "Invoice Paid", pulse: "#166534", rgb: "22, 101, 52" },
  { id: 6, key: "archive", label: "Finished Archive", pulse: "#94a3b8", rgb: "148, 163, 184" },
] as const;

/** Job pipeline pages map onto the six visual workflow steps. Dock tabs follow the nearest step. */
export const WORKFLOW_STEP_FOR_PATH: Record<string, (typeof WORKFLOW_STEPS)[number]["id"]> = {
  command: 1,
  lead: 1,
  setup: 1,
  gate: 1,
  estimate: 2,
  crew: 3,
  schedule: 3,
  active: 4,
  field: 4,
  work: 4,
  pay: 5,
  invoice: 5,
  company: 6,
  archive: 6,
};

export function workflowStepForPath(path: string): (typeof WORKFLOW_STEPS)[number]["id"] {
  return WORKFLOW_STEP_FOR_PATH[path] || 1;
}

export function parseShellTheme(value: string | null | undefined): ShellThemeId {
  const id = (value || "").trim().toLowerCase();
  if (SHELL_THEME_IDS.includes(id as ShellThemeId)) return id as ShellThemeId;
  return LEGACY_SHELL_THEMES[id] || DEFAULT_SHELL_THEME;
}

/** The look for a saved id. "auto" (or anything unknown) gives the default look; resolve Auto first. */
export function shellThemeById(id: string | null | undefined): ShellTheme {
  const parsed = parseShellTheme(id);
  return SHELL_THEMES.find((theme) => theme.id === parsed) || SHELL_THEMES.find((theme) => theme.id === DEFAULT_SHELL_LOOK)!;
}

export function readStoredShellTheme(): ShellThemeId | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SHELL_STORAGE_KEY);
    return raw ? parseShellTheme(raw) : null;
  } catch {
    return null;
  }
}

export function persistShellTheme(id: ShellThemeId) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SHELL_STORAGE_KEY, id);
  } catch {
    /* private mode */
  }
}
