import assert from "node:assert/strict";
import test from "node:test";
import { mergeNotes, parseSiteTalk } from "./site-talk";

test("parses scope, measurements, and client requests from driveway talk", () => {
  const draft = parseSiteTalk(
    "Exterior is 1800 square feet, two stories. They want the trim white and leave the brick. Eight hours labor plus 24 linear feet of fascia at $12 a foot."
  );
  assert.match(draft.notes, /Client:/);
  assert.match(draft.notes, /trim white/i);
  assert.equal(draft.measurements.find((item) => item.label === "Area")?.value, "1800 sf");
  assert.equal(draft.measurements.find((item) => item.label === "Stories")?.value, "2");
  assert.equal(draft.measurements.find((item) => item.label === "Labor")?.value, "8 hr");
  assert.equal(draft.measurements.find((item) => item.label === "Linear")?.value, "24 lf");
  assert.ok(draft.requests.some((item) => /trim white/i.test(item)));
  assert.ok(draft.lines.some((line) => line.kind === "LABOR" && line.quantity === 8));
  assert.ok(draft.lines.some((line) => /fascia/i.test(line.description) && line.rate === 12 && line.quantity === 24));
});

test("builds priced interior lines from square footage when no rates are spoken", () => {
  const draft = parseSiteTalk("Interior walls about 1200 square feet, two coats.");
  assert.equal(draft.measurements.find((item) => item.label === "Area")?.value, "1200 sf");
  assert.ok(draft.lines.some((line) => line.kind === "LABOR" && line.rate > 0));
  assert.ok(draft.lines.some((line) => line.kind === "MATERIAL" && /paint/i.test(line.description)));
});

test("merge notes stays quiet and does not duplicate", () => {
  assert.equal(mergeNotes("Paint the eaves.", "Paint the eaves."), "Paint the eaves.");
  assert.match(mergeNotes("Paint the eaves.", "Client: trim white."), /trim white/);
});
