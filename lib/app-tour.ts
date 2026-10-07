/** Isolated first-run shop tour. Overlay only — never writes jobs, clients, or crew. */

export const APP_TOUR_KEY = "job_command_seen_app_tour";
export const APP_TOUR_COUNT_KEY = "job_command_tour_open_count";
export const APP_TOUR_MAX_AUTO_SHOWS = 15;
export const APP_TOUR_REPLAY_EVENT = "job-command-replay-tour";

export type AppTourStep = {
  id: string;
  kicker: string;
  title: string;
  body: string;
  /** Tab to open before pointing (Eric, 2026-10-03): the tour goes to the exact spot. */
  tab?: "crew" | "command" | "company";
  /** CSS selector for the orange arrow to point at. */
  target: string;
};

export const APP_TOUR_INTEGRITY =
  "This tour never writes, deletes, or overwrites jobs, clients, crew, hours, or pay.";

export const APP_TOUR_OFFICE_STEPS: readonly AppTourStep[] = [
  {
    id: "control",
    kicker: "Control",
    title: "Your jobs live here",
    body: "Control opens the jobs. Swipe between clients, or tap the arrows above the pipeline. Each colored bar is one stage of the job.",
    tab: "command",
    target: "[data-dock=\"control\"]",
  },
  {
    id: "arrows",
    kicker: "Jobs",
    title: "Flip between jobs",
    body: "These arrows move between your jobs. They sit right above the pipeline so your thumb is already there.",
    tab: "command",
    target: ".job-tumbler-nav",
  },
  {
    id: "pipeline",
    kicker: "Pipeline",
    title: "Six colors, one job",
    body: "Red is the first call. Orange is the estimate. Yellow assigns crew. Green is on site. Dark green is paid. Slate is finished. Tap any bar to open that stage — nothing is locked.",
    tab: "command",
    target: ".stage-rail",
  },
  {
    id: "guide",
    kicker: "Guide",
    title: "The next thing",
    body: "Hit the green Guide button. It jumps to the next thing that needs you and tells you what to do. Hit it again for the next one. When everything's caught up, it rests.",
    target: "[data-dock=\"guide\"]",
  },
  {
    id: "crew",
    kicker: "Roster",
    title: "Your people",
    body: "Roster holds your crew: profiles, pay, schedules, and their personal invite links. Field phones clock in and out from their own card.",
    tab: "crew",
    target: "[data-dock=\"crew\"]",
  },
  {
    id: "office",
    kicker: "Office",
    title: "Money and settings",
    body: "Office is payments, billing, invites, and legal. Year-end books live here too. Replay this tour any time from Office — it never touches live data.",
    tab: "company",
    target: "[data-dock=\"office\"]",
  },
  {
    id: "guide-deep",
    kicker: "Guide",
    title: "Guide does the thinking",
    body: "Guide doesn't just jump — it finds the single most urgent thing across all your jobs. Tap the highlighted item to do it, or tap it again to skip to the next. It's your foreman in your pocket.",
    tab: "command",
    target: "[data-dock=\"guide\"]",
  },
  {
    id: "job-card",
    kicker: "Job card",
    title: "Everything on one card",
    body: "Each job card shows the client, the cover photo, and the pipeline. Swipe the photo to flip through all the job's pictures. Tap the client name for details, notes, and documents.",
    tab: "command",
    target: ".job-cover.hero",
  },
  {
    id: "stages-deep",
    kicker: "Stages",
    title: "Work the stages in order",
    body: "New Lead → Estimate → Schedule → On Site → Invoice → Done. Each stage has its own checklist. Guide walks you through them, but you can tap any stage any time — nothing is locked.",
    tab: "command",
    target: ".stage-rail",
  },
] as const;

export const APP_TOUR_CREW_STEPS: readonly AppTourStep[] = [
  {
    id: "control",
    kicker: "Control",
    title: "Today’s jobs",
    body: "The Control button opens the jobs on this phone. Open any stage — nothing is locked.",
    tab: "command",
    target: "[data-dock=\"control\"]",
  },
  {
    id: "crew",
    kicker: "Roster",
    title: "Your day",
    body: "The Roster button opens your card: clock in, hours, directions, and the schedule. Office pay and settings stay off this login.",
    tab: "crew",
    target: "[data-dock=\"crew\"]",
  },
  {
    id: "guide",
    kicker: "Guide",
    title: "The next thing",
    body: "Hit the green Guide button. It opens your next clock-in and tells you which job. When nothing is left, it rests.",
    target: "[data-dock=\"guide\"]",
  },
] as const;

export function hasSeenAppTour(): boolean {
  if (typeof window === "undefined") return true;
  try {
    // Show the tour on the first 15 app opens (Eric, 2026-10-05)
    const count = parseInt(window.localStorage.getItem(APP_TOUR_COUNT_KEY) || "0", 10);
    return count >= APP_TOUR_MAX_AUTO_SHOWS;
  } catch {
    return true;
  }
}

export function markAppTourSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(APP_TOUR_KEY, "true");
  } catch {
    /* private mode */
  }
}

/** Increment the tour open counter. Call once per app open. */
export function incrementTourOpenCount(): void {
  if (typeof window === "undefined") return;
  try {
    const count = parseInt(window.localStorage.getItem(APP_TOUR_COUNT_KEY) || "0", 10);
    window.localStorage.setItem(APP_TOUR_COUNT_KEY, String(count + 1));
  } catch {
    /* private mode */
  }
}

/** Reset the tour counter (for testing). */
export function resetTourOpenCount(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(APP_TOUR_COUNT_KEY);
    window.localStorage.removeItem(APP_TOUR_KEY);
  } catch {
    /* private mode */
  }
}

export function requestAppTourReplay(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(APP_TOUR_REPLAY_EVENT));
}

export function tourStepsForRole(field: boolean) {
  return field ? APP_TOUR_CREW_STEPS : APP_TOUR_OFFICE_STEPS;
}
