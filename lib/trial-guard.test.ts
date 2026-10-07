import assert from "node:assert/strict";
import test from "node:test";
import {
  blockedCopy,
  claimsFor,
  decideTrial,
  guardBlocked,
  guardHash,
  guardLabel,
  normalizeBusiness,
  normalizeEmail,
  normalizePhone,
  reasonFromLabel,
} from "./trial-guard";
import { formatFlatPlanPrice } from "./billing";

const SECRET = "test-secret";

test("normalize: phone formats → one E.164", () => {
  for (const raw of ["(479) 555-0142", "479.555.0142", "+1 479 555 0142", "14795550142"]) {
    assert.equal(normalizePhone(raw), "+14795550142");
  }
  assert.equal(normalizePhone("555-0142"), "");
});

test("normalize: Gmail dots and +tags, googlemail, case", () => {
  assert.equal(normalizeEmail("Eric.St.Lawrence+trial2@GMail.com"), "ericstlawrence@gmail.com");
  assert.equal(normalizeEmail("eric.stlawrence@googlemail.com"), "ericstlawrence@gmail.com");
  assert.equal(normalizeEmail("jo.ann+x@shop.co"), "jo.ann@shop.co");
  assert.equal(normalizeEmail("not-an-email"), "");
});

test("normalize: business name + ZIP ignores LLC/Inc/punctuation", () => {
  const a = normalizeBusiness("Top Gun Painting, LLC", "12 Main St, Bentonville, AR 72712");
  const b = normalizeBusiness("top gun painting", "PO Box 4, Bentonville AR 72712-1234");
  assert.equal(a, "top gun painting|72712");
  assert.equal(a, b);
  assert.equal(normalizeBusiness("Top Gun Painting", "Bentonville, AR"), "", "no ZIP = no signal");
});

test("hashes are keyed, never the raw value", () => {
  const claims = claimsFor({ cardFingerprint: "fp_123", phone: "479-555-0142", email: "a@b.co" }, SECRET);
  assert.equal(claims.length, 3);
  for (const claim of claims) {
    assert.match(claim.valueHash, /^[a-f0-9]{64}$/);
    assert.ok(!claim.valueHash.includes("4795550142"));
  }
  assert.notEqual(guardHash("PHONE", "+14795550142", SECRET), guardHash("PHONE", "+14795550142", "other"));
  assert.notEqual(guardHash("PHONE", "x", SECRET), guardHash("EMAIL", "x", SECRET), "kind is part of the hash");
});

test("decide: card match blocks; device match blocks", () => {
  const mine = claimsFor({ cardFingerprint: "fp_1", phone: "4795550142" }, SECRET);
  const card = mine.find((c) => c.kind === "CARD")!;
  assert.deepEqual(decideTrial(mine, [card]), { allowed: false, reason: "card", matched: ["CARD"] });
  const dev = claimsFor({ deviceId: "install-1" }, SECRET);
  assert.equal(decideTrial(dev, dev).allowed, false);
  assert.equal((decideTrial(dev, dev) as { reason: string }).reason, "device");
});

test("decide: one soft match is allowed + flagged; two block; none allowed", () => {
  const mine = claimsFor(
    { cardFingerprint: "fp_new", phone: "4795550142", email: "eric@shop.co", businessName: "Top Gun Painting", businessAddress: "AR 72712" },
    SECRET
  );
  const phone = mine.find((c) => c.kind === "PHONE")!;
  const biz = mine.find((c) => c.kind === "BUSINESS")!;
  assert.deepEqual(decideTrial(mine, []), { allowed: true, flagged: [] });
  assert.deepEqual(decideTrial(mine, [phone]), { allowed: true, flagged: ["PHONE"] });
  const two = decideTrial(mine, [phone, biz]);
  assert.equal(two.allowed, false);
  assert.equal((two as { reason: string }).reason, "shop");
});

test("decide: an override (Eric cleared it) never counts", () => {
  const mine = claimsFor({ cardFingerprint: "fp_1" }, SECRET);
  assert.equal(decideTrial(mine, [{ ...mine[0], outcome: "override" }]).allowed, true);
});

test("labels + blocked copy use the live price", () => {
  assert.equal(guardLabel({ allowed: true, flagged: [] }), "ok");
  assert.equal(guardLabel({ allowed: true, flagged: ["PHONE"] }), "flagged:PHONE");
  assert.equal(guardLabel({ allowed: false, reason: "card", matched: ["CARD"] }), "blocked:card");
  assert.ok(guardBlocked("blocked:shop"));
  assert.ok(!guardBlocked("flagged:PHONE"));
  assert.equal(reasonFromLabel("blocked:device"), "device");
  const copy = blockedCopy("card");
  assert.equal(copy.title, "This card already used a free trial.");
  assert.equal(copy.line, `You can subscribe now for ${formatFlatPlanPrice()}.`);
  assert.equal(copy.subscribe, `Subscribe ${formatFlatPlanPrice()}`);
});
