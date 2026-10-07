import assert from "node:assert/strict";
import test from "node:test";
import {
  addMaterial,
  boardOf,
  crewSafePrep,
  dropRow,
  emptyBoard,
  live,
  mergePrepForSave,
  normalizeColorCode,
  photoBuckets,
  putBoard,
  starterTasks,
  swatchFor,
  taskStats,
  workDay,
  type ActiveBoard,
} from "./active-board";
import { parsePrep, stringifyPrep } from "./job-prep";

const T0 = "2026-10-02T12:00:00.000Z";
const T1 = "2026-10-02T13:00:00.000Z";

function board(over: Partial<ActiveBoard> = {}): ActiveBoard {
  return { ...emptyBoard(), ...over };
}

test("board rides inside the prep JSON and yellow prep saves keep it", () => {
  const prep = JSON.stringify({ materials: { paint: true }, durationDays: 5, crew: [] });
  const withBoard = putBoard(prep, board({ tasks: [{ id: "t1", at: T0, area: "roll", text: "Siding coat 1", done: false }] }));
  assert.equal(boardOf(withBoard).tasks[0].text, "Siding coat 1");
  assert.equal(JSON.parse(withBoard).durationDays, 5);
  // Yellow prep parses and re-saves the whole checklist; the Active board must survive.
  const resaved = stringifyPrep(parsePrep(withBoard));
  assert.equal(boardOf(resaved).tasks.length, 1);
  assert.equal(boardOf("not json").tasks.length, 0);
});

test("two phones editing at once merge row by row, newest edit wins", () => {
  const db = putBoard("{}", board({
    tasks: [
      { id: "a", at: T0, area: "prep", text: "Wash", done: false },
      { id: "b", at: T1, area: "roll", text: "Coat 1", done: true },
    ],
  }));
  const incoming = putBoard("{}", board({
    tasks: [
      { id: "a", at: T1, area: "prep", text: "Wash", done: true },
      { id: "b", at: T0, area: "roll", text: "Coat 1", done: false },
      { id: "c", at: T1, area: "trim", text: "Fascia", done: false },
    ],
  }));
  const merged = boardOf(mergePrepForSave(db, incoming, "ADMIN"));
  const byId = Object.fromEntries(merged.tasks.map((task) => [task.id, task]));
  assert.equal(byId.a.done, true);
  assert.equal(byId.b.done, true);
  assert.equal(byId.c.text, "Fascia");
});

test("crew phones never get change-order dollars and can’t change change orders", () => {
  const office = putBoard("{}", board({
    changes: [{ id: "co1", at: T0, number: 2, title: "Pool gate", detail: "", amount: 420, status: "asked" }],
  }));
  const crewView = boardOf(crewSafePrep(office));
  assert.equal(crewView.changes[0].amount, 0);
  assert.equal(crewView.changes[0].priceHidden, true);
  assert.equal(crewView.changes[0].title, "Pool gate");
  // Crew saves the board back (e.g. after ticking a task): office dollars stay intact.
  const crewSave = putBoard("{}", { ...crewView, changes: [{ ...crewView.changes[0], at: T1, status: "approved" }] });
  const saved = boardOf(mergePrepForSave(office, crewSave, "CREW"));
  assert.equal(saved.changes[0].amount, 420);
  assert.equal(saved.changes[0].status, "asked");
  // A hidden-price row never overwrites the real one even from an office phone.
  const stale = boardOf(mergePrepForSave(office, crewSave, "ADMIN"));
  assert.equal(stale.changes[0].amount, 420);
});

test("site pages from another phone are not lost when a stale copy saves", () => {
  const db = JSON.stringify({ siteFeed: { notes: "a", pages: [{ id: "p1", text: "lunch" }] } });
  const incoming = JSON.stringify({ siteFeed: { notes: "b", pages: [{ id: "p2", text: "rain" }] } });
  const merged = JSON.parse(mergePrepForSave(db, incoming, "ADMIN"));
  assert.equal(merged.siteFeed.notes, "b");
  assert.deepEqual(merged.siteFeed.pages.map((p: { id: string }) => p.id), ["p2", "p1"]);
  assert.equal(mergePrepForSave(db, "garbage", "ADMIN"), "garbage");
});

test("soft delete hides a row and the delete survives a merge", () => {
  const list = [{ id: "x", at: T0, text: "Drip", done: false }];
  const dropped = dropRow(list, "x", new Date(T1));
  assert.equal(live(dropped).length, 0);
  const merged = boardOf(mergePrepForSave(putBoard("{}", board({ punch: list })), putBoard("{}", board({ punch: dropped })), "CREW"));
  assert.equal(live(merged.punch).length, 0);
});

test("starter list covers every area; stats count by area", () => {
  const tasks = starterTasks(false, new Date(T0));
  const stats = taskStats([{ ...tasks[0], done: true }, ...tasks.slice(1)]);
  assert.equal(stats.total, 10);
  assert.equal(stats.done, 1);
  assert.equal(stats.pct, 10);
  assert.deepEqual(stats.byArea.map((area) => area.total), [3, 1, 1, 2, 2, 1]);
  assert.equal(starterTasks(true, new Date(T0))[0].text, "Move and cover furniture");
});

test("spoken paint codes and adding gallons to the right row", () => {
  assert.equal(normalizeColorCode("sw7006"), "SW 7006");
  assert.equal(normalizeColorCode("Sherwin Williams 7036"), "SW 7036");
  assert.equal(normalizeColorCode("s w 6258"), "SW 6258");
  assert.equal(swatchFor("SW 7006"), "#eeefea");
  const colors = [
    { id: "trim", at: T0, area: "Trim", code: "SW 7006", name: "Extra White", product: "Emerald", sheen: "Semi-Gloss", have: 6, need: 6 },
    { id: "primer", at: T0, area: "Primer", code: "SW 7006", name: "tinted primer", product: "Exterior Latex Primer", sheen: "", have: 2, need: 3 },
  ];
  const more = addMaterial(colors, { qty: 2, code: "SW 7006", name: "primer" }, new Date(T1));
  assert.equal(more.find((row) => row.id === "primer")!.have, 4);
  assert.equal(more.find((row) => row.id === "trim")!.have, 6);
  const paint = addMaterial(colors, { qty: 1, code: "SW 7006", name: "" }, new Date(T1));
  assert.equal(paint.find((row) => row.id === "trim")!.have, 7);
  const added = addMaterial(colors, { qty: 5, code: "SW 7036", name: "Accessible Beige" }, new Date(T1));
  assert.equal(added.length, 3);
  assert.equal(added[2].have, 5);
});

test("photos sort into before, progress, and after by time", () => {
  const photos = [
    { id: "1", createdAt: "2026-09-30T12:00:00Z" },
    { id: "2", createdAt: "2026-10-01T15:00:00Z" },
    { id: "3", createdAt: "2026-10-02T20:00:00Z" },
  ];
  const out = photoBuckets(photos, "2026-10-01T12:00:00Z", "2026-10-02T19:00:00Z");
  assert.deepEqual(out.before.map((p) => p.id), ["1"]);
  assert.deepEqual(out.progress.map((p) => p.id), ["2"]);
  assert.deepEqual(out.after.map((p) => p.id), ["3"]);
});

test("day N of M comes from the booked days", () => {
  assert.deepEqual(workDay({ dates: ["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-05"], today: "2026-10-02" }), {
    day: 3,
    of: 5,
    starts: "2026-09-30",
  });
  assert.equal(workDay({ dates: [], today: "2026-10-02" }), null);
  assert.equal(workDay({ dates: ["2026-10-05"], today: "2026-10-02" })!.day, 0);
});
