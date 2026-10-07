import test from "node:test";
import assert from "node:assert/strict";
import { holdHintDone, holdHintKey, markHoldHintDone, nextHoldHint, swipeFlashLabel, SWIPE_FLASH_MS } from "./swipe-flash";

test("orange swipe labels name the direction and where it went", () => {
  assert.equal(swipeFlashLabel("week", -1), "← Previous week");
  assert.equal(swipeFlashLabel("week", 1), "Next week →");
  assert.equal(swipeFlashLabel("month", 1), "Next month →");
  assert.equal(swipeFlashLabel("job", -1), "← Previous job");
  assert.equal(SWIPE_FLASH_MS, 1000);
});

test("hold hint is remembered per person on this phone", () => {
  const map = new Map<string, string>();
  const store = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
  assert.equal(holdHintDone(store, "Eric Stlawrence"), false);
  markHoldHintDone(store, "Eric Stlawrence");
  assert.equal(holdHintDone(store, "Eric  Stlawrence"), true);
  assert.equal(holdHintDone(store, "Casey Quinn"), false);
  assert.notEqual(holdHintKey("A"), holdHintKey("B"));
  assert.equal(holdHintDone(null, "x"), false);
  const broken = { getItem: () => { throw new Error("no"); }, setItem: () => { throw new Error("no"); } };
  assert.equal(holdHintDone(broken, "x"), false);
  markHoldHintDone(broken, "x");
});

test("hint shows on first long-press, goes away for good after a multi-day pick", () => {
  let s = nextHoldHint({ done: false, showing: false }, "long-press");
  assert.deepEqual(s, { done: false, showing: true, remember: false });
  s = nextHoldHint(s, { picked: 1 });
  assert.equal(s.showing, true);
  s = nextHoldHint(s, { picked: 2 });
  assert.deepEqual(s, { done: true, showing: false, remember: true });
  assert.deepEqual(nextHoldHint({ done: true, showing: false }, "long-press"), { done: true, showing: false, remember: false });
});
