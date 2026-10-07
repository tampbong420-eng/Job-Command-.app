import assert from "node:assert/strict";
import test from "node:test";
import {
  blendMarketRates,
  describeMarket,
  extractGallonRates,
  extractHourlyRates,
  regionalFloor,
  researchUrls,
} from "./market-pricing";
import { DEFAULT_PRICING } from "./pricing-rates";

test("pulls hourly and gallon rates out of contractor pages", () => {
  const html = `
    Mean hourly wage $23.40
    Residential painters charge $45-$65 per hour in Arkansas.
    Duration is about $54 per gallon at the counter.
    Primer runs $28/gal.
  `;
  assert.ok(extractHourlyRates(html).includes(45));
  assert.ok(extractHourlyRates(html).includes(65));
  assert.ok(extractGallonRates(html).includes(54));
  assert.ok(extractGallonRates("Primer runs $28/gal.").includes(28));
});

test("blends live web rates with shop memory and stays in a real band", () => {
  const blended = blendMarketRates(DEFAULT_PRICING, { labor: 60, duration: 58, primer: 32 }, true);
  assert.ok(blended.labor > DEFAULT_PRICING.labor);
  assert.ok(blended.labor < 60);
  assert.match(describeMarket(regionalFloor("Hot Springs, AR")), /Hot Springs/);
  assert.match(describeMarket(regionalFloor("Hot Springs, AR")), /\$48\/hr/);
});

test("the market check follows each shop's own town and trade, with no town built in", () => {
  assert.match(describeMarket(regionalFloor("")), /your area/);
  assert.doesNotMatch(describeMarket(regionalFloor("")), /Hot Springs|Arkansas/);
  assert.match(describeMarket(regionalFloor("Tulsa, OK")), /Tulsa, OK/);
  const plumber = researchUrls({ region: "Tulsa, OK", state: "Oklahoma", trade: "Plumbing" });
  assert.equal(plumber.length, 1);
  assert.match(plumber[0].url, /plumbing.*Tulsa.*Oklahoma/);
  assert.doesNotMatch(plumber.map((u) => u.url).join(" "), /Hot\+Springs|Arkansas|painters|Duration/);
  const painter = researchUrls({ region: "Hot Springs, AR", state: "Arkansas", trade: "Painting" });
  assert.equal(painter.length, 3);
  assert.match(painter[1].url, /painting.*Hot\+Springs.*Arkansas/);
});
