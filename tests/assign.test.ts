import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lockJobToCrew,
  activeJobs,
  tumblerIndexForCrew,
  toggleCrewClock,
  toggleCrewGps,
} from "../lib/assign";
import type { CrewMember, Job } from "../lib/types";

const crew: CrewMember[] = [
  {
    id: "e-mike",
    name: "Mike Reyes",
    role: "HVAC Lead",
    phone: "",
    photoUrl: "",
    status: "active",
    currentJob: "Unit 4B",
    currentJobId: "c-northline",
    startedAt: "2026-09-10T14:45:00.000Z",
    weeklyHoursTarget: 40,
    weeklyHoursLogged: 4.5,
    lat: 47.62,
    lng: -122.36,
    gpsLive: true,
  },
  {
    id: "e-dana",
    name: "Dana Cole",
    role: "Electrician",
    phone: "",
    photoUrl: "",
    status: "active",
    currentJob: "Cedar fence",
    currentJobId: "c-hale",
    startedAt: "2026-09-10T14:45:00.000Z",
    weeklyHoursTarget: 36,
    weeklyHoursLogged: 8,
    lat: 47.62,
    lng: -122.3,
    gpsLive: true,
  },
];

const jobs: Job[] = [
  {
    id: "c-northline",
    customerName: "Northline",
    phone: "",
    address: "1847 W Mercer St",
    jobTitle: "Unit 4B — HVAC replacement",
    status: "in_progress",
    scheduledTime: "08:30 AM",
    worker: "Mike Reyes",
    workerId: "e-mike",
    priority: "high",
    lat: 47.62,
    lng: -122.36,
  },
  {
    id: "c-hale",
    customerName: "Jordan Hale",
    phone: "",
    address: "732 18th Ave E",
    jobTitle: "Cedar fence + gate",
    status: "in_progress",
    scheduledTime: "07:45 AM",
    worker: "Dana Cole",
    workerId: "e-dana",
    priority: "medium",
    lat: 47.62,
    lng: -122.3,
  },
  {
    id: "c-shah",
    customerName: "Priya Shah",
    phone: "",
    address: "1610 15th Ave",
    jobTitle: "Interior paint",
    status: "lead",
    scheduledTime: "10:00 AM",
    worker: "Unassigned",
    workerId: null,
    priority: "low",
    lat: 47.61,
    lng: -122.31,
  },
  {
    id: "c-done",
    customerName: "Done Co",
    phone: "",
    address: "400 Broad St",
    jobTitle: "Rooftop punch",
    status: "completed",
    scheduledTime: "Yesterday",
    worker: "Mike Reyes",
    workerId: "e-mike",
    priority: "high",
    lat: 47.61,
    lng: -122.34,
  },
];

test("lockJobToCrew assigns an active job to the selected crew member", () => {
  const result = lockJobToCrew(jobs, crew, "c-shah", "e-mike");
  assert.equal(result.locked, true);
  const locked = result.jobs.find((job) => job.id === "c-shah");
  const mike = result.crew.find((row) => row.id === "e-mike");
  assert.equal(locked?.worker, "Mike Reyes");
  assert.equal(locked?.workerId, "e-mike");
  assert.equal(locked?.status, "in_progress");
  assert.equal(mike?.currentJobId, "c-shah");
  assert.equal(mike?.currentJob, "Interior paint");
});

test("lockJobToCrew clears the job from the previous current worker", () => {
  const result = lockJobToCrew(jobs, crew, "c-hale", "e-mike");
  const dana = result.crew.find((row) => row.id === "e-dana");
  const hale = result.jobs.find((job) => job.id === "c-hale");
  assert.equal(hale?.workerId, "e-mike");
  assert.equal(dana?.currentJobId, null);
  assert.equal(dana?.currentJob, "Unassigned");
});

test("lockJobToCrew refuses completed jobs", () => {
  const result = lockJobToCrew(jobs, crew, "c-done", "e-mike");
  assert.equal(result.locked, false);
  assert.equal(result.jobs, jobs);
});

test("activeJobs drops completed work from the tumbler", () => {
  assert.deepEqual(
    activeJobs(jobs).map((job) => job.id),
    ["c-northline", "c-hale", "c-shah"],
  );
});

test("lockJobToCrew releases the crew member from other active jobs", () => {
  const withTwo: Job[] = [
    ...jobs,
    {
      ...jobs[0],
      id: "c-extra",
      jobTitle: "Second stop",
      worker: "Mike Reyes",
      workerId: "e-mike",
    },
  ];
  const result = lockJobToCrew(withTwo, crew, "c-shah", "e-mike");
  assert.equal(
    result.jobs.find((job) => job.id === "c-northline")?.workerId,
    null,
  );
  assert.equal(result.jobs.find((job) => job.id === "c-extra")?.workerId, null);
  assert.equal(result.jobs.find((job) => job.id === "c-shah")?.workerId, "e-mike");
});

test("tumblerIndexForCrew snaps to the crew member's locked job", () => {
  assert.equal(tumblerIndexForCrew(jobs, "e-mike", "c-northline"), 0);
  assert.equal(tumblerIndexForCrew(jobs, "e-dana", "c-hale"), 1);
  assert.equal(tumblerIndexForCrew(jobs, "e-sam", null), 0);
});

test("toggleCrewClock flips duty without dropping the roster", () => {
  const off = toggleCrewClock(crew, "e-mike");
  assert.equal(off.find((row) => row.id === "e-mike")?.status, "off");
  assert.equal(off.find((row) => row.id === "e-mike")?.gpsLive, false);
  const on = toggleCrewClock(off, "e-mike", "2026-09-10T18:00:00.000Z");
  assert.equal(on.find((row) => row.id === "e-mike")?.status, "active");
  assert.equal(on.find((row) => row.id === "e-mike")?.gpsLive, true);
});

test("toggleCrewClock clocks a break shift off", () => {
  const onBreak = crew.map((row) =>
    row.id === "e-mike" ? { ...row, status: "break" as const } : row,
  );
  const off = toggleCrewClock(onBreak, "e-mike");
  assert.equal(off.find((row) => row.id === "e-mike")?.status, "off");
});

test("toggleCrewGps mutes location tracking for the selected crew", () => {
  const muted = toggleCrewGps(crew, "e-mike");
  assert.equal(muted.find((row) => row.id === "e-mike")?.gpsLive, false);
  const live = toggleCrewGps(muted, "e-mike");
  assert.equal(live.find((row) => row.id === "e-mike")?.gpsLive, true);
});
