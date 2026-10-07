import assert from "node:assert/strict";
import test from "node:test";
import { crewInitials, pinPercent, pingIsStale } from "./crew-ping";

test("initials take first and last name", () => {
  assert.equal(crewInitials("Maya Chen"), "MC");
  assert.equal(crewInitials("Eric"), "ER");
});

test("stale pings age out after eight minutes", () => {
  const now = Date.parse("2026-09-18T16:00:00Z");
  assert.equal(pingIsStale("2026-09-18T15:55:00Z", now), false);
  assert.equal(pingIsStale("2026-09-18T15:50:00Z", now), true);
});

test("job-site pins plot relative to the property", () => {
  const site = { lat: 34.5, lng: -93.05 };
  const pin = pinPercent({ lat: 34.5009, lng: -93.0491 }, site);
  assert.equal(pin.inside, true);
  assert.ok(pin.top < 50);
  assert.ok(pin.left > 50);
});
