import assert from "node:assert/strict";
import test from "node:test";
import { hourLabel, hourOf, hourProblems, isInteriorJob, paintWindow, type PaintHour } from "./paint-window";

function day(rows: Array<[number, number, number, number?, number?]>): PaintHour[] {
  return rows.map(([hour, tempF, precipPct, humidity, dewPointF]) => ({
    at: `2026-10-02T${String(hour).padStart(2, "0")}:00`,
    tempF,
    precipPct,
    humidity,
    dewPointF,
  }));
}

test("hour labels read like a clock on the wall", () => {
  assert.equal(hourOf("2026-10-02T15:00"), 15);
  assert.equal(hourLabel(0), "12 AM");
  assert.equal(hourLabel(12), "12 PM");
  assert.equal(hourLabel(16), "4 PM");
  assert.equal(hourLabel(9), "9 AM");
});

test("rain at 5 PM: paint until 5, last coat by 1 so it gets 4 dry hours", () => {
  const out = paintWindow(
    day([
      [11, 78, 5, 54, 58],
      [12, 80, 5, 50, 58],
      [13, 82, 10, 48, 58],
      [14, 83, 15, 47, 58],
      [15, 82, 25, 50, 59],
      [16, 80, 30, 55, 60],
      [17, 77, 60, 66, 62],
      [18, 74, 70, 72, 63],
    ])
  );
  assert.equal(out.call, "go");
  assert.equal(out.headline, "Good to paint until 5 PM");
  assert.equal(out.lastCoat, "1 PM");
  assert.match(out.detail, /Rain 60% at 5 PM/);
  assert.deepEqual(
    out.hours.map((row) => row.call),
    ["go", "go", "go", "caution", "caution", "caution", "stop", "stop"]
  );
});

test("dry warm day is good all day", () => {
  const out = paintWindow(day([[9, 70, 0, 40, 45], [10, 72, 0], [11, 75, 5], [12, 77, 0]]));
  assert.equal(out.call, "go");
  assert.equal(out.headline, "Good to paint all day");
});

test("cold morning says wait and when it opens", () => {
  const out = paintWindow(day([[7, 44, 0], [8, 47, 0], [9, 51, 0], [10, 56, 0], [11, 60, 0], [12, 62, 0]]));
  assert.equal(out.call, "stop");
  assert.equal(out.headline, "Don’t paint outside now");
  assert.match(out.detail, /Too cold: 44° \(needs 50°\)/);
  assert.match(out.detail, /Good again at 9 AM/);
});

test("humidity at 85% or more and a tight dew point both stop the coat", () => {
  assert.deepEqual(hourProblems({ at: "2026-10-02T08:00", tempF: 70, precipPct: 0, humidity: 85 }), [
    "Too humid: 85% (needs under 85%)",
  ]);
  assert.deepEqual(hourProblems({ at: "2026-10-02T08:00", tempF: 62, precipPct: 0, humidity: 70, dewPointF: 59 }), [
    "Walls may sweat: only 3° above dew point (needs 5°)",
  ]);
  assert.deepEqual(hourProblems({ at: "2026-10-02T08:00", tempF: 64, precipPct: 0, humidity: 70, dewPointF: 59 }), []);
});

test("rain inside the next four hours is a caution, not a go", () => {
  const out = paintWindow(day([[13, 75, 10], [14, 75, 20], [15, 74, 50], [16, 72, 70]]));
  assert.equal(out.call, "caution");
  assert.equal(out.headline, "Rain by 3 PM — don’t start a coat");
});

test("missing humidity and dew point skip those checks instead of guessing", () => {
  const out = paintWindow(day([[10, 70, 0], [11, 71, 0]]));
  assert.equal(out.call, "go");
});

test("no forecast and interior jobs", () => {
  assert.equal(paintWindow([]).call, "unknown");
  assert.equal(isInteriorJob("Office Interior Repaint"), true);
  assert.equal(isInteriorJob("Kitchen Cabinet Refinish"), true);
  assert.equal(isInteriorJob("Clubhouse Exterior Repaint"), false);
});
