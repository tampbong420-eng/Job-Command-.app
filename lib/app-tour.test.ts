import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  APP_TOUR_INTEGRITY,
  APP_TOUR_KEY,
  APP_TOUR_CREW_STEPS,
  APP_TOUR_OFFICE_STEPS,
  APP_TOUR_REPLAY_EVENT,
  tourStepsForRole,
} from "./app-tour";

test("shop tutorial is an overlay walkthrough that never writes live data", () => {
  const tour = readFileSync(new URL("../components/command/AppTour.tsx", import.meta.url), "utf8");
  const desk = readFileSync(new URL("../components/command/EmployeeWorkspace.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../components/command/AppTour.module.css", import.meta.url), "utf8");
  assert.equal(APP_TOUR_KEY, "job_command_seen_app_tour");
  assert.equal(APP_TOUR_REPLAY_EVENT, "job-command-replay-tour");
  assert.match(APP_TOUR_INTEGRITY, /never writes, deletes, or overwrites/);
  assert.equal(APP_TOUR_OFFICE_STEPS.length, 6);
  assert.equal(tourStepsForRole(true).length, 3);
  assert.match(tour, /data-app-tour="1"/);
  assert.match(tour, /Replay App Tutorial/);
  assert.match(tour, /markAppTourSeen/);
  assert.match(desk, /<AppTour/);
  assert.match(desk, /ReplayAppTutorial/);
  assert.match(css, /#c9a227/);
  assert.match(css, /#0d0d0d/);
  assert.doesNotMatch(tour, /prisma/);
  assert.doesNotMatch(tour, /completeOnboarding/);
  assert.doesNotMatch(tour, /MOCK_CREW/);
});

test("tutorial stays off payroll, pipeline cards, signup, and intro", () => {
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
    assert.doesNotMatch(source, /AppTour/);
    assert.doesNotMatch(source, /job_command_seen_app_tour/);
    assert.doesNotMatch(source, /data-app-tour/);
  }
  assert.doesNotMatch(globals, /data-app-tour/);
  assert.doesNotMatch(globals, /AppTour/);
  const pulseHits = [...globals.matchAll(/animation:\s*taskPulse 4s infinite ease-in-out/g)];
  assert.equal(pulseHits.length, 3);
});

test("every tour step navigates to its tab and points the orange arrow at a target", () => {
  const tour = readFileSync(new URL("../components/command/AppTour.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../components/command/AppTour.module.css", import.meta.url), "utf8");
  for (const step of [...APP_TOUR_OFFICE_STEPS, ...APP_TOUR_CREW_STEPS]) {
    assert.match(step.target, /\S/, `step ${step.id} needs a target selector`);
    if (step.tab) assert.match(step.tab, /^(crew|command|company)$/);
  }
  // The rebuilt tour drives tabs and renders the pulsing orange arrow.
  assert.match(tour, /onTab/);
  assert.match(tour, /data-testid="app-tour-arrow"/);
  assert.match(tour, /#f59e0b/);
  assert.match(css, /\.arrow/);
  assert.match(css, /tourArrowBounce/);
  assert.match(css, /\.spotlight/);
  assert.match(css, /\.guideCard/);
});
