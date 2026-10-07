/** Isolated Help Mode. Overlay tips only — never writes jobs, clients, crew, or hours. */

export const HELP_MODE_KEY = "job_command_help_mode";
export const HELP_MODE_EVENT = "job-command-help-mode";
export const HELP_HOLD_MS = 480;

export const HELP_MODE_BLURB =
  "Hold a button, card, or icon to see what it does. Taps still work. Help Mode never changes jobs, clients, crew, or pay.";

const SKIP_SELECTOR = [
  "input",
  "textarea",
  "select",
  "option",
  "label",
  "[data-help-skip]",
  "[data-app-tour]",
  "[data-intro-boot]",
  "[data-swipe-hint]",
  "[data-help-tip]",
  ".talk-form",
  ".pay-knob",
  ".pay-track",
  "[aria-label='Listen']",
  "[aria-label='Answer']",
].join(",");

const TARGET_SELECTOR = [
  "button",
  "[role='button']",
  "[role='switch']",
  "a[href]",
  "[data-edge]",
  "[data-stage-dest]",
  ".dock-btn",
  ".pipeline-btn",
  ".stage-bar",
  ".lock-button",
  ".ghost-action",
  ".alert-hit",
  ".job-tumbler-face",
  ".cal-day",
  ".choice-stack button",
  ".choice-row button",
].join(",");

const COPY: Array<{ test: RegExp; title: string; body: string }> = [
  { test: /^guide$/i, title: "Guide", body: "Opens the next thing you can fill in and says what to do. Hit it again for the next one. It goes dead when the shop is caught up." },
  { test: /^control$/i, title: "Control", body: "Jobs. The red center button. Swipe between clients and open a stage." },
  { test: /^office$/i, title: "Office", body: "Payments and settings. Billing, invites, look, and legal." },
  { test: /^command$/i, title: "Command", body: "Job tumbler. Swipe between clients. Colored bars open each pipeline stage." },
  { test: /^crew$/i, title: "Crew", body: "Folders for pay, schedule, profiles, and closed jobs. Field phones open here first." },
  { test: /^schedule$/i, title: "Schedule", body: "Month calendar plus tap-to-edit hour rows. Busy crew stays gray." },
  { test: /^pay$/i, title: "Pay", body: "This period’s hours and check. Office only — crew never sees Pay." },
  { test: /^company$/i, title: "Company", body: "Look, billing, invites, legal, this tour, and Help Mode. Shop settings." },
  { test: /sign out/i, title: "Sign out", body: "Clears this phone’s office session. It does not delete jobs or crew." },
  { test: /alert/i, title: "Alerts", body: "Dispatch, signed bids, and quiet-hour notes. Badge count is unread." },
  { test: /replay app tutorial/i, title: "Replay App Tutorial", body: "Runs the shop walkthrough again. Overlay only — live data stays put." },
  { test: /help mode/i, title: "Help Mode", body: "When on, hold a control to read it. Turn it off and the app behaves as usual." },
  { test: /^(dark|light)$/i, title: "Look", body: "Dark is the night canvas. Light is the day canvas. Extra looks stay hidden." },
  { test: /clock in/i, title: "Clock in", body: "Starts paid time for this person on today’s stop." },
  { test: /clock out/i, title: "Clock out", body: "Ends the shift and writes hours. Lunch pauses stay unpaid." },
  { test: /next/i, title: "Next", body: "Moves forward. On a job, gold Next is the current pipeline action." },
  { test: /back/i, title: "Back", body: "Returns one step. Nothing is deleted." },
  { test: /skip/i, title: "Skip", body: "Leaves this step blank and continues. You can fill it later." },
  { test: /new job|add job|\+/i, title: "New job", body: "Opens a job on a filed client. Search Harbor (or any client) and tap once." },
  { test: /lead|new lead|call/i, title: "New Lead Call", body: "Red stage. First call, name, phone, and property." },
  { test: /estimate|orange/i, title: "Schedule Estimate", body: "Orange stage. Scope, photos, price, and send to the client." },
  { test: /assign crew|yellow|materials/i, title: "Assign crew", body: "Yellow stage. Who, start date, days on site, materials." },
  { test: /active|clock|on site/i, title: "Active on job", body: "Green stage. Who is on site, live hours, map, weather." },
  { test: /invoice|paid/i, title: "Invoice Paid", body: "Dark green. Compile the bill and send the card link." },
  { test: /archive|finished/i, title: "Finished Archive", body: "Slate stage. Closed jobs. Read-only history." },
  { test: /set pay period/i, title: "Set pay period", body: "Week vs two weeks and which weekday a period starts." },
  { test: /run setup again/i, title: "Run setup again", body: "Reopens company setup. It does not wipe jobs already on the board." },
];

export function helpModeEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(HELP_MODE_KEY) === "true";
  } catch {
    return false;
  }
}

export function persistHelpMode(on: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HELP_MODE_KEY, on ? "true" : "false");
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new Event(HELP_MODE_EVENT));
}

export function isHelpSkipTarget(node: EventTarget | null) {
  if (!node) return true;
  if (typeof Element === "undefined") return true;
  if (!(node instanceof Element)) return true;
  return Boolean(node.closest(SKIP_SELECTOR));
}

export function helpControlFrom(node: EventTarget | null): HTMLElement | null {
  if (!node || typeof Element === "undefined" || typeof HTMLElement === "undefined") return null;
  if (!(node instanceof Element) || isHelpSkipTarget(node)) return null;
  const hit = node.closest(TARGET_SELECTOR);
  return hit instanceof HTMLElement ? hit : null;
}

export function helpLabelOf(el: HTMLElement) {
  return (
    el.getAttribute("aria-label") ||
    el.getAttribute("title") ||
    el.getAttribute("data-edge") ||
    el.getAttribute("data-stage-dest") ||
    el.innerText ||
    el.textContent ||
    ""
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function helpCopyFor(el: HTMLElement): { title: string; body: string } {
  const label = helpLabelOf(el);
  const match = COPY.find((row) => row.test.test(label));
  if (match) return { title: match.title, body: match.body };
  if (label) {
    return {
      title: label.slice(0, 42),
      body: "Shop control. A normal tap still runs it. Help Mode never writes jobs, clients, or hours.",
    };
  }
  return {
    title: "Shop control",
    body: "Hold a button or icon to read it. Taps still work. Nothing is saved from this card.",
  };
}
