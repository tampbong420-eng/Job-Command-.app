import assert from "node:assert/strict";
import test from "node:test";
import { endPause, paidHoursAfterLunch, startPause, unpaidLunchHours, unpaidLunchMs } from "./shift-pause";

test("lunch pauses paid time; breaks stay paid", () => {
  const lunch = startPause([], "lunch", 0);
  assert.equal(unpaidLunchMs(lunch, 30 * 60 * 1000), 30 * 60 * 1000);
  assert.equal(unpaidLunchHours(lunch, 30 * 60 * 1000), 0.5);
  assert.equal(paidHoursAfterLunch(8, lunch, 30 * 60 * 1000), 7.5);

  const closed = endPause(lunch, "lunch", 30 * 60 * 1000);
  assert.equal(unpaidLunchHours(closed, 60 * 60 * 1000), 0.5);

  const paidBreak = startPause([], "break", 0);
  assert.equal(unpaidLunchMs(paidBreak, 10 * 60 * 1000), 0);
  assert.equal(paidHoursAfterLunch(4, paidBreak, 10 * 60 * 1000), 4);
});
