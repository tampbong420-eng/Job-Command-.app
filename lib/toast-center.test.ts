import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  TOAST_COPY,
  TOAST_EVENT,
  TOAST_HOLD_MS,
  mergeToastStack,
  toastItemFrom,
} from "./toast-center";
import { NEW_USER_PARAM, NEW_USER_VALUE, isFreshStartRequest } from "./new-user-open";

test("toast center is a floating overlay that never writes live shop data", () => {
  const hook = readFileSync(new URL("../hooks/use-toast-center.ts", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../components/command/ToastCenter.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../components/command/ToastCenter.module.css", import.meta.url), "utf8");
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const help = readFileSync(new URL("../components/command/HelpMode.tsx", import.meta.url), "utf8");
  const tour = readFileSync(new URL("../components/command/AppTour.tsx", import.meta.url), "utf8");
  assert.equal(TOAST_EVENT, "job-command-toast");
  assert.ok(TOAST_HOLD_MS >= 3000);
  assert.equal(TOAST_COPY.helpOn.title, "Help Mode on");
  assert.match(hook, /ToastContext/);
  assert.match(ui, /data-toast-center/);
  assert.match(ui, /ToastContext.Provider/);
  assert.match(layout, /ToastCenter/);
  assert.match(help, /TOAST_COPY.helpOn/);
  assert.match(tour, /TOAST_COPY.tourDone/);
  assert.match(css, /#ffffff/);
  assert.match(css, /font-size:\s*18px/);
  assert.match(css, /font-size:\s*15px/);
  assert.match(css, /#0a0a0a/);
  assert.doesNotMatch(ui, /prisma/);
  assert.doesNotMatch(hook, /prisma/);
  const item = toastItemFrom({ title: "Lead saved.", kind: "success" });
  assert.equal(item?.title, "Lead saved.");
  assert.equal(toastItemFrom({ title: "   " }), null);
  const stack = mergeToastStack([], item!);
  assert.equal(stack.length, 1);
});

test("toast overlay stays off payroll, pipeline cards, signup, and intro", () => {
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
    assert.doesNotMatch(source, /ToastCenter/);
    assert.doesNotMatch(source, /job-command-toast/);
    assert.doesNotMatch(source, /data-toast-center/);
  }
  assert.doesNotMatch(globals, /data-toast-center/);
  assert.doesNotMatch(globals, /ToastCenter/);
  const pulseHits = [...globals.matchAll(/animation:\s*taskPulse 4s infinite ease-in-out/g)];
  assert.equal(pulseHits.length, 3);
});

test("fresh start query only clears overlay keys", () => {
  const open = readFileSync(new URL("../components/command/NewUserOpen.tsx", import.meta.url), "utf8");
  const lib = readFileSync(new URL("./new-user-open.ts", import.meta.url), "utf8");
  assert.equal(NEW_USER_PARAM, "start");
  assert.equal(NEW_USER_VALUE, "new");
  assert.equal(isFreshStartRequest("?start=new"), true);
  assert.equal(isFreshStartRequest(""), false);
  assert.match(open, /clearFreshClientGuides/);
  assert.match(lib, /APP_TOUR_KEY/);
  assert.match(lib, /HELP_MODE_KEY/);
  assert.doesNotMatch(lib, /prisma/);
  assert.doesNotMatch(lib, /deleteMany/);
});
