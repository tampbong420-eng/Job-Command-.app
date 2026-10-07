import assert from "node:assert/strict";
import test from "node:test";
import {
  applyPrepTalk,
  applyYellowTalk,
  inferTrade,
  parseDispatchNotes,
  parseSpokenDuration,
  scheduleDays,
  canCheckPrepItem,
  classifyMaterial,
  materialPrepItems,
  materialsReady,
  parsePrep,
  stringifyPrep,
  yellowItemStates,
  yellowPrepComplete,
} from "./job-prep";
import type { EstimateDTO } from "./types";

const bid: EstimateDTO = {
  id: "est_1",
  number: "EST-1002",
  jobId: "job_lake",
  customerId: "cust_maya",
  status: "ACCEPTED",
  notes: "",
  terms: "",
  taxRate: 0,
  publicToken: "tok",
  sentAt: "2026-09-17T12:00:00.000Z",
  viewedAt: null,
  acceptedAt: null,
  changesAt: null,
  signedName: "",
  clientNote: "",
  sentEmail: true,
  sentSms: true,
  lastFollowUpAt: null,
  followUpCount: 0,
  createdAt: "2026-09-17T12:00:00.000Z",
  lines: [
    { id: "l1", kind: "LABOR", description: "Exterior", quantity: 8, unit: "hr", rate: 45, amount: 360 },
    { id: "p1", kind: "MATERIAL", description: "Duration SuperPaint", quantity: 8, unit: "gal", rate: 52, amount: 416 },
    { id: "w1", kind: "MATERIAL", description: "Cedar fascia board", quantity: 12, unit: "ea", rate: 18, amount: 216 },
    { id: "s1", kind: "OTHER", description: "Tape and paper", quantity: 1, unit: "lot", rate: 40, amount: 40 },
  ],
  deliveries: [],
};

test("classify paint wood and supplies from the bid line", () => {
  assert.equal(classifyMaterial("Duration SuperPaint"), "paint");
  assert.equal(classifyMaterial("Cedar fascia board"), "wood");
  assert.equal(classifyMaterial("Tape and paper"), "supply");
});

test("material checklist comes off the estimate and fills missing buckets", () => {
  const fromBid = materialPrepItems(bid);
  assert.equal(fromBid.some((item) => item.id === "line:p1"), true);
  assert.equal(fromBid.some((item) => item.id === "line:w1"), true);
  assert.equal(fromBid.some((item) => item.id === "line:s1"), true);
  const laborOnly = materialPrepItems({
    ...bid,
    lines: [bid.lines[0]],
  });
  assert.deepEqual(
    laborOnly.map((item) => item.id),
    ["paint", "wood", "supplies"]
  );
});

test("Active stays locked until every yellow row is true", () => {
  const items = materialPrepItems(bid);
  const empty = parsePrep("{}");
  assert.equal(yellowPrepComplete(false, false, items, empty), false);
  assert.equal(yellowPrepComplete(true, true, items, empty), false);
  assert.equal(canCheckPrepItem(0, items, empty, false, true), false);
  assert.equal(canCheckPrepItem(0, items, empty, true, true), true);
  assert.equal(canCheckPrepItem(1, items, empty, true, true), false);

  const paintOnly = { materials: { [items[0].id]: true } };
  assert.equal(canCheckPrepItem(1, items, paintOnly, true, true), true);
  assert.equal(materialsReady(items, paintOnly), false);
  assert.equal(yellowPrepComplete(true, true, items, paintOnly), false);

  const allTrue: Record<string, boolean> = {};
  for (const item of items) allTrue[item.id] = true;
  const ready = { materials: allTrue };
  assert.equal(materialsReady(items, ready), true);
  assert.equal(yellowPrepComplete(true, true, items, ready), true);
  assert.equal(
    yellowItemStates(true, true, items, ready).every((row) => row.done === true),
    true
  );
  assert.equal(yellowPrepComplete(true, true, [], ready), false);
});

test("talk only checks materials in order after start and crew", () => {
  const items = materialPrepItems({ ...bid, lines: [bid.lines[0]] });
  const empty = parsePrep("{}");
  const tooSoon = applyPrepTalk("paint is bought", items, empty, false, false);
  assert.equal(tooSoon.materials.paint, undefined);
  const skip = applyPrepTalk("supplies are gathered", items, empty, true, true);
  assert.equal(skip.materials.supplies, undefined);
  const paint = applyPrepTalk("paint is bought", items, empty, true, true);
  assert.equal(paint.materials.paint, true);
  assert.equal(paint.materials.wood, undefined);
  const rest = applyPrepTalk("all the materials are staged", items, paint, true, true);
  assert.equal(materialsReady(items, rest), true);
  assert.equal(stringifyPrep(rest).includes('"paint":true'), true);
});

test("yellow talk captures start date, crew, duration, and dispatch notes", () => {
  const items = materialPrepItems({ ...bid, lines: [bid.lines[0]] });
  const empty = parsePrep("{}");
  const crew = [
    { id: "emp_maya", firstName: "Maya", lastName: "Chen", jobTitle: "Lead Electrician" },
    { id: "emp_jordan", firstName: "Jordan", lastName: "Lee", jobTitle: "Painter" },
  ];
  const hit = applyYellowTalk(
    "Start September 22, Maya heading up, Jordan helper, three days, bring the 40-footer, paint is bought",
    items,
    empty,
    false,
    false,
    crew,
    "2026-09-18"
  );
  assert.equal(hit.startDate, "2026-09-22");
  assert.equal(hit.crewId, "emp_maya");
  assert.equal(hit.durationDays, 3);
  const zeroHit = applyYellowTalk("zero days on site", items, empty, true, true, crew, "2026-09-18");
  assert.equal(zeroHit.durationDays, 0);
  assert.equal(zeroHit.prep.durationDays, 0);
  assert.ok(hit.crew?.some((seat) => seat.employeeId === "emp_jordan" && seat.trade === "Helper"));
  assert.match(hit.dispatchNotes || "", /40-footer/);
  assert.equal(hit.prep.materials.paint, true);
  assert.deepEqual(scheduleDays("2026-09-22", 3), ["2026-09-22", "2026-09-23", "2026-09-24"]);
  assert.deepEqual(scheduleDays("2026-09-22", 0), []);
  assert.equal(scheduleDays("2026-09-22", 20).length, 20);
  assert.equal(parsePrep("{}").durationDays, 0);
  assert.equal(parseSpokenDuration("a two day job"), 2);
  assert.equal(parseSpokenDuration("zero days on site"), 0);
  assert.equal(parseSpokenDuration("0 days"), 0);
  assert.equal(parseSpokenDuration("one day"), 1);
  assert.match(parseDispatchNotes("meet at the shop at 6:30") || "", /meet at the shop/i);
  assert.equal(inferTrade("Apprentice Electrician", "helper"), "Helper");
});
