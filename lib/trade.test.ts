import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DEFAULT_TRADE, TRADE_IDS, TRADES, parseTrade, tradeVoiceBlurb } from "./trade";
import { parseSizeTalk } from "./setup-parse";

test("painting is the default trade and every listed trade has a lexicon", () => {
  assert.equal(DEFAULT_TRADE, "Painting");
  assert.ok(TRADE_IDS.includes("Electrical"));
  assert.ok(TRADE_IDS.includes("Asphalt"));
  assert.equal(parseTrade("painting").id, "Painting");
  assert.equal(parseTrade("Top Gun Painting").id, "Painting");
  assert.equal(parseTrade("hvac").label, "HVAC");
  assert.match(parseTrade("Asphalt").materials, /asphalt/i);
  assert.match(tradeVoiceBlurb("Electrical"), /electrical/i);
  assert.match(tradeVoiceBlurb(""), /Top Gun Painting/);
});

test("size talk picks painting, asphalt, and plumbing", () => {
  assert.equal(parseSizeTalk("we're a painting crew, three people").industry, "Painting");
  assert.equal(parseSizeTalk("asphalt driveways, just me").industry, "Asphalt");
  assert.equal(parseSizeTalk("plumbing shop, four people").industry, "Plumbing");
});

test("signup trade buttons use spaced choice labels", () => {
  const setup = readFileSync(new URL("../components/command/CompanySetup.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const jammed =
    /PaintingTop|Electricalpanel|Plumbingrough|HVACchange|Asphaltdrive|Roofingtear|Constructiongeneral|Remodelinginterior|Othertrade/i;
  assert.equal(parseTrade("Electrical").choice, "Electrical Panel");
  assert.equal(parseTrade("Plumbing").choice, "Plumbing Rough-in");
  assert.equal(parseTrade("HVAC").choice, "HVAC Changeouts");
  assert.equal(parseTrade("Asphalt").choice, "Asphalt Driveways");
  assert.equal(parseTrade("Roofing").choice, "Roofing Tear-off");
  for (const trade of TRADES) {
    assert.doesNotMatch(trade.choice, jammed);
  }
  assert.match(setup, /aria-pressed=\{selected\}/);
  assert.match(setup, /data-trade-grid="1"/);
  assert.match(setup, /pickerProfiles\(\)/);
  assert.match(setup, /onClick=\{\(\) => setState\(\(value\) => withTrade\(value, item\.id\)\)\}/);
  assert.match(css, /\[data-trade-picker\] button\.on/);
  assert.match(css, /\.setup-desk \[data-trade-picker\] button\.on[^}]*#c9a227/);
  assert.doesNotMatch(setup, jammed);
  assert.match(css, /\[data-trade-picker\] button/);
  assert.match(css, /\.setup-desk \[data-trade-picker\] button[^}]*pointer-events:\s*auto/);
  assert.match(css, /\.setup-desk \[data-trade-picker\] button[^}]*min-height:\s*52px/);
  assert.match(css, /\.setup-desk \[data-trade-picker\] button \*[^}]*pointer-events:\s*none/);
  const pulseHits = [...css.matchAll(/animation:\s*taskPulse 4s infinite ease-in-out/g)];
  assert.equal(pulseHits.length, 3);
});
