import assert from "node:assert/strict";
import test from "node:test";
import {
  crewClockToday,
  crewGuideSteps,
  guideForJob,
  guideQueue,
  guideWaits,
  jobWorkState,
  nextGuideStep,
  pickGuideStep,
  type GuideJob,
} from "./guide-next";
import type { PipeFacts } from "./job-pipeline";

/** A job with every box ticked (paid). Each test knocks out what it needs. */
function facts(partial: Partial<PipeFacts> = {}): PipeFacts {
  return {
    phone: "501-555-0100",
    email: "",
    property: "the house",
    leadCalled: true,
    appointment: true,
    estimateReady: true,
    estimateSent: true,
    estimateViewed: true,
    estimateApproved: true,
    estimateChanges: false,
    startDate: true,
    crewAssigned: true,
    materialsReady: true,
    onSite: false,
    onSiteNames: [],
    invoiceSent: true,
    paid: true,
    ...partial,
  };
}

type JobInput = Omit<Partial<GuideJob>, "facts"> & { facts?: Partial<PipeFacts> };

function job(partial: JobInput = {}): GuideJob {
  const { facts: factPartial, ...rest } = partial;
  return { id: "job_a", client: "Harbor Logistics", pipeline: 3, ...rest, facts: facts(factPartial) };
}

/** Facts for a job that's booked and ready but not started and not billed. */
const ready = { invoiceSent: false, paid: false } as const;
/** Facts for a fresh lead with nothing done. */
const fresh = {
  phone: "",
  leadCalled: false,
  appointment: false,
  estimateReady: false,
  estimateSent: false,
  estimateViewed: false,
  estimateApproved: false,
  startDate: false,
  crewAssigned: false,
  materialsReady: false,
  invoiceSent: false,
  paid: false,
} as const;

const first = (input: JobInput) => guideQueue([job(input)])[0];

test("front of the file: phone, call, visit, bid, send — each lands on its exact spot", () => {
  assert.deepEqual(
    [first({ facts: fresh }).line, first({ facts: fresh }).stage, first({ facts: fresh }).spot],
    ["Type the phone for Harbor Logistics.", "lead", "lead-phone"]
  );
  const called = { ...fresh, phone: "501" };
  assert.equal(first({ facts: called }).spot, "lead-call");
  assert.equal(first({ facts: { ...called, leadCalled: true } }).spot, "estimate-visit");
  assert.equal(first({ facts: { ...called, leadCalled: true, appointment: true } }).line, "Write the bid for Harbor Logistics.");
  assert.equal(first({ facts: { ...called, leadCalled: true, appointment: true } }).spot, "estimate-lines");
  const priced = { ...called, leadCalled: true, appointment: true, estimateReady: true };
  assert.equal(first({ facts: priced }).line, "Send the bid for Harbor Logistics to sign.");
  assert.equal(first({ facts: priced }).spot, "estimate-send");
  assert.equal(
    first({ facts: { ...priced, estimateSent: true, estimateChanges: true } }).line,
    "Update the bid for Harbor Logistics and send it again."
  );
});

test("bid out for signature is skipped (waiting on the customer) — no jumping to 'Set the day'", () => {
  const sent = { ...ready, startDate: false, crewAssigned: false, materialsReady: false, estimateApproved: false };
  const out = guideForJob(job({ facts: sent }));
  assert.equal(out.step, null);
  assert.equal(out.wait?.kind, "signature");
  assert.match(out.wait?.line || "", /waiting on their signature/);
  // Signed → now the day.
  assert.equal(first({ facts: { ...sent, estimateApproved: true } }).line, "Set the start day for Harbor Logistics.");
  assert.equal(first({ facts: { ...sent, estimateApproved: true } }).spot, "schedule-day");
  // The office already set a day without an e-signature (took the yes on paper): keep going.
  assert.equal(first({ facts: { ...sent, startDate: true } }).spot, "schedule-crew");
});

test("schedule: crew, then materials, then wait for the crew to start", () => {
  assert.equal(first({ facts: { ...ready, crewAssigned: false } }).line, "Assign the crew for Harbor Logistics.");
  assert.equal(first({ facts: { ...ready, materialsReady: false } }).line, "Check the materials for Harbor Logistics.");
  assert.equal(first({ facts: { ...ready, materialsReady: false } }).spot, "schedule-materials");
  assert.equal(guideForJob(job({ facts: ready })).wait?.kind, "start");
});

