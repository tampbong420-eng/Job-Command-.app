import test from "node:test";
import assert from "node:assert/strict";
import { micLift, type MicBox } from "./mic-spot";

const mic: MicBox = { left: 300, right: 380, top: 680, bottom: 760 };
const box = (top: number, height: number, left = 300, width = 60): MicBox => ({ top, bottom: top + height, left, right: left + width });

test("nothing under the mic: stays put", () => {
  assert.equal(micLift(mic, [box(500, 44)], [box(100, 20)]), 0);
});

test("a Next arrow resting under the mic lifts it just clear", () => {
  assert.equal(micLift(mic, [box(715, 44, 346, 44)], []), 760 - 715 + 6);
});

test("a tag under the mic lifts it when the spot above is clear", () => {
  assert.equal(micLift(mic, [], [box(740, 24)]), 760 - 740 + 6);
});

test("lifting off a tag onto another tag climbs again, within the cap", () => {
  // tag at 740, next one up at 700 → must clear 700
  assert.equal(micLift(mic, [], [box(740, 24), box(700, 24)]), 760 - 700 + 6);
});

test("a dense stack of tags it can't clear leaves the mic where it is", () => {
  const stack = [0, 1, 2, 3, 4, 5].map((i) => box(740 - i * 40, 24));
  assert.equal(micLift(mic, [], stack), 0);
});

test("a Next button still wins even when tags around it can't be cleared", () => {
  const stack = [0, 1, 2, 3, 4, 5].map((i) => box(700 - i * 40, 24));
  assert.equal(micLift(mic, [box(730, 44)], stack), 760 - 730 + 6);
});

test("things beside the mic (not under it) don't move it", () => {
  assert.equal(micLift(mic, [box(715, 44, 0, 44)], [box(740, 24, 20, 200)]), 0);
});
