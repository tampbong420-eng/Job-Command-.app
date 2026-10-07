import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SWIPE_HINT_KEY } from "./swipe-hint";

test("first-run swipe hint is a one-shot overlay on the job tumbler", () => {
  const hint = readFileSync(new URL("../components/command/SwipeHint.tsx", import.meta.url), "utf8");
  const desk = readFileSync(new URL("../components/command/CommandCenter.tsx", import.meta.url), "utf8");
  assert.equal(SWIPE_HINT_KEY, "job_command_seen_swipe_hint");
  assert.match(hint, /data-swipe-hint="1"/);
  assert.match(hint, /Swipe for jobs/);
  assert.match(hint, /hasSeenSwipeHint/);
  assert.match(hint, /markSwipeHintSeen/);
  assert.match(hint, /onClick=\{dismiss\}/);
  assert.match(hint, /onPointerUp/);
  assert.match(desk, /SwipeHint/);
  assert.match(desk, /deck\.length \? <SwipeHint \/> : null/);
});

test("swipe hint stays off payroll, schedules, pipeline, and intro", () => {
  const lead = readFileSync(new URL("../components/command/LeadStage.tsx", import.meta.url), "utf8");
  const estimate = readFileSync(new URL("../components/command/EstimateStage.tsx", import.meta.url), "utf8");
  const yellow = readFileSync(new URL("../components/command/YellowPrepStage.tsx", import.meta.url), "utf8");
  const home = readFileSync(new URL("../components/command/EmployeeHome.tsx", import.meta.url), "utf8");
  const payroll = readFileSync(new URL("./payroll.ts", import.meta.url), "utf8");
  const schedule = readFileSync(new URL("./schedule.ts", import.meta.url), "utf8");
  const intro = readFileSync(new URL("../components/command/IntroBoot.tsx", import.meta.url), "utf8");
  const burst = readFileSync(new URL("../components/command/LogoBurst.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  for (const source of [lead, estimate, yellow, home, payroll, schedule, intro, burst]) {
    assert.doesNotMatch(source, /SwipeHint/);
    assert.doesNotMatch(source, /job_command_seen_swipe_hint/);
    assert.doesNotMatch(source, /data-swipe-hint/);
  }
  assert.doesNotMatch(css, /data-swipe-hint/);
  assert.doesNotMatch(css, /SwipeHint/);
  const pulseHits = [...css.matchAll(/animation:\s*taskPulse 4s infinite ease-in-out/g)];
  assert.equal(pulseHits.length, 3);
});
