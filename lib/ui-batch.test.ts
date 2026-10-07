import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

// Eric's UI batch, 2026-10-02 (top bar, red day, hold hint, orange swipe labels, white buttons,
// job arrows on top, Edit/New gap, app link on each profile, plan boxes).
const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

test("top bar: bell left, DARK|LIGHT center, the one mic portals into the right slot", () => {
  const ws = read("components/command/EmployeeWorkspace.tsx");
  assert.equal([...ws.matchAll(/data-one-mic-slot="1"/g)].length, 2, "desk corner + gate/setup header");
  const mic = read("components/command/OneMic.tsx");
  assert.match(mic, /querySelector<HTMLElement>\("\[data-one-mic-slot\]"\)/);
  assert.match(mic, /createPortal/);
  assert.match(mic, /slot \? " in-bar" : ""/);
  const alerts = read("components/command/AlertCenter.tsx");
  assert.match(alerts, /<Bell\b/);
  assert.match(alerts, /alert-count/);
  const css = read("app/ui-batch.css");
  assert.match(css, /\.top-trio\b/);
  assert.match(css, /\.top-trio-center/);
});

test("selected day is solid red with a white number", () => {
  const css = read("app/ui-batch.css");
  const at = css.indexOf(".app-shell.app-shell .sched-day.selected,");
  assert.ok(at > 0);
  const rule = css.slice(at, css.indexOf("}", at));
  assert.match(rule, /\.cal-day\.selected/);
  assert.match(rule, /var\(--wb-red\)/);
  assert.match(css, /--wb-red: #dc2626;/);
  assert.match(rule, /color: #ffffff/);
  assert.match(read("app/layout.tsx"), /import "\.\/ui-batch\.css";/);
});

test("hold hint + orange swipe labels are wired into Schedule and Jobs", () => {
  const board = read("components/command/TimesheetBoard.tsx");
  assert.match(board, /Press and hold to select multiple days/);
  assert.match(board, /data-hold-hint/);
  assert.match(board, /markHoldHintDone/);
  assert.match(board, /useSwipeFlash/);
  const center = read("components/command/CommandCenter.tsx");
  assert.match(center, /useSwipeFlash/);
  const css = read("app/ui-batch.css");
  assert.match(css, /\.swipe-flash \{[^}]*background: var\(--wb-orange\)/);
  assert.match(css, /prefers-reduced-motion/);
});

test("job arrows sit inside each job card, right above the pipeline stages", () => {
  const center = read("components/command/CommandCenter.tsx");
  assert.doesNotMatch(center, /<JobTumblerNav/);
  assert.match(center, /showNav=\{false\}/);
  const card = read("components/command/JobCard.tsx");
  assert.match(card, /export function JobTumblerNav/);
  // The nav renders inside JobCard, directly before the stage rail.
  assert.match(card, /\{deck && deck\.length > 1 && onDeckIndex \? \(\s*<JobTumblerNav/);
  assert.ok(card.indexOf("<StageRail") > card.indexOf("deckIndex - 1"));
});

test("the employee app link lives on each person's profile, not in Office settings", () => {
  const ws = read("components/command/EmployeeWorkspace.tsx");
  const at = ws.indexOf("<IdentityEditor employee={employee} live={live} />");
  assert.ok(at > 0);
  assert.match(ws.slice(at, at + 400), /<CrewInviteLink key=\{`\$\{employee\.id\}-invite`\} employee=\{employee\}/);
  assert.doesNotMatch(ws, /<CrewInviteDesk /);
  const link = read("components/command/CrewInviteDesk.tsx");
  assert.match(link, /export function CrewInviteLink\(\{ employee, shop \}/);
  assert.match(link, /Make link/);
  assert.match(link, /Copy link/);
  assert.match(link, /data-crew-invite-for=\{employee\.id\}/);
  assert.doesNotMatch(link, /card-label">Settings · Employee sign-in/);
  assert.match(link, /card-label">App link for/);
  assert.doesNotMatch(link, /last four of their phone/);
});

test("plans are big boxes with big numbers", () => {
  const billing = read("components/command/BillingDesk.tsx");
  assert.match(billing, /className="plan-boxes"/);
  assert.match(billing, /plan-box-num/);
  const css = read("app/ui-batch.css");
  assert.match(css, /\.plan-box-num \{[^}]*font: 900 36px/);
});

test("buttons are plain white with a dark edge in both looks", () => {
  const css = read("app/ui-batch.css");
  assert.match(css, /background: #ffffff/);
  const g = read("app/globals.css");
  assert.match(g, /--btn-fill: #fff(fff)?;/);
  assert.doesNotMatch(read("lib/shell-theme.ts"), /solid black buttons/);
});
