/**
 * Isolated start-up splash switch.
 *
 * Rollback without touching payroll, hours, schedules, or themes:
 *   1. Set INTRO_BOOT_ENABLED to false (splash never mounts), or
 *   2. Restore git tag backup/pre-intro-animation / branch cursor/pre-intro-backup-a479
 */
export const INTRO_BOOT_ENABLED = true;

/**
 * Eric's own logo (cut from public/job-command-logo.jpg, never redrawn): the steel shield rises in,
 * a lime light traces its rim, the JC powers on, one gold sheen, JOB COMMAND settles in, a lime
 * line fills, then the lockup lifts and fades into the app.
 */
export const INTRO_BOOT_MS = 2800;
export const INTRO_BOOT_SEEN = "jc-logo-splash";
/** Shield-only cut of the original artwork (transparent outside the shield), 2x for high-DPI. */
export const INTRO_BOOT_MARK = "/brand/jc-shield@2x.webp";
/** JOB COMMAND wordmark cut from the same original, its own background feathered out. */
export const INTRO_BOOT_WORDMARK = "/brand/job-command-wordmark@2x.webp?v=20261005";

/** Beat starts in ms (the CSS keyframes in IntroBoot.module.css follow these over INTRO_BOOT_MS). */
export const INTRO_BOOT_BEATS = {
  shieldIn: 0,
  trace: 400,
  powerOn: 900,
  sheen: 1200,
  wordmark: 1500,
  progress: 1950,
  exit: 2300,
  end: INTRO_BOOT_MS,
} as const;
