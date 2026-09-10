import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compactDayRange,
  formatHourLabel,
  patchDay,
  scheduleOverview,
  scheduledHours,
  weekdayHours,
} from "../lib/schedule";
import { jobStatusLabel, jobTone } from "../lib/format";

test("weekdayHours marks weekend off by default", () => {
  const week = weekdayHours("07:00", "16:00");
  assert.equal(week[0].off, false);
  assert.equal(week[5].off, true);
  assert.equal(week[6].off, true);
  assert.equal(scheduledHours(week), 45);
});

test("scheduleOverview compresses a uniform weekday block", () => {
  assert.equal(
    scheduleOverview(weekdayHours("07:00", "16:00")),
    "MON–FRI · 7 AM–4 PM",
  );
});

test("patchDay can flip a Saturday on", () => {
  const next = patchDay(weekdayHours("08:00", "12:00"), "sat", { off: false });
  assert.equal(next[5].off, false);
  assert.equal(compactDayRange(["mon", "wed", "fri"]), "MON · WED · FRI");
  assert.equal(formatHourLabel("13:30"), "1:30 PM");
});

test("job tones follow the boss status hierarchy", () => {
  assert.equal(jobTone("lead"), "tone-lead");
  assert.equal(jobTone("pending"), "tone-pending");
  assert.equal(jobTone("in_progress"), "tone-active");
  assert.equal(jobTone("completed"), "tone-done");
  assert.equal(jobStatusLabel("lead"), "New lead");
  assert.equal(jobStatusLabel("pending"), "Pending");
  assert.equal(jobStatusLabel("in_progress"), "Active");
  assert.equal(jobStatusLabel("completed"), "Finished");
});
