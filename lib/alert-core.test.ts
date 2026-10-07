import assert from "node:assert/strict";
import test from "node:test";
import { holdUntilFor, inQuietHours } from "./alert-core";

test("overnight quiet hours cover late evening and early morning", () => {
  const start = "19:00";
  const end = "07:00";
  assert.equal(inQuietHours(new Date("2026-09-16T22:15:00"), start, end), true);
  assert.equal(inQuietHours(new Date("2026-09-16T03:00:00"), start, end), true);
  assert.equal(inQuietHours(new Date("2026-09-16T12:00:00"), start, end), false);
});

test("urgent dispatch is never held", () => {
  const night = new Date("2026-09-16T23:00:00");
  assert.equal(holdUntilFor("urgent", night, "19:00", "07:00"), null);
});

test("opened-quote notes wait for evening during the day", () => {
  const day = new Date("2026-09-16T14:00:00");
  const held = holdUntilFor("quiet", day, "19:00", "07:00");
  assert.ok(held);
  assert.equal(held.getHours(), 19);
  assert.equal(held.getMinutes(), 0);
});

test("opened-quote notes release once quiet hours start", () => {
  const evening = new Date("2026-09-16T19:30:00");
  assert.equal(holdUntilFor("quiet", evening, "19:00", "07:00"), null);
});

test("normal schedule notes wait until morning if they land at night", () => {
  const night = new Date("2026-09-16T22:00:00");
  const held = holdUntilFor("normal", night, "19:00", "07:00");
  assert.ok(held);
  assert.equal(held.getHours(), 7);
});

test("normal schedule notes go out immediately during the day", () => {
  const day = new Date("2026-09-16T10:00:00");
  assert.equal(holdUntilFor("normal", day, "19:00", "07:00"), null);
});