test("in progress is skipped for the office — never 'Clock in', before or after the crew clocks out", () => {
  // Crew on site now.
  assert.equal(guideQueue([job({ started: true, facts: { ...ready, onSite: true } })]).length, 0);
  // Crew clocked out, more days booked: still waiting on the work, not "Clock in".
  const after = guideForJob(job({ started: true, workDone: false, facts: ready }));
  assert.equal(after.step, null);
  assert.equal(after.wait?.kind, "work");
  const lines = guideQueue([job({ started: true, facts: ready }), job({ id: "b", facts: { ...ready, onSite: true } })]).map((s) => s.line);
  assert.ok(!lines.some((line) => /clock in/i.test(line)));
});

test("work done → send the invoice; invoice out → waiting on payment; paid → close; closed → nothing", () => {
  const done = first({ started: true, workDone: true, facts: ready });
  assert.equal(done.line, "Send the invoice for Harbor Logistics.");
  assert.deepEqual([done.stage, done.spot], ["invoice", "invoice-send"]);
  const owed = guideForJob(job({ started: true, workDone: true, facts: { invoiceSent: true, paid: false } }));
  assert.equal(owed.step, null);
  assert.equal(owed.wait?.kind, "payment");
  // An unchecked box earlier in the file doesn't matter once the bill is out.
  assert.equal(guideForJob(job({ facts: { invoiceSent: true, paid: false, materialsReady: false } })).wait?.kind, "payment");
  assert.equal(first({ facts: {} }).line, "Close out Harbor Logistics.");
  assert.equal(first({ facts: {} }).spot, "close");
  assert.equal(guideQueue([job({ pipeline: 6 })]).length, 0);
});

test("a clock-in on an unscheduled lead (site visit) doesn't hide the lead's next step", () => {
  assert.equal(first({ started: true, workDone: true, facts: { ...fresh, phone: "501" } }).line, "Call Harbor Logistics.");
});

test("Guide on a job opens THAT job's step; tapping again moves to the next customer", () => {
  const jobs = [
    job({ id: "harbor", client: "Harbor Point", started: true, facts: ready }), // in progress → waiting
    job({ id: "northline", client: "Northline", started: true, workDone: true, facts: ready }), // invoice to send
    job({ id: "mercer", client: "Mercer", facts: { ...fresh, phone: "501", leadCalled: true } }), // visit
    job({ id: "river", client: "Riverside", facts: { ...fresh, phone: "501" } }), // call
  ];
  const order = jobs.map((j) => j.id);
  const queue = guideQueue(jobs);
  const onNorthline = pickGuideStep(queue, { order, currentJobId: "northline" });
  assert.equal(onNorthline?.line, "Send the invoice for Northline.");
  assert.equal(onNorthline?.spot, "invoice-send");
  // Already there (same step open) → next customer that needs action.
  assert.equal(pickGuideStep(queue, { order, currentJobId: "northline", repeatOf: onNorthline?.id })?.jobId, "mercer");
  // On a job that's waiting (Harbor in progress) → flips to the next customer with a step.
  assert.equal(pickGuideStep(queue, { order, currentJobId: "harbor" })?.jobId, "northline");
  // Wraps around the board.
  assert.equal(pickGuideStep(queue, { order, currentJobId: "river", repeatOf: "river:call" })?.jobId, "northline");
  // Not on any job → the first thing due.
  assert.equal(pickGuideStep(queue, { order })?.jobId, "northline");
  assert.equal(pickGuideStep(queue, { order, repeatOf: "northline:invoice" })?.jobId, "mercer");
});

test("only one job due and you're already on it → it stays there", () => {
  const queue = guideQueue([job({ id: "a", facts: { ...fresh } }), job({ id: "b", started: true, facts: ready })]);
  assert.equal(pickGuideStep(queue, { order: ["a", "b"], currentJobId: "a", repeatOf: "a:phone" })?.jobId, "a");
});

test("nothing due anywhere → null (All caught up), and every skip says why", () => {
  const jobs = [
    job({ id: "a", facts: { ...ready, estimateApproved: false, startDate: false } }),
    job({ id: "b", started: true, facts: ready }),
    job({ id: "c", facts: { invoiceSent: true, paid: false } }),
    job({ id: "d", pipeline: 6 }),
  ];
  const queue = guideQueue(jobs);
  assert.equal(queue.length, 0);
  assert.equal(pickGuideStep(queue, { order: jobs.map((j) => j.id), currentJobId: "a" }), null);
  assert.deepEqual(guideWaits(jobs).map((w) => w.kind), ["signature", "work", "payment"]);
});

