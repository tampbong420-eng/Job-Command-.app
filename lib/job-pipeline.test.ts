import assert from "node:assert/strict";
import test from "node:test";
import { todayString } from "./dates";
import {
  canArchiveJob,
  canOpenPipeStep,
  DISPATCH_OUTLINE,
  dispatchOutline,
  filledThrough,
  highlightedStageId,
  jobsOpenForDispatch,
  invoiceTone,
  lockTalk,
  readPipeFacts,
  stageCoachTalk,
  stageGaps,
  stepTone,
  PIPE_STEPS,
  type PipeFacts,
} from "./job-pipeline";
import type { CustomerDTO, EmployeeDTO, EstimateDTO, InvoiceDTO, JobDTO } from "./types";

const now = new Date("2026-09-17T15:00:00.000Z");
const today = todayString(now);

const job: JobDTO = {
  id: "job_lake",
  code: "JC-2104",
  name: "Lake house exterior",
  client: "Maya Chen",
  customerId: "cust_maya",
  address: "Hot Springs, AR",
  notes: "",
  timeline: "",
  dueDate: null,
  pipeline: 1,
  leadCalledAt: "2026-09-16T12:00:00.000Z",
  photos: [],
};

function facts(partial: Partial<PipeFacts> = {}): PipeFacts {
  return {
    phone: "501-555-0100",
    email: "",
    property: "the lake house",
    leadCalled: true,
    appointment: false,
    estimateReady: false,
    estimateSent: false,
    estimateViewed: false,
    estimateApproved: false,
    estimateChanges: false,
    startDate: false,
    crewAssigned: false,
    materialsReady: false,
    onSite: false,
    onSiteNames: [],
    invoiceSent: false,
    paid: false,
    ...partial,
  };
}

const customer: CustomerDTO = {
  id: "cust_maya",
  name: "Maya Chen",
  phone: "501-555-0100",
  email: "maya@jobcommand.local",
  address: "Hot Springs, AR",
};

function crew(entry: Partial<EmployeeDTO["timeEntries"][number]> = {}): EmployeeDTO {
  return {
    id: "emp_maya",
    firstName: "Maya",
    lastName: "Chen",
    jobTitle: "Painter",
    photoUrl: null,
    email: "maya@jobcommand.local",
    phone: "501-555-0148",
    payType: "HOURLY",
    hourlyRate: 45,
    salaryAnnual: 0,
    baselineStartDate: "2026-01-01",
    payFrequency: "WEEKLY",
    federalWithholdPct: 14,
    stateWithholdPct: 4.95,
    ytdGross: 0,
    ytdFederalTax: 0,
    ytdStateTax: 0,
    ytdNet: 0,
    ytdOvertime: 0,
    timeEntries: [
      {
        id: "te1",
        date: today,
        scheduledHours: 1,
        actualHours: 0,
        clockIn: null,
        clockOut: null,
        scheduledStart: "09:00",
        scheduledEnd: "10:00",
        status: "SCHEDULED",
        jobId: job.id,
        serviceCodeId: null,
        notes: null,
        job: null,
        serviceCode: null,
        ...entry,
      },
    ],
    payPeriods: [],
    adjustments: [],
    auditLogs: [],
  };
}

function estimate(status: EstimateDTO["status"] = "SENT", lines?: EstimateDTO["lines"]): EstimateDTO {
  return {
    id: "est_1",
    number: "EST-1002",
    jobId: job.id,
    customerId: "cust_maya",
    status,
    notes: "",
    terms: "",
    taxRate: 0,
    publicToken: "tok",
    sentAt: status === "DRAFT" ? null : "2026-09-17T12:00:00.000Z",
    viewedAt: null,
    acceptedAt: null,
    changesAt: null,
    signedName: "",
    clientNote: "",
    sentEmail: true,
    sentSms: true,
    lastFollowUpAt: null,
    followUpCount: 0,
    createdAt: "2026-09-17T12:00:00.000Z",
    lines: lines || [{ id: "l1", kind: "LABOR", description: "Exterior", quantity: 8, unit: "hr", rate: 45, amount: 360 }],
    deliveries: [],
  };
}

