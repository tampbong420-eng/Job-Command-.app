import assert from "node:assert/strict";
import test from "node:test";
import {
  checkCrewSlot,
  crewAvailability,
  hoursOnDay,
  personBusyOnDates,
  rangesOverlap,
} from "./schedule";

function person(
  id: string,
  first: string,
  entries: Array<{
    date: string;
    jobId: string | null;
    start: string;
    end: string;
    name: string;
    hours?: number;
  }>
) {
  return {
    id,
    firstName: first,
    lastName: "Chen",
    jobTitle: "Lead",
    timeEntries: entries.map((entry) => ({
      date: entry.date,
      scheduledHours: entry.hours ?? 8,
      scheduledStart: entry.start,
      scheduledEnd: entry.end,
      jobId: entry.jobId,
      job: entry.jobId ? { name: entry.name, client: first, address: "" } : null,
    })),
  };
}

const mayaHarbor = person("emp_maya", "Maya", [
  { date: "2026-09-18", jobId: "job_harbor", start: "07:00", end: "15:00", name: "Harbor Roof Retrofit" },
]);
const jordanFree = person("emp_jordan", "Jordan", []);

test("a split day adds each job's hours", () => {
  assert.equal(
    hoursOnDay(
      [
        { date: "2026-09-29", scheduledStart: "08:00", scheduledEnd: "12:00", scheduledHours: 4 },
        { date: "2026-09-29", scheduledStart: "12:00", scheduledEnd: "16:00", scheduledHours: 4 },
      ],
      "2026-09-29"
    ),
    8
  );
  assert.equal(
    hoursOnDay(
      [{ date: "2026-09-29", scheduledStart: "07:00", scheduledEnd: "15:00", scheduledHours: 8 }],
      "2026-09-29"
    ),
    8
  );
  assert.equal(hoursOnDay([], "2026-09-29"), 0);
});

test("overlapping shifts collide; back-to-back 3pm handoff does not", () => {
  assert.equal(rangesOverlap("07:00", "15:00", "08:00", "16:00"), true);
  assert.equal(rangesOverlap("07:00", "15:00", "15:00", "17:00"), false);
  assert.equal(rangesOverlap("07:00", "15:00", "06:00", "07:00"), false);
});

test("Maya already on Harbor 7–3 is busy for another job that day", () => {
  const crew = [mayaHarbor, jordanFree];
  const clash = checkCrewSlot(crew, {
    employeeId: "emp_maya",
    date: "2026-09-18",
    start: "07:00",
    end: "15:00",
    jobId: "job_northline",
  });
  assert.equal(clash.state, "conflict");
  assert.match(clash.message, /Harbor Roof Retrofit/);
  const board = crewAvailability(crew, {
    date: "2026-09-18",
    start: "07:00",
    end: "15:00",
    jobId: "job_northline",
  });
  const maya = board.find((row) => row.employeeId === "emp_maya");
  const jordan = board.find((row) => row.employeeId === "emp_jordan");
  assert.equal(maya?.state, "busy");
  assert.match(maya?.label || "", /Busy/);
  assert.match(maya?.label || "", /Harbor Roof Retrofit/);
  assert.equal(jordan?.state, "free");
});

test("Maya stays assignable on the Harbor job she is already on", () => {
  const board = crewAvailability([mayaHarbor], {
    date: "2026-09-18",
    start: "07:00",
    end: "15:00",
    jobId: "job_harbor",
  });
  assert.equal(board[0]?.state, "onThisJob");
  assert.equal(
    checkCrewSlot([mayaHarbor], {
      employeeId: "emp_maya",
      date: "2026-09-18",
      start: "07:00",
      end: "15:00",
      jobId: "job_harbor",
    }).state,
    "same"
  );
});

test("a later day in a yellow range still lockouts a busy crew", () => {
  const hit = personBusyOnDates([mayaHarbor], {
    employeeId: "emp_maya",
    dates: ["2026-09-17", "2026-09-18", "2026-09-19"],
    start: "07:00",
    end: "15:00",
    jobId: "job_northline",
  });
  assert.equal(hit?.jobName, "Harbor Roof Retrofit");
  assert.equal(
    personBusyOnDates([mayaHarbor], {
      employeeId: "emp_maya",
      dates: ["2026-09-20"],
      start: "07:00",
      end: "15:00",
      jobId: "job_northline",
    }),
    null
  );
});
