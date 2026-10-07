import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  displayJobCode,
  jobCodePrefix,
  nextJobCode,
  shopBrand,
  shopInitials,
  shopOwnerName,
  shopPlace,
} from "./shop-brand";

test("Top Gun Painting initials and tickets", () => {
  assert.equal(shopInitials("Top Gun Painting"), "TGP");
  assert.equal(jobCodePrefix("Top Gun Painting"), "TGP");
  assert.equal(nextJobCode("Top Gun Painting", 0), "TGP-2100");
  assert.equal(nextJobCode("Top Gun Painting", 3), "TGP-2103");
  assert.equal(displayJobCode("JC-2041", "Top Gun Painting"), "TGP-2041");
  assert.equal(displayJobCode("JC-2103", "Top Gun Painting"), "TGP-2103");
  assert.equal(displayJobCode("TGP-1960", "Top Gun Painting"), "TGP-1960");
});

test("empty shop name is generic: no shop's name, town, or initials are built in", () => {
  const brand = shopBrand({ businessName: "", logoUrl: null, businessAddress: "" });
  assert.equal(brand.name, "Your shop");
  assert.equal(brand.initials, "JC");
  assert.equal(brand.logoUrl, null);
  assert.equal(brand.place, "");
  assert.equal(shopInitials(""), "JC");
  assert.equal(nextJobCode("", 1), "JOB-2101");
  assert.equal(displayJobCode("JC-2041", ""), "JOB-2041");
});

test("a new shop gets its own name, tickets, and town", () => {
  const brand = shopBrand({ businessName: "Acme Plumbing", logoUrl: null, businessAddress: "4500 S Peoria Ave, Tulsa, OK 74105" });
  assert.equal(brand.name, "Acme Plumbing");
  assert.equal(brand.initials, "AP");
  assert.equal(brand.place, "Tulsa, OK 74105");
  assert.equal(nextJobCode("Acme Plumbing", 0), "AP-2100");
  assert.equal(displayJobCode("TGP-1960", "Acme Plumbing"), "TGP-1960");
});

test("single-word and apostrophe shops keep short prefixes", () => {
  assert.equal(shopInitials("Harbor"), "HAR");
  assert.equal(shopInitials("Joe’s Painting"), "JP");
  assert.equal(shopPlace("1401 Higdon Ferry Rd, Hot Springs, AR 71913"), "Hot Springs, AR 71913");
  assert.equal(shopOwnerName({ ownerFirstName: "Eric", ownerLastName: "Stlawrence" }), "Eric Stlawrence");
  assert.equal(shopOwnerName({ ownerFirstName: "", ownerLastName: "" }), "");
});

test("shop chrome never loads the missing Job Command jpg", () => {
  const header = readFileSync(new URL("../components/command/EmployeeWorkspace.tsx", import.meta.url), "utf8");
  const estimate = readFileSync(new URL("../components/command/EstimateStage.tsx", import.meta.url), "utf8");
  const join = readFileSync(new URL("../app/j/[token]/page.tsx", import.meta.url), "utf8");
  const pdf = readFileSync(new URL("../app/api/export/document/route.ts", import.meta.url), "utf8");
  const lockup = readFileSync(new URL("../components/command/BrandLockup.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const actions = readFileSync(new URL("../app/actions.ts", import.meta.url), "utf8");
  assert.match(header, /BrandLockup/);
  assert.match(header, /settings=\{settings\}/);
  assert.doesNotMatch(header, /job-command-logo/);
  assert.match(estimate, /BrandMark/);
  assert.doesNotMatch(estimate, /job-command-logo/);
  assert.match(join, /BrandLockup/);
  assert.doesNotMatch(join, /job-command-logo/);
  assert.doesNotMatch(pdf, /job-command-logo/);
  assert.match(pdf, /loadShopLogoBytes/);
  assert.match(lockup, /brand-monogram/);
  assert.match(lockup, /brand-owner/);
  assert.match(css, /\.brand-owner/);
  assert.match(css, /#c6f000/i);
  assert.match(css, /object-fit:\s*contain/);
  assert.match(css, /\.brand-monogram/);
  assert.match(actions, /nextJobCode/);
  assert.doesNotMatch(actions, /JC-\$\{2100/);
});
import "./multi-tenant.test";
