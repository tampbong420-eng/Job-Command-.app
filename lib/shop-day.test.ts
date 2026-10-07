import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SHOP_TIME_ZONE, shopDayString, shopToday, todayString, toDayString } from "./dates";
import { liveActualHours } from "./payroll";
import { rollingSchedule } from "./week-hours";

test("shop clock is Hot Springs (Central) by default", () => {
  assert.equal(SHOP_TIME_ZONE, "America/Chicago");
});

test("today is the shop's calendar day, not UTC", () => {
  // 10:50 PM CDT Thu Oct 1 2026 = 03:50 UTC Fri Oct 2.
  const lateEvening = new Date("2026-10-02T03:50:00Z");
  assert.equal(todayString(lateEvening), "2026-10-01");
  assert.equal(shopDayString(lateEvening, "UTC"), "2026-10-02");
  // Early morning stays on the same day.
  assert.equal(todayString(new Date("2026-10-01T12:30:00Z")), "2026-10-01");
  // Winter (CST, UTC-6): 6:30 PM Dec 1 is still Dec 1.
  assert.equal(todayString(new Date("2026-12-02T00:30:00Z")), "2026-12-01");
  // New Year's Eve late night stays in the old year.
  assert.equal(todayString(new Date("2027-01-01T05:59:00Z")), "2026-12-31");
  assert.equal(todayString(new Date("2027-01-01T06:00:00Z")), "2027-01-01");
});

test("shopToday is the UTC-midnight day the database stores", () => {
  const lateEvening = new Date("2026-10-02T03:50:00Z");
  assert.equal(shopToday(lateEvening).toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(toDayString(shopToday(lateEvening)), "2026-10-01");
});

test("a shift still open at 9 PM counts on today's row", () => {
  const now = new Date("2026-10-02T02:00:00Z"); // 9 PM CDT Oct 1
  const hours = liveActualHours(
    { date: "2026-10-01", actualHours: 0, clockIn: "2026-10-01T22:00:00Z", clockOut: null },
    now
  );
  assert.equal(hours, 4);
});

test("rolling schedule starts on the shop's today in the evening", () => {
  const days = rollingSchedule([], new Date("2026-10-02T03:50:00Z"), 3);
  assert.equal(days[0].date, "2026-10-01");
});

test("clock punches file under the shop's day", () => {
  const actions = readFileSync(new URL("../app/actions.ts", import.meta.url), "utf8");
  assert.doesNotMatch(actions, /utcDay\(now\)|utcDay\(new Date\(\)\)/);
  const feed = readFileSync(new URL("./site-feed.ts", import.meta.url), "utf8");
  assert.doesNotMatch(feed, /now\.toISOString\(\)\.slice\(0, 10\)/);
});
