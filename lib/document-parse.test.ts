import assert from "node:assert/strict";
import test from "node:test";
import { parseDocumentTalk } from "./document-parse";

test("lump-sum materials talk becomes a default priced line", () => {
  const cash = parseDocumentTalk("materials $222.00");
  assert.equal(cash.lines.length, 1);
  assert.equal(cash.lines[0].kind, "MATERIAL");
  assert.equal(cash.lines[0].description, "General Materials / Scope");
  assert.equal(cash.lines[0].quantity, 1);
  assert.equal(cash.lines[0].rate, 222);

  const flipped = parseDocumentTalk("$222.00 for materials");
  assert.equal(flipped.lines[0].kind, "MATERIAL");
  assert.equal(flipped.lines[0].rate, 222);
  assert.equal(flipped.lines[0].description, "General Materials / Scope");

  const bare = parseDocumentTalk("materials 222");
  assert.equal(bare.lines[0].rate, 222);
  assert.equal(bare.lines[0].kind, "MATERIAL");
});

test("lump labor and total talk fill default scope lines", () => {
  const labor = parseDocumentTalk("labor 800");
  assert.equal(labor.lines[0].kind, "LABOR");
  assert.equal(labor.lines[0].description, "General Labor / Scope");
  assert.equal(labor.lines[0].rate, 800);

  const total = parseDocumentTalk("total is $1500");
  assert.equal(total.lines[0].kind, "OTHER");
  assert.equal(total.lines[0].description, "General Scope");
  assert.equal(total.lines[0].rate, 1500);
});

test("itemized hours still parse as quantity times rate, not a lump", () => {
  const hit = parseDocumentTalk("8 hours labor at 45");
  assert.equal(hit.lines[0].kind, "LABOR");
  assert.equal(hit.lines[0].quantity, 8);
  assert.equal(hit.lines[0].rate, 45);
});