test("crew: on the clock → their own job, never 'Clock in' somewhere else (Casey at Northline)", () => {
  const jobs = [job({ id: "harbor", client: "Harbor Point HOA" }), job({ id: "northline", client: "Northline Dental" })];
  const onClock = guideQueue(jobs, "field", { liveJobId: "northline", dueJobIds: ["harbor"] });
  assert.equal(onClock.length, 1);
  assert.equal(onClock[0].line, "You're on the clock at Northline Dental.");
  assert.deepEqual([onClock[0].jobId, onClock[0].stage, onClock[0].spot], ["northline", "active", "on-clock"]);
});

test("crew: not in yet → clock in on today's job; clocked out → caught up; no office paperwork ever", () => {
  const jobs = [job({ id: "harbor", client: "Harbor Point HOA", facts: fresh }), job({ id: "northline", client: "Northline Dental" })];
  const due = crewGuideSteps(jobs, { liveJobId: null, dueJobIds: ["northline"] });
  assert.equal(due[0].line, "Clock in on Northline Dental.");
  assert.equal(due[0].spot, "clock-in");
  assert.deepEqual(guideQueue(jobs, "field", { liveJobId: null, dueJobIds: [] }), []);
  assert.deepEqual(guideQueue(jobs, "field"), []);
});

test("crewClockToday reads the crew member's own rows", () => {
  const today = "2026-10-02";
  const row = (jobId: string, extra: Partial<Parameters<typeof crewClockToday>[0][number]> = {}) => ({
    jobId,
    date: today,
    clockIn: null,
    clockOut: null,
    scheduledHours: 8,
    scheduledStart: "07:00",
    ...extra,
  });
  assert.deepEqual(crewClockToday([row("northline", { clockIn: "2026-10-02T12:02:00Z" }), row("harbor")], today), {
    liveJobId: "northline",
    dueJobIds: ["harbor"],
  });
  // Clocked out of Northline, Harbor at 1 PM still due.
  assert.deepEqual(
    crewClockToday(
      [row("northline", { clockIn: "a", clockOut: "b" }), row("harbor", { scheduledStart: "13:00" }), row("x", { date: "2026-10-03" })],
      today
    ),
    { liveJobId: null, dueJobIds: ["harbor"] }
  );
  assert.deepEqual(crewClockToday([row("northline", { clockIn: "a", clockOut: "b" })], today), { liveJobId: null, dueJobIds: [] });
});

test("jobWorkState: estimate visits don't start the work; done = Finish tapped, or every booked day past with nobody on", () => {
  const today = "2026-10-02";
  const e = (date: string, extra: Record<string, unknown> = {}) => ({ jobId: "j", date, clockIn: null, clockOut: null, scheduledHours: 8, ...extra });
  const people = (rows: ReturnType<typeof e>[]) => [{ timeEntries: rows as Parameters<typeof jobWorkState>[1][number]["timeEntries"] }];
  assert.deepEqual(jobWorkState("j", people([e("2026-09-30", { kind: "ESTIMATE", clockIn: "a", clockOut: "b" })]), today), {
    started: false,
    workDone: false,
  });
  assert.deepEqual(jobWorkState("j", people([e("2026-09-30", { clockIn: "a", clockOut: "b" }), e("2026-10-05")]), today), {
    started: true,
    workDone: false,
  });
  assert.deepEqual(jobWorkState("j", people([e("2026-09-30", { clockIn: "a", clockOut: "b" }), e("2026-10-01", { clockIn: "a", clockOut: "b" })]), today), {
    started: true,
    workDone: true,
  });
  assert.equal(jobWorkState("j", people([e(today, { clockIn: "a" })]), today).workDone, false);
  assert.equal(jobWorkState("j", people([e("2026-10-09")]), today, "2026-10-02T15:00:00Z").workDone, true);
});

test("old round-robin helper still behaves", () => {
  const queue = guideQueue([job({ id: "a", facts: fresh }), job({ id: "b", facts: fresh })]);
  assert.equal(nextGuideStep(queue, null)?.jobId, "a");
  assert.equal(nextGuideStep(queue, "a:phone")?.jobId, "b");
  assert.equal(nextGuideStep(queue, "b:phone")?.jobId, "a");
  assert.equal(nextGuideStep([], null), null);
});
