import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  INTRO_BOOT_ENABLED,
  INTRO_BOOT_MARK,
  INTRO_BOOT_MS,
  INTRO_BOOT_SEEN,
  INTRO_BOOT_WORDMARK,
} from "./intro-boot";

test("start-up splash is a brief isolated logo fade with a rollback switch", () => {
  const intro = readFileSync(new URL("../components/command/IntroBoot.tsx", import.meta.url), "utf8");
  const burst = readFileSync(new URL("../components/command/LogoBurst.tsx", import.meta.url), "utf8");
  const flag = readFileSync(new URL("./intro-boot.ts", import.meta.url), "utf8");
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../components/command/IntroBoot.module.css", import.meta.url), "utf8");
  assert.equal(INTRO_BOOT_ENABLED, true);
  assert.ok(INTRO_BOOT_MS >= 2400 && INTRO_BOOT_MS <= 4600);
  assert.equal(INTRO_BOOT_MARK, "/brand/jc-shield@2x.webp");
  assert.equal(INTRO_BOOT_WORDMARK, "/brand/job-command-wordmark@2x.webp");
  assert.equal(INTRO_BOOT_SEEN, "jc-logo-splash");
  assert.equal(existsSync(new URL(`../public${INTRO_BOOT_MARK}`, import.meta.url)), true);
  assert.equal(existsSync(new URL(`../public${INTRO_BOOT_WORDMARK}`, import.meta.url)), true);
  assert.equal(existsSync(new URL("../public/jc-mark.svg", import.meta.url)), false);
  assert.match(flag, /INTRO_BOOT_ENABLED/);
  assert.match(burst, /INTRO_BOOT_ENABLED/);
  assert.match(burst, /IntroBoot/);
  assert.match(layout, /LogoBurst/);
  assert.match(intro, /data-logo-burst="1"/);
  assert.match(intro, /data-intro-boot="1"/);
  assert.match(intro, /data-intro-mark="1"/);
  assert.match(intro, /INTRO_BOOT_MARK/);
  assert.match(intro, /INTRO_BOOT_WORDMARK/);
  assert.match(intro, /prefers-reduced-motion/);
  assert.doesNotMatch(intro, /data-intro-hammer/);
  assert.doesNotMatch(intro, /data-intro-tape/);
  assert.doesNotMatch(intro, /explode/);
  assert.match(css, /@keyframes splashMark/);
  assert.match(css, /@keyframes splashVeil/);
  assert.match(css, /#0d0d0d/);
  assert.match(css, /pointer-events:\s*none/);
  assert.match(intro, /pointerEvents: "none"/);
});

test("intro overlay stays off payroll, schedules, pipeline, and themes", () => {
  const intro = readFileSync(new URL("../components/command/IntroBoot.tsx", import.meta.url), "utf8");
  const burst = readFileSync(new URL("../components/command/LogoBurst.tsx", import.meta.url), "utf8");
  const lead = readFileSync(new URL("../components/command/LeadStage.tsx", import.meta.url), "utf8");
  const estimate = readFileSync(new URL("../components/command/EstimateStage.tsx", import.meta.url), "utf8");
  const yellow = readFileSync(new URL("../components/command/YellowPrepStage.tsx", import.meta.url), "utf8");
  const home = readFileSync(new URL("../components/command/EmployeeHome.tsx", import.meta.url), "utf8");
  const gate = readFileSync(new URL("../components/command/AccessGate.tsx", import.meta.url), "utf8");
  const desk = readFileSync(new URL("../components/command/EmployeeWorkspace.tsx", import.meta.url), "utf8");
  const onboard = readFileSync(new URL("../components/command/EmployeeOnboard.tsx", import.meta.url), "utf8");
  const payroll = readFileSync(new URL("./payroll.ts", import.meta.url), "utf8");
  const hours = readFileSync(new URL("./week-hours.ts", import.meta.url), "utf8");
  const schedule = readFileSync(new URL("./schedule.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const sw = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  for (const source of [lead, estimate, yellow, home, gate, desk, onboard, payroll, hours, schedule]) {
    assert.doesNotMatch(source, /IntroBoot/);
    assert.doesNotMatch(source, /LogoBurst/);
    assert.doesNotMatch(source, /job-command-logo/);
    assert.doesNotMatch(source, /INTRO_BOOT_ENABLED/);
  }
  assert.doesNotMatch(css, /data-intro-boot/);
  assert.doesNotMatch(css, /IntroBoot/);
  assert.doesNotMatch(css, /LogoBurst/);
  // Notifications use the Job Command app icon, never one shop's mark (App Store: any contractor).
  assert.match(sw, /\/icons\/icon-192\.png/);
  assert.doesNotMatch(sw, /shop-mark|Top Gun/);
  assert.doesNotMatch(intro, /job-command-logo/);
  assert.doesNotMatch(burst, /job-command-logo/);
  const pulseHits = [...css.matchAll(/animation:\s*taskPulse 4s infinite ease-in-out/g)];
  assert.equal(pulseHits.length, 3);
});
