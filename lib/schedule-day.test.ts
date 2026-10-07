import assert from "node:assert/strict";
import test from "node:test";
import {
  bookableKind,
  clockLabel,
  clockShort,
  crewSpot,
  streetLine,
  dateLine,
  dayMarks,
  entryKind,
  filterCounts,
  filterStops,
  kindForNewBooking,
  kindFromStage,
  monthDays,
  parseEntryKind,
  parseScheduleView,
  stepDay,
  stopsForDay,
  totalHours,
  weekDays,
  weekLabel,
  type StopEntry,
} from "./schedule-day";

const stages = new Map([
  ["job-estimate", 2],
  ["job-crew", 3],
  ["job-active", 4],
  ["job-lead", 1],
]);
const stageOf = (id: string) => stages.get(id);

function row(over: Partial<StopEntry>): StopEntry {
  return {
    id: "e1",
    date: "2026-10-02",
    jobId: "job-crew",
    kind: "",
    notes: null,
    scheduledStart: "07:00",
    scheduledEnd: "15:00",
    scheduledHours: 8,
    ...over,
  };
}

test("day-tagging: stage 2 reads as an estimate, every other stage as a job", () => {
  assert.equal(kindFromStage(2), "ESTIMATE");
  for (const stage of [1, 3, 4, 5, 6, undefined]) assert.equal(kindFromStage(stage), "JOB");
  assert.equal(entryKind(row({ jobId: "job-estimate" }), stageOf), "ESTIMATE");
  assert.equal(entryKind(row({ jobId: "job-active" }), stageOf), "JOB");
  assert.equal(entryKind(row({ jobId: "job-lead" }), stageOf), "JOB");
});

test("day-tagging: a saved kind wins over the job's current stage", () => {
  assert.equal(entryKind(row({ jobId: "job-crew", kind: "ESTIMATE" }), stageOf), "ESTIMATE");
  assert.equal(entryKind(row({ jobId: "job-estimate", kind: "JOB" }), stageOf), "JOB");
  assert.equal(entryKind(row({ jobId: "job-estimate", kind: "estimate" }), stageOf), "ESTIMATE");
  assert.equal(parseEntryKind("bogus"), "");
  assert.equal(parseEntryKind(null), "");
});

test("day marks: lime job bar, orange estimate bar, both on one day, gray only for a job-less shift", () => {
  const kindOf = (entry: StopEntry) => entryKind(entry, stageOf);
  const entries = [
    row({ id: "a", jobId: "job-crew" }),
    row({ id: "b", jobId: "job-estimate", scheduledStart: "15:30", scheduledEnd: "16:30" }),
    row({ id: "c", date: "2026-10-03", jobId: null }),
    row({ id: "d", date: "2026-10-04", jobId: "job-crew", notes: "absence:sick" }),
  ];
  assert.deepEqual(dayMarks(entries, "2026-10-02", kindOf), { job: true, estimate: true, shift: false });
  assert.deepEqual(dayMarks(entries, "2026-10-03", kindOf), { job: false, estimate: false, shift: true });
  assert.deepEqual(dayMarks(entries, "2026-10-04", kindOf), { job: false, estimate: false, shift: false });
});

test("day step rolls over month and year ends", () => {
  assert.deepEqual(stepDay("2026-10-31", 1), { day: "2026-11-01", month: "2026-11" });
  assert.deepEqual(stepDay("2026-11-01", -1), { day: "2026-10-31", month: "2026-10" });
  assert.deepEqual(stepDay("2026-12-31", 1), { day: "2027-01-01", month: "2027-01" });
  assert.deepEqual(stepDay("2028-02-28", 1), { day: "2028-02-29", month: "2028-02" });
  assert.deepEqual(stepDay("2026-10-02", 7), { day: "2026-10-09", month: "2026-10" });
});

test("week range is Sunday to Saturday and labels across months", () => {
  assert.deepEqual(weekDays("2026-10-02"), [
    "2026-09-27",
    "2026-09-28",
    "2026-09-29",
    "2026-09-30",
    "2026-10-01",
    "2026-10-02",
    "2026-10-03",
  ]);
  assert.deepEqual(weekDays("2026-09-27"), weekDays("2026-10-03"));
  assert.equal(weekDays("2026-10-04")[0], "2026-10-04");
  assert.equal(weekLabel("2026-10-02"), "SEP 27 – OCT 3");
  assert.equal(weekLabel("2026-10-07"), "OCT 4 – 10");
  assert.equal(weekLabel("2026-12-30"), "DEC 27 – JAN 2");
});

