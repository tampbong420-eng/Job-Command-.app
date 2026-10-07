import assert from "node:assert/strict";
import test from "node:test";
import { weekHourTotal, weekRange, weekWorkdays, rollingSchedule } from "./week-hours";

test("week range is Monday through Sunday", () => {
  const range = weekRange(new Date("2026-09-18T16:00:00Z"));
  assert.equal(range.start, "2026-09-14");
  assert.equal(range.end, "2026-09-20");
});

test("weekly hours sum this week's punches", () => {
  const now = new Date("2026-09-18T16:00:00Z");
  const hours = weekHourTotal(
    [
      { date: "2026-09-14", actualHours: 8, clockIn: null, clockOut: null },
      { date: "2026-09-18", actualHours: 2, clockIn: null, clockOut: null },
      { date: "2026-09-07", actualHours: 10, clockIn: null, clockOut: null },
    ],
    now
  );
  assert.equal(hours, 10);
});

test("crew week review lists Monday through Friday with logged and scheduled hours", () => {
  const now = new Date("2026-09-18T16:00:00Z");
  const days = weekWorkdays(
    [
      {
        date: "2026-09-14",
        actualHours: 8,
        clockIn: null,
        clockOut: null,
        scheduledHours: 8,
        scheduledStart: "07:00",
        scheduledEnd: "15:00",
        job: { client: "Hayes", name: "Front" },
      },
      {
        date: "2026-09-16",
        actualHours: 6,
        clockIn: null,
        clockOut: null,
        scheduledHours: 8,
        scheduledStart: "07:00",
        scheduledEnd: "15:00",
        job: { client: "Pike", name: "Trim" },
      },
      {
        date: "2026-09-19",
        actualHours: 4,
        clockIn: null,
        clockOut: null,
        scheduledHours: 8,
        scheduledStart: "07:00",
        scheduledEnd: "15:00",
        job: { client: "Weekend", name: "Skip" },
      },
    ],
    now
  );
  assert.equal(days.length, 5);
  assert.deepEqual(
    days.map((day) => day.weekday),
    ["Mon", "Tue", "Wed", "Thu", "Fri"]
  );
  assert.equal(days[0].date, "2026-09-14");
  assert.equal(days[0].loggedHours, 8);
  assert.equal(days[0].scheduledHours, 8);
  assert.match(days[0].shift, /7 AM/);
  assert.equal(days[0].jobs, "Hayes");
  assert.equal(days[2].loggedHours, 6);
  assert.equal(days[2].jobs, "Pike");
  assert.equal(days[4].loggedHours, 0);
  assert.ok(!days.some((day) => day.jobs === "Weekend"));
});

test("rolling schedule shows ten days from today with upcoming shifts", () => {
  const now = new Date("2026-09-18T16:00:00Z");
  const days = rollingSchedule(
    [
      {
        date: "2026-09-18",
        actualHours: 3,
        clockIn: null,
        clockOut: null,
        scheduledHours: 8,
        scheduledStart: "07:00",
        scheduledEnd: "15:00",
        job: { client: "Hayes", name: "Front" },
      },
      {
        date: "2026-09-21",
        actualHours: 0,
        clockIn: null,
        clockOut: null,
        scheduledHours: 8,
        scheduledStart: "07:00",
        scheduledEnd: "15:00",
        job: { client: "Pike", name: "Trim" },
      },
    ],
    now,
    10
  );
  assert.equal(days.length, 10);
  assert.equal(days[0].date, "2026-09-18");
  assert.equal(days[0].loggedHours, 3);
  assert.equal(days[0].jobs, "Hayes");
  assert.equal(days[3].date, "2026-09-21");
  assert.equal(days[3].scheduledHours, 8);
  assert.equal(days[3].jobs, "Pike");
  assert.equal(days[9].date, "2026-09-27");
});
