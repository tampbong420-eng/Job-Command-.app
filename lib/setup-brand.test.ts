import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const setup = readFileSync(new URL("../components/command/CompanySetup.tsx", import.meta.url), "utf8");
const desk = readFileSync(new URL("../components/command/EmployeeWorkspace.tsx", import.meta.url), "utf8");
const lead = readFileSync(new URL("../components/command/LeadStage.tsx", import.meta.url), "utf8");
const estimate = readFileSync(new URL("../components/command/EstimateStage.tsx", import.meta.url), "utf8");
const yellow = readFileSync(new URL("../components/command/YellowPrepStage.tsx", import.meta.url), "utf8");
const home = readFileSync(new URL("../components/command/EmployeeHome.tsx", import.meta.url), "utf8");
const onboard = readFileSync(new URL("../components/command/EmployeeOnboard.tsx", import.meta.url), "utf8");
const payroll = readFileSync(new URL("../components/command/PayrollSetup.tsx", import.meta.url), "utf8");
const payrollLib = readFileSync(new URL("./payroll.ts", import.meta.url), "utf8");
const burst = readFileSync(new URL("../components/command/LogoBurst.tsx", import.meta.url), "utf8");
const themeHook = readFileSync(new URL("../hooks/use-shell-theme.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("start-up setup shows Eric's Job Command logo; the look picker moved to Office", () => {
  // Eric's own logo only (cut from public/job-command-logo.jpg); the old drawn shield SVGs are gone.
  for (const file of ["job-command-lockup@2x.webp", "job-command-lockup-cut@2x.webp", "job-command-lockup.png", "jc-shield@2x.webp", "jc-shield.png"]) {
    assert.equal(existsSync(new URL(`../public/brand/${file}`, import.meta.url)), true, file);
  }
  for (const gone of ["jc-shield.svg", "jc-mark.svg", "jc-mark.png"]) {
    assert.equal(existsSync(new URL(`../public/${gone}`, import.meta.url)), false, gone);
  }
  assert.match(setup, /data-setup-brand="1"/);
  assert.match(setup, /src="\/brand\/job-command-lockup-cut@2x\.webp"/);
  // Slim signup header: Eric's shield + lockup from public/brand (the wordmark file never
  // shipped, so the header uses the lockup-cut that actually exists — Eric, 2026-10-03).
  assert.match(setup, /src="\/brand\/jc-shield@2x\.webp"/);
  assert.doesNotMatch(setup, /job-command-wordmark/);
  // Signup v2: theme is deferred to Office (dark default), so no toggle or picker in signup.
  assert.doesNotMatch(setup, /data-setup-theme-toggle/);
  assert.doesNotMatch(setup, /ThemePicker/);
  assert.match(setup, /DEFAULT_SHELL_THEME/);
  assert.match(setup, /settings\.setupComplete/);
  assert.match(css, /\.setup-desk \.setup-brand/);
  assert.match(css, /\.setup-desk \.setup-theme-toggle/);
});

test("setup theme toggle and shield stay off payroll, pipeline, and crew screens", () => {
  // EmployeeWorkspace also renders the gate/setup/onboarding shell. Its small shield lives only
  // in CommandHeader, and CommandHeader is drawn only on those pre-desk screens.
  const headerStart = desk.indexOf("function CommandHeader(");
  const headerEnd = desk.indexOf("\nfunction ", headerStart + 1);
  assert.ok(headerStart > 0 && headerEnd > headerStart);
  const header = desk.slice(headerStart, headerEnd);
  const deskScreens = desk.slice(0, headerStart) + desk.slice(headerEnd);
  // Eric 2026-10-02: the JC shield lives on Jobs only; the gate/setup header is bell | pill | mic.
  assert.doesNotMatch(header, /jc-shield/);
  assert.match(header, /data-top-trio="1"/);
  const headerUses = [...desk.matchAll(/<AppShell path="(\w+)"[^>]*>\s*<CommandHeader /g)].map((hit) => hit[1]);
  assert.equal(headerUses.length, [...desk.matchAll(/<CommandHeader /g)].length);
  for (const path of headerUses) assert.ok(["gate", "setup"].includes(path), path);
  for (const source of [lead, estimate, yellow, home, onboard, payroll, payrollLib, deskScreens]) {
    assert.doesNotMatch(source, /jc-shield/);
    assert.doesNotMatch(source, /data-setup-brand/);
    assert.doesNotMatch(source, /data-setup-theme-toggle/);
    assert.doesNotMatch(source, /job-command-logo/);
  }
  assert.match(burst, /IntroBoot/);
  assert.doesNotMatch(burst, /jc-shield/);
  assert.doesNotMatch(burst, /job-command-logo/);
  assert.match(desk, /ThemePicker/);
  assert.match(desk, /data-theme-settings/);
});