test("date line and month grid", () => {
  assert.equal(dateLine("2026-10-02"), "FRI · OCT 2, 2026");
  const october = monthDays("2026-10");
  assert.equal(october.length, 35);
  assert.equal(october[0], "2026-09-27");
  assert.equal(october[34], "2026-10-31");
  assert.equal(monthDays("2026-08").length, 42);
});

test("filter counts and filtered stops for the picked day", () => {
  const kindOf = (entry: StopEntry) => entryKind(entry, stageOf);
  const entries = [
    row({ id: "a", jobId: "job-crew", scheduledStart: "07:00", scheduledEnd: "11:00" }),
    row({ id: "b", jobId: "job-estimate", scheduledStart: "11:30", scheduledEnd: "12:30" }),
    row({ id: "c", jobId: "job-active", scheduledStart: "13:00", scheduledEnd: "15:00" }),
    row({ id: "d", jobId: "job-crew", kind: "ESTIMATE", scheduledStart: "15:30", scheduledEnd: "16:30" }),
    row({ id: "e", date: "2026-10-03", jobId: "job-crew" }),
    row({ id: "f", jobId: null }),
  ];
  const stops = stopsForDay(entries, "2026-10-02");
  assert.deepEqual(stops.map((stop) => stop.id), ["a", "b", "c", "d"]);
  assert.deepEqual(filterCounts(stops, kindOf), { ALL: 4, JOB: 2, ESTIMATE: 2 });
  assert.deepEqual(filterStops(stops, "ESTIMATE", kindOf).map((stop) => stop.id), ["b", "d"]);
  assert.deepEqual(filterStops(stops, "JOB", kindOf).map((stop) => stop.id), ["a", "c"]);
  assert.equal(filterStops(stops, "ALL", kindOf).length, 4);
  assert.equal(totalHours(stops), 8);
  assert.deepEqual(filterCounts([], kindOf), { ALL: 0, JOB: 0, ESTIMATE: 0 });
});

test("stops sort by start time and skip absence rows", () => {
  const stops = stopsForDay(
    [
      row({ id: "z", scheduledStart: "13:00" }),
      row({ id: "y", scheduledStart: null, scheduledEnd: null, scheduledHours: 0 }),
      row({ id: "x", scheduledStart: "07:00" }),
      row({ id: "w", notes: "absence:off" }),
    ],
    "2026-10-02"
  );
  assert.deepEqual(stops.map((stop) => stop.id), ["x", "z", "y"]);
});

test("view choice and crew spot label", () => {
  assert.equal(parseScheduleView("month"), "month");
  assert.equal(parseScheduleView("anything"), "week");
  assert.equal(parseScheduleView(null), "week");
  assert.equal(crewSpot("Painter", 0, 5), "Painter · 1 of 5");
  assert.equal(crewSpot("Painter", 0, 1), "Painter");
  assert.equal(crewSpot("", 2, 5), "3 of 5");
});

test("server fallback tags a walk before the estimate goes out, a job day after", () => {
  assert.equal(kindForNewBooking({ dueDate: null, estimateSent: false }), "ESTIMATE");
  assert.equal(kindForNewBooking({ dueDate: null, estimateSent: true }), "JOB");
  assert.equal(kindForNewBooking({ dueDate: "2026-10-02", estimateSent: false }), "JOB");
});

test("stop labels: short clock, clock with AM/PM, street line", () => {
  assert.equal(clockShort("07:00"), "7:00");
  assert.equal(clockShort("13:30"), "1:30");
  assert.equal(clockLabel("11:00"), "11:00 AM");
  assert.equal(clockLabel("12:30"), "12:30 PM");
  assert.equal(clockLabel("00:15"), "12:15 AM");
  assert.equal(clockLabel(null), "—");
  assert.equal(streetLine("210 Harbor Point Dr, Hot Springs, AR 71913"), "210 Harbor Point Dr");
  assert.equal(streetLine(""), "");
});

test("booking lists: estimates from stage 2, jobs from stages 3 and 4 only", () => {
  assert.equal(bookableKind(2), "ESTIMATE");
  assert.equal(bookableKind(3), "JOB");
  assert.equal(bookableKind(4), "JOB");
  for (const stage of [1, 5, 6, undefined, null]) assert.equal(bookableKind(stage), null);
});
