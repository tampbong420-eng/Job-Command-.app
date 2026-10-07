import assert from "node:assert/strict";
import test from "node:test";
import { parseHoursTalk } from "./hours-talk";

const crew = [
  { id: "emp_maya", firstName: "Maya", lastName: "Chen" },
  { id: "emp_jordan", firstName: "Jordan", lastName: "Hale" },
  { id: "emp_marcus", firstName: "Marcus", lastName: "Cole" },
];

test("voice changes a named person's scheduled hours", () => {
  const hit = parseHoursTalk("Change Marcus's hours to 8", crew);
  assert.equal(hit.length, 1);
  assert.equal(hit[0].employeeId, "emp_marcus");
  assert.equal(hit[0].hours, 8);
  const maya = parseHoursTalk("Maya 6 hours", crew);
  assert.equal(maya[0].hours, 6);
  const word = parseHoursTalk("set Jordan to eight", crew);
  assert.equal(word[0].employeeId, "emp_jordan");
  assert.equal(word[0].hours, 8);
});

test("off clears hours and unknown names are ignored", () => {
  const off = parseHoursTalk("Maya is off", crew);
  assert.equal(off[0].hours, 0);
  assert.deepEqual(parseHoursTalk("Change Riley's hours to 8", crew), []);
  assert.deepEqual(parseHoursTalk("eight hours labor at 45", crew), []);
});
