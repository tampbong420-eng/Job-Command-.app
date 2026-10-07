import assert from "node:assert/strict";
import test from "node:test";
import { parseActiveTalk } from "./active-talk";
import {
  appendSitePage,
  buildSiteRoster,
  editSitePage,
  emptySiteFeed,
  liveHoursOnJob,
  mergeSiteFeedIntoPrep,
  parseSiteFeed,
  setSiteNotes,
} from "./site-feed";
import { parsePrep, stringifyPrep } from "./job-prep";

const crew = [
  { id: "emp_maya", firstName: "Maya", lastName: "Chen" },
  { id: "emp_jordan", firstName: "Jordan", lastName: "Hale" },
  { id: "emp_marcus", firstName: "Marcus", lastName: "Cole" },
];

test("voice clocks a named person in or out", () => {
  const inn = parseActiveTalk("Clock Maya in", crew);
  assert.equal(inn.clocks.length, 1);
  assert.equal(inn.clocks[0].employeeId, "emp_maya");
  assert.equal(inn.clocks[0].action, "IN");
  const out = parseActiveTalk("punch Jordan out", crew);
  assert.equal(out.clocks[0].employeeId, "emp_jordan");
  assert.equal(out.clocks[0].action, "OUT");
  const site = parseActiveTalk("Marcus is on site", crew);
  assert.equal(site.clocks[0].action, "IN");
});

test("voice sets running hours, pages the crew, or appends a daily note", () => {
  const hours = parseActiveTalk("Change Maya's hours to 8", crew);
  assert.equal(hours.hours[0].hours, 8);
  assert.equal(hours.clocks.length, 0);
  const page = parseActiveTalk("broadcast lunch at noon", crew);
  assert.match(page.broadcast || "", /lunch at noon/i);
  const note = parseActiveTalk("Wrap the east wall first", crew);
  assert.equal(note.note, "Wrap the east wall first");
  const instruction = parseActiveTalk("instruction: start on the fascia", crew);
  assert.match(instruction.instruction || "", /fascia/i);
  assert.equal(parseActiveTalk("eight hours labor at 45", crew).hours.length, 0);
});

test("site feed JSON nests on prep without wiping yellow crew", () => {
  const feed = appendSitePage(setSiteNotes(emptySiteFeed(), "Mask the brick."), "page", "Lunch at noon");
  const raw = mergeSiteFeedIntoPrep(
    JSON.stringify({ materials: { paint: true }, crew: [{ employeeId: "emp_maya", trade: "Lead" }] }),
    feed
  );
  const prep = parsePrep(raw);
  assert.equal(prep.materials.paint, true);
  assert.equal(prep.crew?.[0].employeeId, "emp_maya");
  assert.equal(prep.siteFeed?.notes, "Mask the brick.");
  assert.equal(prep.siteFeed?.pages[0].kind, "page");
  const round = parsePrep(stringifyPrep(prep));
  assert.equal(round.siteFeed?.pages[0].text, "Lunch at noon");
  const edited = editSitePage(round.siteFeed || emptySiteFeed(), round.siteFeed?.pages[0].id || "", "Wrap at 3");
  assert.equal(edited.pages[0].text, "Wrap at 3");
  assert.equal(parseSiteFeed("").notes, "");
});

test("roster shows live on-site hours ahead of people still punched out", () => {
  const now = new Date("2026-09-18T16:00:00.000Z");
  const today = "2026-09-18";
  const rows = buildSiteRoster(
    [
      {
        id: "emp_maya",
        firstName: "Maya",
        lastName: "Chen",
        timeEntries: [
          {
            jobId: "job_lake",
            date: today,
            scheduledHours: 8,
            actualHours: 1,
            clockIn: "2026-09-18T14:00:00.000Z",
            clockOut: null,
          },
        ],
      },
      {
        id: "emp_jordan",
        firstName: "Jordan",
        lastName: "Hale",
        timeEntries: [
          {
            jobId: "job_lake",
            date: today,
            scheduledHours: 8,
            actualHours: 3.5,
            clockIn: "2026-09-18T12:00:00.000Z",
            clockOut: "2026-09-18T15:30:00.000Z",
          },
        ],
      },
    ],
    "job_lake",
    ["emp_maya", "emp_jordan"],
    today,
    now
  );
  assert.equal(rows[0].employeeId, "emp_maya");
  assert.equal(rows[0].live, true);
  assert.equal(rows[0].hours, 2);
  assert.equal(rows[1].live, false);
  assert.equal(rows[1].clockedOut, true);
  assert.equal(rows[1].hours, 3.5);
  assert.equal(
    liveHoursOnJob(
      { date: today, actualHours: 0, clockIn: "2026-09-18T14:30:00.000Z", clockOut: null },
      now
    ),
    1.5
  );
});
