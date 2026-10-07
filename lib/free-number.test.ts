import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseFreeNumber } from "../components/command/FreeNumberInput";

test("free number typing allows zero, empty, and backspace without snapping to 1", () => {
  assert.equal(parseFreeNumber("", 0), 0);
  assert.equal(parseFreeNumber(".", 0), 0);
  assert.equal(parseFreeNumber("0", 0), 0);
  assert.equal(parseFreeNumber("00", 0), 0);
  assert.equal(parseFreeNumber("12", 0), 12);
  assert.equal(parseFreeNumber("3.5", 0), 3.5);
  assert.equal(parseFreeNumber("-", 0), 0);
  const source = readFileSync(new URL("../components/command/FreeNumberInput.tsx", import.meta.url), "utf8");
  assert.match(source, /focused\.current/);
  assert.match(source, /data-free-number="1"/);
  assert.doesNotMatch(source, /type="number"/);
  assert.doesNotMatch(source, /Math\.max\(1/);
});
