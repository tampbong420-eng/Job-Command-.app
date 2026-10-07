import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { setShopTimeZone, shopDayString, shopTimeZone, todayString } from "./dates";
import { invoiceTermsFor, DEFAULT_INVOICE_TERMS, BRAND } from "./documents";
import { isPaintingTrade, shopPlaceFor, stateForAddress, stateForZip } from "./shop-place";

test("shop place comes from the shop's own address (state, state name, or ZIP)", () => {
  assert.equal(stateForAddress("4500 S Peoria Ave, Tulsa, OK 74105")?.code, "OK");
  assert.equal(stateForAddress("Tulsa, Oklahoma")?.code, "OK");
  assert.equal(stateForAddress("Hot Springs, AR")?.code, "AR");
  assert.equal(stateForAddress("55 Main St, Boise, ID 83702, USA")?.code, "ID");
  assert.equal(stateForAddress("12 Texas Ave"), null);
  assert.equal(stateForZip("10001")?.code, "NY");
  assert.equal(stateForZip("90210")?.code, "CA");
  const tulsa = shopPlaceFor("4500 S Peoria Ave, Tulsa, OK 74105");
  assert.equal(tulsa?.label, "Tulsa, OK");
  assert.equal(tulsa?.timeZone, "America/Chicago");
  assert.equal(shopPlaceFor("1 Main St, Fresno, CA 93721")?.timeZone, "America/Los_Angeles");
  assert.equal(shopPlaceFor("1 Main St, Phoenix, AZ 85004")?.timeZone, "America/Phoenix");
  assert.equal(shopPlaceFor(""), null);
});

test("the shop clock follows the shop's zone, with a generic default", () => {
  const late = new Date("2026-10-02T05:30:00Z"); // 12:30 AM Central, 10:30 PM Pacific the day before
  setShopTimeZone(null);
  assert.equal(shopTimeZone(), "America/Chicago");
  assert.equal(todayString(late), "2026-10-02");
  setShopTimeZone("America/Los_Angeles");
  assert.equal(shopTimeZone(), "America/Los_Angeles");
  assert.equal(todayString(late), "2026-10-01");
  assert.equal(shopDayString(late, "UTC"), "2026-10-02");
  setShopTimeZone("Not/AZone");
  assert.equal(shopTimeZone(), "America/Chicago");
  setShopTimeZone(null);
});

test("documents carry the shop's own name, never a built-in one", () => {
  assert.equal(BRAND.platform, "Job Command");
  assert.equal(BRAND.city, "");
  assert.doesNotMatch(`${BRAND.tradeName} ${DEFAULT_INVOICE_TERMS}`, /Top Gun|Hot Springs/);
  assert.match(invoiceTermsFor("Acme Plumbing"), /Thank you for choosing Acme Plumbing\./);
  assert.match(invoiceTermsFor("Top Gun Painting"), /Thank you for choosing Top Gun Painting\./);
  assert.equal(invoiceTermsFor(""), DEFAULT_INVOICE_TERMS);
  assert.equal(isPaintingTrade(""), true);
  assert.equal(isPaintingTrade("Painting"), true);
  assert.equal(isPaintingTrade("Plumbing"), false);
});

test("runtime code names no single shop (App Store: any contractor)", () => {
  const files = [
    "../app/layout.tsx",
    "../public/manifest.webmanifest",
    "../public/sw.js",
    "../lib/documents.ts",
    "../lib/shop-brand.ts",
    "../lib/estimate-copy.ts",
    "../lib/theme-auto.ts",
    "../lib/dates.ts",
    "../lib/maps.ts",
    "../lib/market-pricing.ts",
    "../lib/lead-parse.ts",
    "../lib/weather.ts",
    "../lib/workspace-fallback.ts",
    "../app/api/weather/route.ts",
    "../app/api/export/document/route.ts",
    "../app/api/upload/route.ts",
    "../components/command/JobFolder.tsx",
    "../components/command/EstimateStage.tsx",
    "../components/command/PayrollSetup.tsx",
    "../components/command/ActiveStage.tsx",
    "../components/command/LeadStage.tsx",
    "../hooks/use-shell-theme.tsx",
    "../hooks/use-site-weather.ts",
  ];
  for (const file of files) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /Top Gun|TOP GUN|Hot Springs|Arkansas|Dana Reeves|Stlawrence|71901|71913|501[ -]555/, file);
  }
  const manifest = JSON.parse(readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
  assert.equal(manifest.name, "Job Command");
  const cap = JSON.parse(readFileSync(new URL("../capacitor.config.json", import.meta.url), "utf8"));
  assert.equal(cap.appName, "Job Command");
});
