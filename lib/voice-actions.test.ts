import assert from "node:assert/strict";
import test from "node:test";
import { clockLabel, hoursUntil, parseMaterial, parseSpokenTime, parseVoiceActions, splitClauses, type VoiceCtx } from "./voice-actions";

const crew = [
  { id: "casey", firstName: "Casey", lastName: "Quinn" },
  { id: "jordan", firstName: "Jordan", lastName: "Vale" },
  { id: "riley", firstName: "Riley", lastName: "Nash" },
];
const office: VoiceCtx = { crew, role: "office" };

function kinds(text: string, ctx: VoiceCtx = office) {
  return parseVoiceActions(text, ctx).map((row) => `${row.kind}${row.blocked ? "!" : ""}`);
}

test("Eric’s sentence: primer to Materials and Casey’s clock-out to Hours", () => {
  const chips = parseVoiceActions("Add 2 gallons SW 7006 primer and Casey left at 3", office);
  assert.equal(chips.length, 2);
  const [mat, clock] = chips;
  assert.equal(mat.kind, "material");
  assert.equal(mat.label, "+ 2 gal SW 7006 primer");
  assert.equal(mat.dest, "Materials");
  assert.equal(clock.kind, "clock-at");
  assert.equal(clock.label, "Casey Quinn clock-out 3:00 PM");
  assert.equal(clock.dest, "Hours");
  assert.equal(clock.blocked, undefined);
  if (clock.kind === "clock-at") {
    assert.equal(clock.at, "15:00");
    assert.equal(clock.action, "OUT");
  }
});

test("materials: words, five-gallon buckets, codes, and plain names", () => {
  assert.deepEqual(parseMaterial("add two gallons of Sherwin Williams 7036"), { qty: 2, unit: "gal", code: "SW 7036", name: "" });
  assert.deepEqual(parseMaterial("we need a five gallon bucket of accessible beige"), { qty: 5, unit: "gal", code: "", name: "accessible beige" });
  assert.deepEqual(parseMaterial("picked up 6 tubes of caulk"), { qty: 6, unit: "tube", code: "", name: "caulk" });
  assert.deepEqual(parseMaterial("got 3 rolls tape"), { qty: 3, unit: "roll", code: "", name: "tape" });
  assert.equal(parseMaterial("Casey left at 3"), null);
  assert.equal(parseMaterial("add gallons"), null);
});

test("spoken times use the work day when am/pm is missing", () => {
  assert.equal(parseSpokenTime("3"), "15:00");
  assert.equal(parseSpokenTime("3:30"), "15:30");
  assert.equal(parseSpokenTime("three thirty"), "15:30");
  assert.equal(parseSpokenTime("7"), "07:00");
  assert.equal(parseSpokenTime("noon"), "12:00");
  assert.equal(parseSpokenTime("7 pm"), "19:00");
  assert.equal(parseSpokenTime("11 a.m."), "11:00");
  assert.equal(parseSpokenTime("whenever"), null);
  assert.equal(clockLabel("15:00"), "3:00 PM");
  assert.equal(clockLabel("07:05"), "7:05 AM");
  assert.equal(clockLabel("12:00"), "12:00 PM");
});

test("hours from a clock-in to a spoken time", () => {
  const start = new Date(2026, 9, 2, 7, 0, 0).toISOString();
  assert.equal(hoursUntil(start, "15:00"), 8);
  assert.equal(hoursUntil(start, "06:00"), null);
});

test("hours, tasks, punch, crew page, notes, photo", () => {
  assert.deepEqual(kinds("change Jordan's hours to 6"), ["hours"]);
  assert.deepEqual(kinds("add task wash the east wall"), ["task"]);
  assert.equal(parseVoiceActions("add task touch up fascia", office)[0].dest, "Tasks · Trim");
  assert.deepEqual(kinds("punch list drip on the east sill"), ["punch"]);
  assert.deepEqual(kinds("touch up the hose bib"), ["punch"]);
  assert.deepEqual(kinds("tell the crew lunch at noon"), ["page"]);
  assert.deepEqual(kinds("note the gate code is 4417"), ["note"]);
  assert.deepEqual(kinds("take a photo"), ["photo"]);
  assert.deepEqual(kinds("Riley got here at 7:30"), ["clock-at"]);
});

test("finished tasks match by words; a scrape and sand task is not split in half", () => {
  const ctx: VoiceCtx = {
    ...office,
    tasks: [
      { id: "t1", text: "East siding coat 1", done: false },
      { id: "t2", text: "Fascia and soffit", done: false },
    ],
  };
  const chips = parseVoiceActions("we finished the east siding", ctx);
  assert.equal(chips[0].kind, "task-done");
  if (chips[0].kind === "task-done") assert.equal(chips[0].taskId, "t1");
  assert.deepEqual(splitClauses("add task scrape and sand the trim", crew), ["add task scrape and sand the trim"]);
  assert.deepEqual(splitClauses("add 2 gallons primer and Casey left at 3", crew), ["add 2 gallons primer", "Casey left at 3"]);
});

test("the office can fix hours but not punch someone in or out live", () => {
  const live = parseVoiceActions("clock Jordan in", office);
  assert.equal(live[0].kind, "clock");
  assert.match(live[0].blocked || "", /own phone/);
});

test("crew phones: own clock only, no change orders, no fixing other people’s hours", () => {
  const crewCtx: VoiceCtx = { crew, role: "crew", selfId: "jordan" };
  assert.deepEqual(kinds("clock me in", crewCtx), ["clock"]);
  assert.deepEqual(kinds("Casey left at 3", crewCtx), ["clock-at!"]);
  assert.deepEqual(kinds("the client wants the pool gate painted for $420", crewCtx), ["change!"]);
  const officeChange = parseVoiceActions("the client wants the pool gate painted for $420", office)[0];
  assert.equal(officeChange.kind, "change");
  if (officeChange.kind === "change") assert.equal(officeChange.amount, 420);
  assert.deepEqual(kinds("add 2 gallons SW 7006", crewCtx), ["material"]);
});

test("leftover words become one note", () => {
  const chips = parseVoiceActions("the HOA mailbox gets mail at one. keep it clear", office);
  assert.equal(chips.length, 1);
  assert.equal(chips[0].kind, "note");
  assert.equal(parseVoiceActions("   ", office).length, 0);
});

test("older screens keep their own parser behind one confirm chip", async () => {
  const { talkChips } = await import("./voice-actions");
  assert.deepEqual(
    talkChips("snap a photo of the porch and add scrape fascia", "The bid").map((row) => row.kind),
    ["camera", "parse"]
  );
  assert.deepEqual(talkChips("upload from roll", "Photos").map((row) => row.kind), ["roll", "parse"]);
  assert.equal(talkChips("Maya Lopez 501 555 0100", "Lead card")[0].dest, "Lead card");
  assert.equal(talkChips("  ", "Lead card").length, 0);
});
