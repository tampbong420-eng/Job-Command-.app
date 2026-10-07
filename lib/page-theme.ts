export const PAGE_PATHS = [
  "command",
  "crew",
  "schedule",
  "pay",
  "company",
  "lead",
  "estimate",
  "active",
  "field",
  "work",
  "invoice",
  "archive",
  "setup",
  "gate",
] as const;

export type PagePath = (typeof PAGE_PATHS)[number];

export type JobStageKey = "lead" | "estimate" | "schedule" | "active" | "field" | "invoice" | "archive";

export type PageTheme = {
  edge: string;
  glow: string;
  ink: string;
};

export const SHOCK_BLUE = "#EFEFEF";

export const PAGE_THEME: Record<PagePath, PageTheme> = {
  command: { edge: "#dc2626", glow: "#dc262655", ink: "#f87171" },
  crew: { edge: "#f97316", glow: "#f9731655", ink: "#fdba74" },
  schedule: { edge: "#eab308", glow: "#eab30855", ink: "#facc15" },
  pay: { edge: "#14532d", glow: "#14532d88", ink: "#86efac" },
  company: { edge: "#64748b", glow: "#64748b55", ink: "#cbd5e1" },
  lead: { edge: "#dc2626", glow: "#dc262655", ink: "#fca5a5" },
  estimate: { edge: "#f97316", glow: "#f9731655", ink: "#fdba74" },
  active: { edge: "#4ade80", glow: "#4ade8055", ink: "#86efac" },
  field: { edge: "#4ade80", glow: "#4ade8055", ink: "#86efac" },
  work: { edge: "#4ade80", glow: "#4ade8055", ink: "#86efac" },
  invoice: { edge: "#166534", glow: "#16653488", ink: "#bbf7d0" },
  archive: { edge: "#27272a", glow: "#09090b99", ink: "#a1a1aa" },
  setup: { edge: "#dc2626", glow: "#dc262655", ink: "#f87171" },
  gate: { edge: "#dc2626", glow: "#dc262655", ink: "#f87171" },
};

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Command pipeline bars → isolated job stage. Never share a destination. */
export const STAGE_BUTTON_ROUTE = {
  lead: "lead",
  estimate: "estimate",
  schedule: "schedule",
  active: "active",
  pay: "invoice",
  archive: "archive",
} as const satisfies Record<string, JobStageKey>;

export function stagePathFor(stepKey: string): JobStageKey {
  return (STAGE_BUTTON_ROUTE as Record<string, JobStageKey>)[stepKey] || "lead";
}

/** Completing a stage opens the next isolated screen. Archive has no successor. */
export const STAGE_ADVANCE = {
  lead: "estimate",
  estimate: "schedule",
  schedule: "active",
  active: "invoice",
  invoice: "archive",
  archive: null,
  field: null,
} as const satisfies Record<JobStageKey, JobStageKey | null>;

export function nextStageAfter(key: JobStageKey): JobStageKey | null {
  return STAGE_ADVANCE[key];
}

export function pagePathFor(input: {
  gate?: boolean;
  setup?: boolean;
  jobStage?: JobStageKey | null;
  folder?: boolean;
  folderTab?: "details" | "estimate" | "work" | "invoice" | null;
  tab?: "command" | "crew" | "schedule" | "pay" | "company";
}): PagePath {
  if (input.gate) return "gate";
  if (input.setup) return "setup";
  if (input.jobStage) return input.jobStage;
  if (input.folder) return input.tab || "command";
  return input.tab || "command";
}

export function themeFromEdgeToken(token: string | null | undefined): PageTheme | null {
  if (!token) return null;
  if (token in PAGE_THEME) return PAGE_THEME[token as PagePath];
  if (HEX.test(token)) return { edge: token, glow: `${token}55`, ink: token };
  return null;
}

export function pageThemeVars(theme: PageTheme): Record<"--page-edge" | "--page-glow" | "--page-ink", string> {
  return {
    "--page-edge": theme.edge,
    "--page-glow": theme.glow,
    "--page-ink": theme.ink,
  };
}
