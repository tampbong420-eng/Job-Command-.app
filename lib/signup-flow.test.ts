import assert from "node:assert/strict";
import test from "node:test";
import {
  SECTIONS,
  SIGNUP_STEPS,
  blankSignup,
  buildSignupPayload,
  canSkip,
  doneSummary,
  laterItems,
  nextLabel,
  nextStepKey,
  pinFor,
  prevStepKey,
  sectionFill,
  sectionIndex,
  signupFromSettings,
  stepProblem,
  townFrom,
  withTrade,
  type SignupState,
} from "./signup-flow";
import { BLANK_SHOP_PROFILE, onlyKnownColumns, shopProfileFromRow, shopProfilePatch } from "./signup-shop";

function filled(extra: Partial<SignupState> = {}): SignupState {
  return {
    ...withTrade(blankSignup(), "Painting"),
    firstName: "Eric",
    lastName: "Stlawrence",
    cell: "(501) 555-0142",
    email: "eric@topgunpainting.com",
    ...extra,
  };
}

const PAY = { frequency: "WEEKLY" as const, periodStart: "2026-09-28" };
const BUILD = { pay: PAY, answeringLine: "+15015550000", shellTheme: "dark", shellInk: "" };

test("five sections, welcome → done, and the steps the mockups show", () => {
  assert.deepEqual(SECTIONS.map((s) => s.label), ["You", "Shop", "Crew", "Paid", "Ready"]);
  assert.deepEqual(
    SIGNUP_STEPS.map((s) => s.key),
    ["welcome", "you", "trade", "services", "company", "area", "size", "people", "methods", "estimate", "trial", "done"]
  );
  assert.equal(sectionIndex("trade"), 1);
  assert.equal(sectionIndex("done"), 5);
  assert.ok(sectionFill("services") > sectionFill("trade"));
});

test("first run starts blank — no example values — with card + cash on", () => {
  const blank = blankSignup();
  assert.equal(blank.firstName, "");
  assert.equal(blank.email, "");
  assert.equal(blank.trade, "");
  assert.equal(blank.companyName, "");
  assert.equal(blank.acceptCard, true);
  assert.equal(blank.acceptCash, true);
  assert.equal(blank.acceptAch, false);
  // Even if the row has leftovers, an unfinished setup never prefills.
  const fresh = signupFromSettings({
    setupComplete: false,
    ownerFirstName: "Dana",
    ownerLastName: "R",
    ownerEmail: "d@x.com",
    ownerPhone: "5015550100",
    businessName: "Old",
    businessAddress: "",
    companyPhone: "",
    industry: "Electrical",
    businessSize: "2_3",
    acceptCard: true,
    acceptAch: false,
    acceptCash: true,
    depositPercent: 0,
  });
  assert.equal(fresh.firstName, "");
  assert.equal(fresh.trade, "");
});

test("a finished shop re-opening setup gets its answers back (so the button says Looks right)", () => {
  const back = signupFromSettings({
    setupComplete: true,
    ownerFirstName: "Eric",
    ownerLastName: "Stlawrence",
    ownerEmail: "eric@sparky.com",
    ownerPhone: "5015550142",
    businessName: "Sparky Electric",
    businessAddress: "118 Central Ave, Hot Springs, AR 71901",
    companyPhone: "5015550142",
    industry: "Electrical",
    businessSize: "4_10",
    acceptCard: true,
    acceptAch: true,
    acceptCash: false,
    depositPercent: 25,
    shop: { ...BLANK_SHOP_PROFILE, services: ["panels"], laborRate: 110, serviceRadiusMi: 50 },
  });
  assert.equal(back.trade, "Electrical");
  assert.deepEqual(back.services, ["panels"]);
  assert.equal(back.estimate.rate, 110);
  assert.equal(back.radius, 50);
  assert.equal(back.estimate.deposit, 25);
  assert.equal(back.companyPhone, "");
  assert.equal(back.size, "4_10");
});

