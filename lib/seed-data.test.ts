import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const seed = readFileSync(new URL("../prisma/seed.ts", import.meta.url), "utf8");

test("sample data is a Hot Springs painting shop", () => {
  for (const code of ["TGP-2041", "TGP-1888", "TGP-2103", "TGP-1960", "EST-1001"]) assert.match(seed, new RegExp(code));
  assert.match(seed, /Lead Painter/);
  assert.match(seed, /Prep Tech/);
  assert.match(seed, /Hot Springs, AR 719\d\d/);
  assert.doesNotMatch(seed, /Electric|Plumb|HVAC|Roof|Millford|ST 00000/);
});

test("sample contact details stay obviously fictional", () => {
  const phones = [...seed.matchAll(/phone: "([^"]+)"/g)].map((hit) => hit[1]);
  const listed = [...seed.matchAll(/\{ phone: "([^"]+)"/g)].map((hit) => hit[1]);
  for (const phone of [...phones, ...listed]) assert.match(phone, /^501-555-01\d\d$/);
  const emails = [...seed.matchAll(/[\w.]+@[\w.]+/g)].map((hit) => hit[0]);
  for (const email of emails) assert.match(email, /\.example$/);
});

test("only recent days sit on the open jobs and 'today' is the shop's day", () => {
  assert.match(seed, /const onOpenJobs = offset >= -10;/);
  assert.match(seed, /const today = shopToday\(\);/);
  assert.doesNotMatch(seed, /utcDay\(new Date\(\)\)/);
});
