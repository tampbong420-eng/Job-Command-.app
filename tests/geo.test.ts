import { test } from "node:test";
import assert from "node:assert/strict";
import { etaFromMiles, formatMiles, milesBetween } from "../lib/geo";
import { wrapIndex, clockLabel, formatLiveHours } from "../lib/format";

test("milesBetween is about 2.8 miles Queen Anne to Queen Anne HVAC", () => {
  const miles = milesBetween(
    { lat: 47.62482, lng: -122.3629 },
    { lat: 47.639844278404, lng: -122.368877694281 },
  );
  assert.ok(miles > 0.9 && miles < 1.4, `got ${miles}`);
});

test("formatMiles uses feet under a tenth of a mile", () => {
  assert.equal(formatMiles(0.02), "106 ft");
  assert.equal(formatMiles(2.4), "2.4 mi");
  assert.equal(formatMiles(null), "—");
});

test("etaFromMiles uses a 22 mph field average", () => {
  assert.equal(etaFromMiles(11), "30 min");
});

test("wrapIndex cycles the rolodex", () => {
  assert.equal(wrapIndex(0, -1, 4), 3);
  assert.equal(wrapIndex(3, 1, 4), 0);
});

test("clockLabel maps crew status to dispatch copy", () => {
  assert.equal(clockLabel("active"), "ON THE CLOCK");
  assert.equal(clockLabel("off"), "CLOCKED OUT");
  assert.equal(clockLabel("break"), "ON BREAK");
});

test("formatLiveHours counts from clock-in", () => {
  const started = Date.parse("2026-09-10T14:45:00.000Z");
  const now = Date.parse("2026-09-10T16:00:00.000Z");
  assert.equal(formatLiveHours("2026-09-10T14:45:00.000Z", now), "1h 15m");
  assert.equal(formatLiveHours(null, started), "0h 00m");
});
