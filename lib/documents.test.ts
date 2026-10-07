import assert from "node:assert/strict";
import test from "node:test";
import {
  blankLine,
  ensureScopeLines,
  estimateIsReady,
  isPricedLine,
} from "./documents";

test("a labor, materials, or total amount opens the estimate even with a blank description", () => {
  const material = { ...blankLine("MATERIAL"), rate: 222 };
  assert.equal(isPricedLine(material), true);
  assert.equal(estimateIsReady([blankLine("LABOR"), material]), true);
  const labeled = ensureScopeLines([blankLine("LABOR"), material]);
  assert.ok(labeled.some((line) => line.description === "General Materials / Scope" && line.rate === 222));
  assert.equal(estimateIsReady([blankLine("LABOR"), blankLine("MATERIAL")]), false);
});

test("labor-only and total-only rows also satisfy the gate", () => {
  const labor = { ...blankLine("LABOR"), quantity: 1, rate: 800 };
  assert.equal(estimateIsReady([labor]), true);
  assert.equal(ensureScopeLines([labor])[0].description, "General Labor / Scope");
  const total = { kind: "OTHER" as const, description: "", quantity: 1, unit: "lot", rate: 1500 };
  assert.equal(ensureScopeLines([total])[0].description, "General Scope");
});