function invoice(status: InvoiceDTO["status"]): InvoiceDTO {
  return {
    id: "inv_1",
    number: "INV-1002",
    jobId: job.id,
    customerId: "cust_maya",
    customerName: "Maya Chen",
    jobName: job.name,
    status,
    notes: "",
    terms: "",
    taxRate: 0,
    amount: 360,
    sentAt: "2026-09-17T12:00:00.000Z",
    dueDate: today,
    lines: [],
  };
}

test("yellow stays locked until orange visit, priced bid, and send are done", () => {
  const unpriced = readPipeFacts({
    job,
    customer,
    estimate: estimate("SENT", [{ id: "l1", kind: "LABOR", description: "Exterior", quantity: 8, unit: "hr", rate: 0, amount: 0 }]),
    invoices: [],
    employees: [crew()],
    now,
  });
  assert.equal(unpriced.appointment, true);
  assert.equal(unpriced.estimateSent, true);
  assert.equal(unpriced.estimateReady, false);
  assert.equal(filledThrough(1, unpriced), 1);
  assert.equal(canOpenPipeStep(3, 1), false);
});

test("an unnamed materials or labor amount still counts as a priced bid", () => {
  const lump = readPipeFacts({
    job,
    customer,
    estimate: estimate("SENT", [
      { id: "m1", kind: "MATERIAL", description: "", quantity: 1, unit: "lot", rate: 222, amount: 222 },
    ]),
    invoices: [],
    employees: [crew()],
    now,
  });
  assert.equal(lump.estimateReady, true);
  assert.equal(filledThrough(1, lump), 2);
});

test("estimate visit hours fill orange appointment, not yellow crew", () => {
  const visit = readPipeFacts({
    job,
    customer,
    estimate: estimate("SENT"),
    invoices: [],
    employees: [crew()],
    now,
  });
  assert.equal(visit.appointment, true);
  assert.equal(visit.estimateSent, true);
  assert.equal(visit.startDate, false);
  assert.equal(visit.crewAssigned, false);
  assert.equal(filledThrough(1, visit), 2);
});

test("yellow only fills after start, crew, and every material", () => {
  const scheduled = readPipeFacts({
    job: { ...job, dueDate: today, pipeline: 2 },
    customer,
    estimate: estimate("ACCEPTED"),
    invoices: [],
    employees: [crew({ scheduledHours: 8, scheduledStart: "07:00", scheduledEnd: "15:00" })],
    now,
  });
  assert.equal(scheduled.startDate, true);
  assert.equal(scheduled.crewAssigned, true);
  assert.equal(scheduled.materialsReady, false);
  assert.equal(filledThrough(2, scheduled), 2);
  assert.equal(canOpenPipeStep(4, 2), false);

  const loaded = readPipeFacts({
    job: {
      ...job,
      dueDate: today,
      pipeline: 3,
      prepChecklist: JSON.stringify({ materials: { paint: true, wood: true, supplies: true } }),
    },
    customer,
    estimate: estimate("ACCEPTED"),
    invoices: [],
    employees: [crew({ scheduledHours: 8, scheduledStart: "07:00", scheduledEnd: "15:00" })],
    now,
  });
  assert.equal(loaded.materialsReady, true);
  assert.equal(filledThrough(2, loaded), 3);
  assert.equal(canOpenPipeStep(4, 3), true);
});

test("the lit job stage is the open step on the card", () => {
  const red = facts({ leadCalled: false });
  const orange = facts({ leadCalled: true, appointment: true });
  const yellow = facts({ leadCalled: true, appointment: true, estimateReady: true, estimateSent: true });
  assert.equal(highlightedStageId(filledThrough(0, red)), 1);
  assert.equal(highlightedStageId(filledThrough(1, orange)), 2);
  assert.equal(highlightedStageId(filledThrough(2, yellow)), 3);
});