test("You: first name, email and an office PIN the owner picks are required (never the end of the cell)", () => {
  assert.match(stepProblem("you", filled({ firstName: "" }))!, /first name/i);
  assert.match(stepProblem("you", filled({ email: "" }))!, /email/i);
  assert.match(stepProblem("you", filled({ email: "eric@" }))!, /email/i);
  // Go-public B1: no default PIN from the cell.
  assert.equal(pinFor(filled()), "");
  assert.match(stepProblem("you", filled())!, /PIN/);
  assert.equal(pinFor(filled({ pin: "7783" })), "7783");
  assert.equal(stepProblem("you", filled({ pin: "7783" })), null);
  assert.match(stepProblem("you", filled({ pin: "12" }))!, /4 to 6/);
  assert.match(stepProblem("you", filled({ pin: "1234" }))!, /too easy/);
  assert.match(stepProblem("you", filled({ pin: "0142" }))!, /phone number/);
  assert.equal(stepProblem("you", filled({ cell: "", pin: "4827" })), null);
});

test("Trade is required; Other needs the typed trade", () => {
  assert.match(stepProblem("trade", { ...filled(), trade: "" })!, /trade/i);
  assert.match(stepProblem("trade", withTrade(filled(), "Other"))!, /Type your trade/);
  assert.equal(stepProblem("trade", { ...withTrade(filled(), "Other"), tradeOther: "Window washing" }), null);
});

test("the payment screen never blocks Next (old bug), even with nothing picked", () => {
  const none = filled({ acceptCard: false, acceptCash: false, acceptAch: false });
  assert.equal(stepProblem("methods", none), null);
  assert.equal(canSkip("methods"), true);
});

test("skip only where it's safe", () => {
  for (const key of ["services", "company", "area", "size", "people", "methods", "estimate"] as const) {
    assert.equal(canSkip(key), true, key);
  }
  for (const key of ["welcome", "you", "trade", "trial", "done"] as const) assert.equal(canSkip(key), false, key);
  assert.match(stepProblem("trial", filled())!, /Terms/);
  assert.equal(stepProblem("trial", filled({ terms: true })), null);
});

test("“Just me” skips the add-people screen both ways", () => {
  const solo = filled({ size: "JUST_ME" });
  assert.equal(nextStepKey("size", solo), "methods");
  assert.equal(prevStepKey("methods", solo), "size");
  const crew = filled({ size: "4_10" });
  assert.equal(nextStepKey("size", crew), "people");
  assert.equal(prevStepKey("methods", crew), "people");
});

test("big button says Looks right when I filled the screen in", () => {
  const state = filled();
  assert.equal(nextLabel("area", state), "Looks right");
  assert.equal(nextLabel("estimate", state), "Looks right");
  // Services says Next (mockup), even when tiles are on.
  assert.equal(nextLabel("services", state), "Next");
  assert.equal(nextLabel("people", { ...state, people: [] }), "Next");
  assert.equal(nextLabel("people", { ...state, people: [{ firstName: "Riley", lastName: "Nash", phone: "5015550188", role: "crew" }] }), "Send invites");
  assert.equal(nextLabel("trial", state), "Start free trial");
  assert.equal(nextLabel("done", state), "Add my first job");
});

test("switching trade swaps job tiles and estimate numbers", () => {
  const paint = filled();
  assert.equal(paint.estimate.rate, 55);
  const elec = withTrade(paint, "Electrical");
  assert.equal(elec.estimate.rate, 95);
  assert.ok(elec.services.includes("panels"));
  assert.ok(!elec.services.includes("interior"));
  assert.equal(elec.estimate.extras.serviceCall, 89);
});

