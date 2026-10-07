import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  HELP_HOLD_MS,
  HELP_MODE_BLURB,
  HELP_MODE_EVENT,
  HELP_MODE_KEY,
  helpCopyFor,
  helpLabelOf,
  isHelpSkipTarget,
} from "./help-mode";

test("help mode is a hold overlay that never writes live shop data", () => {
  const hook = readFileSync(new URL("../hooks/use-help-mode.ts", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../components/command/HelpMode.tsx", import.meta.url), "utf8");
  const desk = readFileSync(new URL("../components/command/EmployeeWorkspace.tsx", import.meta.url), "utf8");
  assert.equal(HELP_MODE_KEY, "job_command_help_mode");
  assert.equal(HELP_MODE_EVENT, "job-command-help-mode");
  assert.equal(HELP_HOLD_MS, 480);
  assert.match(HELP_MODE_BLURB, /never changes jobs/);
  assert.match(hook, /persistHelpMode/);
  assert.match(ui, /Help Mode/);
  assert.match(ui, /data-help-tip/);
  assert.match(ui, /data-help-toggle/);
  assert.match(desk, /HelpModeHost/);
  assert.match(desk, /HelpModeToggle/);
  assert.doesNotMatch(ui, /prisma/);
  assert.doesNotMatch(hook, /prisma/);
  const button = { getAttribute: () => "Command", innerText: "Command", textContent: "Command" } as unknown as HTMLElement;
  assert.equal(helpLabelOf(button), "Command");
  assert.equal(helpCopyFor(button).title, "Command");
});

test("help mode stays off payroll, pipeline cards, signup, and intro", () => {
  const lead = readFileSync(new URL("../components/command/LeadStage.tsx", import.meta.url), "utf8");
  const estimate = readFileSync(new URL("../components/command/EstimateStage.tsx", import.meta.url), "utf8");
  const yellow = readFileSync(new URL("../components/command/YellowPrepStage.tsx", import.meta.url), "utf8");
  const home = readFileSync(new URL("../components/command/EmployeeHome.tsx", import.meta.url), "utf8");
  const setup = readFileSync(new URL("../components/command/CompanySetup.tsx", import.meta.url), "utf8");
  const payroll = readFileSync(new URL("./payroll.ts", import.meta.url), "utf8");
  const schedule = readFileSync(new URL("./schedule.ts", import.meta.url), "utf8");
  const intro = readFileSync(new URL("../components/command/IntroBoot.tsx", import.meta.url), "utf8");
  const globals = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  for (const source of [lead, estimate, yellow, home, setup, payroll, schedule, intro]) {
    assert.doesNotMatch(source, /HelpMode/);
    assert.doesNotMatch(source, /job_command_help_mode/);
    assert.doesNotMatch(source, /data-help-tip/);
  }
  assert.doesNotMatch(globals, /data-help-tip/);
  assert.doesNotMatch(globals, /HelpMode/);
  const pulseHits = [...globals.matchAll(/animation:\s*taskPulse 4s infinite ease-in-out/g)];
  assert.equal(pulseHits.length, 3);
  assert.equal(isHelpSkipTarget(null), true);
});