test("dispatch outlines open work and hides invoiced or closed jobs", () => {
  assert.equal(dispatchOutline(1), "orange");
  assert.equal(dispatchOutline(2), "orange");
  assert.equal(dispatchOutline(3), "yellow");
  assert.equal(dispatchOutline(4), "lime");
  assert.equal(dispatchOutline(5), null);
  assert.equal(dispatchOutline(6), null);
  assert.equal(DISPATCH_OUTLINE.orange, "#f97316");
  assert.equal(DISPATCH_OUTLINE.yellow, "#eab308");
  assert.equal(DISPATCH_OUTLINE.lime, "#4ade80");
  const open = jobsOpenForDispatch([
    { id: "lead", pipeline: 1 },
    { id: "bid", pipeline: 2 },
    { id: "crew", pipeline: 3 },
    { id: "touch", pipeline: 4 },
    { id: "billed", pipeline: 5 },
    { id: "closed", pipeline: 6 },
  ]);
  assert.deepEqual(open.map((job) => job.id), ["lead", "bid", "crew", "touch"]);
});

test("paid stays on dark green; gray archive is pipeline 6 only", () => {
  const paid = facts({
    appointment: true,
    estimateReady: true,
    estimateSent: true,
    startDate: true,
    crewAssigned: true,
    materialsReady: true,
    onSite: true,
    invoiceSent: true,
    paid: true,
  });
  assert.equal(filledThrough(4, paid), 5);
  assert.equal(filledThrough(5, paid), 5);
  assert.equal(filledThrough(6, paid), 6);
  assert.equal(canArchiveJob(4, paid), true);
  assert.equal(canArchiveJob(5, paid), true);
  assert.equal(canArchiveJob(4, facts({ onSite: true })), false);
  assert.equal(PIPE_STEPS[0].left, "New Lead");
  assert.equal(PIPE_STEPS[0].right, "Call");
  assert.equal(PIPE_STEPS[0].fill, "#dc2626");
  assert.equal(PIPE_STEPS[1].left, "Schedule");
  assert.equal(PIPE_STEPS[1].right, "Estimate");
  assert.equal(PIPE_STEPS[1].fill, "#f97316");
  assert.equal(PIPE_STEPS[2].left, "Assign crew");
  assert.equal(PIPE_STEPS[2].right, "Materials");
  assert.equal(PIPE_STEPS[2].fill, "#eab308");
  assert.equal(PIPE_STEPS[3].left, "Active");
  assert.equal(PIPE_STEPS[3].right, "On job");
  assert.equal(PIPE_STEPS[3].fill, "#4ade80");
  assert.equal(PIPE_STEPS[4].left, "Invoice");
  assert.equal(PIPE_STEPS[4].right, "Paid");
  assert.equal(PIPE_STEPS[4].fill, "#166534");
  assert.equal(PIPE_STEPS[5].left, "Finished");
  assert.equal(PIPE_STEPS[5].right, "Archive");
  assert.equal(PIPE_STEPS[5].fill, "#27272a");
});

test("invoice status PAID is the payment fact for dark green", () => {
  const open = readPipeFacts({
    job: {
      ...job,
      dueDate: today,
      pipeline: 4,
      prepChecklist: JSON.stringify({ materials: { paint: true, wood: true, supplies: true } }),
    },
    customer,
    estimate: estimate("ACCEPTED"),
    invoices: [invoice("PENDING")],
    employees: [
      crew({
        scheduledHours: 8,
        clockIn: `${today}T12:00:00.000Z`,
        clockOut: null,
        status: "IN_PROGRESS",
      }),
    ],
    now,
  });
  assert.equal(open.paid, false);
  assert.equal(filledThrough(4, open), 4);
  const cleared = readPipeFacts({
    job: {
      ...job,
      dueDate: today,
      pipeline: 5,
      prepChecklist: JSON.stringify({ materials: { paint: true, wood: true, supplies: true } }),
    },
    customer,
    estimate: estimate("ACCEPTED"),
    invoices: [invoice("PAID")],
    employees: [
      crew({
        scheduledHours: 8,
        clockIn: `${today}T12:00:00.000Z`,
        clockOut: null,
        status: "IN_PROGRESS",
      }),
    ],
    now,
  });
  assert.equal(cleared.paid, true);
  assert.equal(filledThrough(5, cleared), 5);
  assert.equal(canArchiveJob(5, cleared), true);
  assert.equal(invoiceTone(open), "sent");
  assert.equal(stepTone(5, open, 4), "partial");
  assert.equal(invoiceTone(cleared), "paid");
  assert.equal(stepTone(5, cleared, 5), "solid");
});