test("payload: theme, pay period, books, rates, answering line stay out of signup (defaults only)", () => {
  const state = {
    ...withTrade(filled({ terms: true, size: "4_10", pin: "7783" }), "Electrical"),
    companyName: "Sparky Electric",
    people: [
      { firstName: "Jordan", lastName: "Vance", phone: "501-555-0177", role: "boss" as const },
      { firstName: "Riley", lastName: "Nash", phone: "501-555-0188", role: "crew" as const },
      { firstName: "", lastName: "", phone: "", role: "crew" as const },
    ],
  };
  const { onboarding, shop } = buildSignupPayload(state, BUILD);
  assert.equal(onboarding.owner.pin, "7783");
  assert.equal(onboarding.business.industry, "Electrical");
  assert.equal(onboarding.business.size, "4_10");
  assert.equal(onboarding.accountingSoftware, "NONE");
  assert.equal(onboarding.frequency, "WEEKLY");
  assert.equal(onboarding.shellTheme, "dark");
  assert.equal(onboarding.companyPhone, "(501) 555-0142");
  assert.equal(onboarding.termsAccepted, true);
  assert.deepEqual(onboarding.bosses.map((b) => b.firstName), ["Jordan"]);
  assert.deepEqual(onboarding.crew.map((c) => [c.firstName, c.hourlyRate]), [["Riley", 0]]);
  assert.equal(onboarding.payPrefs.depositPercent, 0);
  assert.equal(shop.laborRate, 95);
  assert.deepEqual(shop.tradeDefaults, { choice: "master", extras: { serviceCall: 89 } });
  assert.equal(shop.serviceRadiusMi, 30);
  const other = buildSignupPayload({ ...withTrade(filled(), "Other"), tradeOther: "Window washing" }, BUILD);
  assert.equal(other.onboarding.business.industry, "Other");
  assert.equal(other.shop.tradeLabel, "Window washing");
  assert.match(other.onboarding.business.name, /Eric’s Window washing/);
});

test("finish-later list and the You're-set summary", () => {
  const solo = filled({ size: "JUST_ME" });
  const keys = laterItems(solo).map((item) => item.key);
  for (const key of ["logo", "license", "bank", "answering", "books"]) assert.ok(keys.includes(key), key);
  // Final merge: mockup order (logo, license, bank, pay rates, answering, books, Google review link),
  // then the built list's trade items (paint brand, lead-safe cert) and the light/dark look.
  assert.deepEqual(keys.slice(0, 6), ["logo", "license", "bank", "answering", "books", "review"]);
  assert.deepEqual(keys.slice(6), ["supplier", "rrp", "look"]);
  assert.deepEqual(laterItems(filled({ size: "4_10" })).map((item) => item.key).slice(0, 6), ["logo", "license", "bank", "payroll", "answering", "books"]);
  assert.ok(!keys.includes("payroll"));
  assert.ok(laterItems(filled({ size: "4_10" })).some((item) => item.key === "payroll"));
  assert.ok(!laterItems(solo, ["license"]).some((item) => item.key === "license"));
  const lines = doneSummary({ ...filled(), address: "118 Central Ave, Hot Springs, AR 71901" });
  assert.deepEqual(lines, ["Painting · 4 job types", "30 mi of Hot Springs, AR · Mon–Fri", "Just you for now", "$55/hr · 25% deposit"]);
  assert.equal(townFrom("118 Central Ave"), "");
  const crew = [
    { firstName: "Jordan", lastName: "Vance", phone: "5015550177", role: "boss" as const },
    { firstName: "Riley", lastName: "Nash", phone: "5015550188", role: "crew" as const },
    { firstName: "Sam", lastName: "Ellis", phone: "5015550123", role: "crew" as const },
  ];
  assert.equal(doneSummary({ ...filled(), people: crew, invitesSent: 3 })[2], "3 invites sent");
  assert.equal(doneSummary({ ...filled(), people: crew, invitesSent: 1 })[2], "1 invite sent");
  assert.equal(doneSummary({ ...filled(), people: crew })[2], "3 invites ready to text");
});

test("shop profile columns are clamped, and an old Prisma client just skips them", () => {
  const patch = shopProfilePatch({ serviceRadiusMi: 9999, workStart: "25:00", materialsMarkup: -4, services: ["a", "a2"], workDays: "NOPE" as never });
  assert.equal(patch.serviceRadiusMi, 500);
  assert.equal(patch.workStart, "07:00");
  assert.equal(patch.materialsMarkup, 0);
  assert.equal(patch.services, '["a","a2"]');
  assert.equal(patch.workDays, "MON_FRI");
  assert.deepEqual(onlyKnownColumns(patch, ["serviceRadiusMi"]), { serviceRadiusMi: 500 });
  const old = shopProfileFromRow({ businessName: "x" });
  assert.deepEqual(old, BLANK_SHOP_PROFILE);
  assert.deepEqual(shopProfileFromRow({ services: '["panels"]', tradeDefaults: '{"choice":"master","extras":{"serviceCall":89}}' }).tradeDefaults, {
    choice: "master",
    extras: { serviceCall: 89 },
  });
});
