import assert from "node:assert/strict";
import test from "node:test";
import { formatShellInk, parseShellInk, typeInkColor } from "./shell-ink";

test("letter colors stay on the canvas they were picked for", () => {
  const both = parseShellInk("fluoro,black");
  assert.equal(formatShellInk(both), "fluoro,black");
  assert.equal(typeInkColor(both, "dark"), "#d8ff3a");
  assert.equal(typeInkColor(both, "light"), "#111111");
  assert.equal(typeInkColor(parseShellInk("pink,"), "light"), null);
  assert.equal(typeInkColor(parseShellInk("pink,"), "dark"), "#ff2bd6");
  assert.equal(typeInkColor(parseShellInk("forange,"), "dark"), "#ff9a00");
  assert.equal(typeInkColor(parseShellInk(",red"), "dark"), null);
  assert.equal(typeInkColor(parseShellInk(",red"), "light"), "#b10e0e");
  assert.equal(typeInkColor(parseShellInk(",orange"), "light"), "#c2410c");
  assert.equal(typeInkColor(parseShellInk(",hpink"), "light"), "#be185d");
  assert.equal(typeInkColor(parseShellInk(",white"), "light"), "#ffffff");
  assert.equal(typeInkColor(parseShellInk(",fluoro"), "light"), "#d8ff3a");
  assert.equal(typeInkColor(parseShellInk(",green"), "light"), null);
  assert.equal(typeInkColor(parseShellInk("white,"), "dark"), "#ffffff");
  assert.equal(typeInkColor(parseShellInk(""), "dark"), null);
  assert.equal(formatShellInk(parseShellInk("nope,nope")), "");
});