test("future pipeline bars stay locked until the current stage is signed off", () => {
  const leadOnly = facts();
  assert.equal(filledThrough(0, leadOnly), 1);
  assert.equal(canOpenPipeStep(1, 0), true);
  assert.equal(canOpenPipeStep(2, 0), false);
  assert.equal(canOpenPipeStep(2, 1), true);
  assert.equal(canOpenPipeStep(3, 1), false);
  assert.equal(canOpenPipeStep(5, 1), false);
  assert.equal(canOpenPipeStep(6, 4), false);
  assert.equal(canOpenPipeStep(6, 5), true);
  assert.match(lockTalk(3, 1), /Schedule \/ Estimate/);
  const gaps = stageGaps(1, facts({ phone: "", leadCalled: false }));
  assert.ok(gaps.includes("a phone number"));
  assert.ok(gaps.includes("a logged call"));
  const coach = stageCoachTalk(3, "Maya Chen", facts(), 1);
  assert.match(coach, /locked/i);
  const onYellow = stageCoachTalk(3, "Maya Chen", facts({ startDate: false, crewAssigned: false }), 2);
  assert.match(onYellow, /rolling out/);
  assert.match(onYellow, /Alright|Got it/);
  assert.match(onYellow, /heading up the crew/);
  const onEstimate = stageCoachTalk(2, "Northline Distribution", facts({ appointment: true }), 1);
  assert.match(onEstimate, /Alright/);
  assert.match(onEstimate, /camera or the phone roll/i);
  assert.match(onEstimate, /Northline Distribution/);
  assert.match(onEstimate, /materials and the scope/);
  assert.doesNotMatch(onEstimate, /hold the mic/i);
  assert.doesNotMatch(onEstimate, /Dictate/);
  assert.doesNotMatch(onEstimate, /we still need priced estimate lines/i);
  const needVisit = stageCoachTalk(2, "Northline Distribution", facts({ appointment: false }), 1);
  assert.match(needVisit, /Alright — we're on Schedule Estimate for Northline Distribution/);
  assert.match(needVisit, /Confirm the visit/i);
  assert.match(needVisit, /materials and the scope/);
  assert.doesNotMatch(needVisit, /hold the mic/i);
  assert.doesNotMatch(needVisit, /Lock appointment/i);
  assert.doesNotMatch(needVisit, /we still need/i);
  const orangeDone = stageCoachTalk(
    2,
    "Maya Chen",
    facts({ appointment: true, estimateReady: true, estimateSent: true, estimateApproved: true }),
    2
  );
  assert.match(orangeDone, /Orange stage is locked in/);
  assert.match(orangeDone, /materials list|receipt/i);
  assert.doesNotMatch(orangeDone, /Dictate|Parse|task complete/i);
  const needClock = stageCoachTalk(4, "Maya Chen", facts({ onSite: false }), 3);
  assert.match(needClock, /Clock the crew in/);
  assert.match(needClock, /who's on site/);
  const onGreen = stageCoachTalk(4, "Maya Chen", facts({ onSite: true, onSiteNames: ["Maya Chen"] }), 4);
  assert.match(onGreen, /on site for Maya Chen/);
  assert.match(onGreen, /page the crew/);
  assert.match(onGreen, /forgot to punch/);
  const needInvoice = stageCoachTalk(5, "Maya Chen", facts({ invoiceSent: false }), 4);
  assert.match(needInvoice, /card link/);
  assert.match(needInvoice, /labor hours and materials/);
  const awaitingPay = stageCoachTalk(5, "Maya Chen", facts({ invoiceSent: true, paid: false }), 4);
  assert.match(awaitingPay, /see-through|Stripe/i);
  const paidGreen = stageCoachTalk(5, "Maya Chen", facts({ invoiceSent: true, paid: true }), 5);
  assert.match(paidGreen, /paid/);
  assert.match(paidGreen, /solid/);
});
