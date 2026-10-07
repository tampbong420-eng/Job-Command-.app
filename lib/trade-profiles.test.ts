import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CREW_VOICE,
  crewTextInput,
  crewVoiceForTrade,
  docsTalkTask,
  leadInput,
  leadPrompt,
  orangePhotoPrompt,
  photoPrompt,
  siteTalkTask,
} from "./ai-voice";
import { DEPOSIT_CHOICES } from "./pay-prefs";
import { parseSizeTalk } from "./setup-parse";
import {
  PAINT_WORDS,
  PICKER_TRADES,
  defaultEstimate,
  defaultServices,
  isPainting,
  otherProfile,
  pickerProfiles,
  tradeProfile,
  tradeVocabLine,
} from "./trade-profiles";
import { TRADE_IDS, parseTrade } from "./trade";

const icons = readFileSync(new URL("../components/signup/icon-paths.ts", import.meta.url), "utf8");
const job = { code: "TGP-2108", name: "Main job", client: "Mercer", address: "12 Elm", notes: "" };

test("the picker is Eric's exact 15 trades, in his order, plus Other", () => {
  assert.deepEqual(
    pickerProfiles().map((profile) => profile.label),
    [
      "Painting",
      "Roofing",
      "Asphalt & Paving",
      "Electrical",
      "Plumbing",
      "Masonry & Brick",
      "HVAC",
      "Carpentry & Framing",
      "Concrete",
      "Drywall",
      "Flooring",
      "Landscaping & Lawn",
      "Fencing & Decks",
      "Siding & Gutters",
      "Remodeling / General Contractor",
    ]
  );
  assert.equal(PICKER_TRADES.length, 15);
  assert.equal(tradeProfile("HVAC").sub, "Heating & air");
  assert.equal(tradeProfile("Remodeling").sub, "Kitchens, baths, additions");
  assert.equal(otherProfile().id, "Other");
  for (const id of PICKER_TRADES) assert.ok((TRADE_IDS as readonly string[]).includes(id), id);
});

test("every trade has its own job tiles, estimate numbers, and later questions", () => {
  for (const profile of [...pickerProfiles(), otherProfile()]) {
    assert.equal(profile.services.length, 8, profile.id);
    assert.ok(defaultServices(profile).length >= 3, profile.id);
    assert.equal(new Set(profile.services.map((tile) => tile.id)).size, 8, profile.id);
    for (const tile of [...profile.services.map((item) => item.icon), profile.icon]) {
      assert.match(icons, new RegExp(`"${tile}":`), `${profile.id} icon ${tile}`);
    }
    const est = defaultEstimate(profile);
    assert.ok(est.rate > 0, profile.id);
    assert.ok((DEPOSIT_CHOICES as readonly number[]).includes(est.deposit), `${profile.id} deposit ${est.deposit}`);
    assert.ok(est.validDays > 0 && est.markup >= 0, profile.id);
    assert.ok(profile.later.length >= 2, `${profile.id} later questions`);
    // Lawn crews don't carry a general contractor license; everyone else is asked before the first estimate.
    if (profile.id !== "Landscaping") assert.ok(profile.later.some((item) => item.key === "license"), `${profile.id} asks license later`);
    assert.ok(profile.ai.vocab.length >= 4, profile.id);
  }
  assert.equal(defaultEstimate(tradeProfile("Electrical")).rate, 95);
  assert.equal(defaultEstimate(tradeProfile("Roofing")).choice, "1");
  assert.ok(defaultServices(tradeProfile("Electrical")).includes("panels"));
});

test("trade lookups: blank = Painting (older shops), Other stays Other, Construction folds into Remodeling", () => {
  assert.equal(tradeProfile("").id, "Painting");
  assert.equal(tradeProfile(null).id, "Painting");
  assert.equal(tradeProfile("Other").id, "Other");
  assert.equal(tradeProfile("Construction").id, "Remodeling");
  assert.equal(tradeProfile("electrical").id, "Electrical");
  assert.equal(isPainting("Painting"), true);
  assert.equal(isPainting("Electrical"), false);
  assert.equal(parseTrade("Siding").label, "Siding");
  assert.equal(parseSizeTalk("we hang sheetrock").industry, "Drywall");
  assert.equal(parseSizeTalk("lawn care and landscaping, just me").industry, "Landscaping");
  assert.equal(parseSizeTalk("seamless gutters and siding").industry, "Siding");
  assert.equal(parseSizeTalk("brick and stone work").industry, "Masonry");
});

test("painting shops get the exact same co-pilot prompts as before", () => {
  for (const industry of [undefined, null, "", "Painting"]) {
    assert.equal(crewVoiceForTrade(industry), CREW_VOICE);
    assert.equal(crewTextInput("Task", "speech", industry).system, CREW_VOICE);
    assert.equal(leadPrompt("hi", industry), leadPrompt("hi"));
    assert.equal(leadInput("hi", industry).system, CREW_VOICE);
    assert.equal(siteTalkTask(industry), siteTalkTask());
    assert.equal(docsTalkTask(industry), docsTalkTask());
    assert.equal(photoPrompt(job, "rates", industry), photoPrompt(job, "rates"));
    assert.equal(orangePhotoPrompt(job, "market", "talk", industry), orangePhotoPrompt(job, "market", "talk"));
  }
  assert.match(leadPrompt("hi"), /what they want painted/);
  assert.match(siteTalkTask(), /\$45\/hr/);
  assert.match(CREW_VOICE, /Top Gun Painting/);
});

test("an electrician (or any non-painting trade) never gets painting questions or wording", () => {
  for (const profile of [...pickerProfiles().filter((item) => item.id !== "Painting"), otherProfile()]) {
    const id = profile.id;
    const prompts = [
      crewVoiceForTrade(id),
      crewTextInput("Task", "speech", id).system,
      leadPrompt("hi", id),
      leadInput("hi", id).system,
      siteTalkTask(id),
      docsTalkTask(id),
      photoPrompt(job, "rates", id),
      orangePhotoPrompt(job, "market", "talk", id),
      tradeVocabLine(id),
      profile.services.map((tile) => tile.label).join(" "),
      profile.later.map((item) => item.label).join(" "),
      profile.estimate.markupLabel,
      profile.estimate.rate.label,
    ];
    for (const text of prompts) assert.doesNotMatch(text, PAINT_WORDS, `${id}: ${text.slice(0, 120)}`);
    assert.doesNotMatch(crewVoiceForTrade(id), /Top Gun Painting/, id);
  }
  assert.match(leadPrompt("hi", "Electrical"), /electrical work/);
  assert.match(crewVoiceForTrade("Electrical"), /breakers/);
  assert.match(siteTalkTask("Roofing"), /squares|sq/);
});