test("setup prefers the saved dark default over leftover localStorage", () => {
  assert.match(
    themeHook,
    /parseShellTheme\(initial \|\| \(typeof window !== "undefined" \? readStoredShellTheme\(\) : null\) \|\| DEFAULT_SHELL_THEME\)/
  );
  const pulseHits = [...css.matchAll(/animation:\s*taskPulse 4s infinite ease-in-out/g)];
  assert.equal(pulseHits.length, 3);
  assert.match(css, /\.btn-next-action,\s*\.next-action-button \{[^}]*background-color:\s*#c9a227/);
  assert.match(css, /#c6f000/i);
});

test("signup multiple-choice buttons stay clickable and extra looks stay hidden", () => {
  const picker = readFileSync(new URL("../components/command/ThemePicker.tsx", import.meta.url), "utf8");
  const intro = readFileSync(new URL("../components/command/IntroBoot.tsx", import.meta.url), "utf8");
  const introCss = readFileSync(new URL("../components/command/IntroBoot.module.css", import.meta.url), "utf8");
  const gateFlag = readFileSync(new URL("./pin-gate.ts", import.meta.url), "utf8");
  assert.match(setup, /onClick=\{\(\) => setState\(\(value\) => withTrade\(value, item\.id\)\)\}/);
  assert.match(setup, /onClick=\{\(\) => pickSize\(item\.id\)\}/);
  // PIN defaults to the last 4 of the cell; "change" opens the field (never required).
  assert.match(setup, /Office PIN/);
  assert.match(setup, /pinFor\(state\)/);
  assert.match(setup, /data-signup-trial="1"/);
  assert.match(setup, /skipLabel\(step\)/);
  assert.match(setup, /nextLabel\(step, state\)/);
  // $1 card check before the trial (Eric, Oct 2 2026): no more "No card today".
  assert.match(setup, /\$1 card check, returned right away/);
  assert.doesNotMatch(setup, /No card today/);
  assert.match(setup, /renews each month \(or year\) until/);
  assert.doesNotMatch(setup, /placeholder=/);
  assert.match(css, /\.setup-desk \.choice-stack button/);
  assert.match(css, /\.setup-desk \.choice-stack button[^}]*pointer-events:\s*auto/);
  assert.match(css, /\.setup-desk \.setup-theme-toggle button[^}]*pointer-events:\s*auto/s);
  assert.match(css, /button\[data-theme-id="color"\]/);
  // Ink became Lime Industrial (2026-10-02), a real choice, so only Color stays hidden.
  assert.doesNotMatch(css, /button\[data-theme-id="ink"\]/);
  // Only Auto, Lime Industrial, and Light are offered (2026-10-02), labeled without "Theme N".
  assert.match(picker, /SHELL_THEME_CHOICES\.map/);
  assert.doesNotMatch(picker, /Theme \{index \+ 1\}/);
  assert.match(picker, /data-theme-picker/);
  assert.match(intro, /pointerEvents: "none"/);
  assert.match(introCss, /pointer-events:\s*none/);
  assert.match(desk, />\s*Sign out\s*</);
  assert.doesNotMatch(gateFlag, /PIN_GATE_ENABLED = false/);
  assert.match(gateFlag, /NODE_ENV === "development"/);
  const pulseHits = [...css.matchAll(/animation:\s*taskPulse 4s infinite ease-in-out/g)];
  assert.equal(pulseHits.length, 3);
});
