import assert from "node:assert/strict";
import test from "node:test";
import { fillEditableNotes, mergeEditableLines } from "./estimate-merge";

test("photo and talk fills never overwrite a line the crew already edited", () => {
  const current = [
    { kind: "LABOR" as const, description: "Exterior prep and roll", quantity: 10, unit: "hr", rate: 50 },
  ];
  const incoming = [
    { kind: "LABOR" as const, description: "Exterior prep and roll", quantity: 14, unit: "hr", rate: 45 },
    { kind: "MATERIAL" as const, description: "Duration / finish paint", quantity: 8, unit: "gal", rate: 54 },
  ];
  const merged = mergeEditableLines(current, incoming);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].rate, 50);
  assert.equal(merged[0].quantity, 10);
  assert.equal(merged[1].description, "Duration / finish paint");
});

test("empty scope takes the draft, typed scope stays put", () => {
  assert.equal(fillEditableNotes("", "Scrape and prime the fascia."), "Scrape and prime the fascia.");
  assert.equal(fillEditableNotes("Leave the brick.", "Two coats Duration."), "Leave the brick.");
});

test("a lump-sum amount on a blank materials row stays and gets a scope label", () => {
  const current = [
    { kind: "LABOR" as const, description: "", quantity: 1, unit: "hr", rate: 0 },
    { kind: "MATERIAL" as const, description: "", quantity: 1, unit: "ea", rate: 222 },
  ];
  const incoming = [
    { kind: "MATERIAL" as const, description: "General Materials / Scope", quantity: 1, unit: "lot", rate: 222 },
  ];
  const merged = mergeEditableLines(current, incoming);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].description, "General Materials / Scope");
  assert.equal(merged[0].rate, 222);
});
