import assert from "node:assert/strict";
import test from "node:test";
import { can, fieldDock } from "./access";
import { todayString } from "./dates";
import { hashPin, pinFromPhone, verifyPin } from "./pin";
import {
  drainPipeline,
  fieldStateAfterQueue,
  photosOntoJob,
  sessionAfterPin,
  unlockWithPin,
  voiceOntoJob,
} from "./pipeline";
import type { EmployeeDTO, EstimateDTO, JobDTO, SessionDTO } from "./types";

const office: SessionDTO = {
  accountId: "acc_office",
  role: "ADMIN",
  name: "Eric Stlawrence",
  employeeId: null,
};

const maya: SessionDTO = {
  accountId: "acc_maya",
  role: "CREW",
  name: "Maya Chen",
  employeeId: "emp_maya",
};

const job: JobDTO = {
  id: "job_harbor",
  code: "JC-2104",
  name: "Harbor trim repair",
  client: "Harbor Logistics",
  customerId: "cust_harbor",
  address: "1401 Higdon Ferry Rd, Hot Springs, AR 71913",
  notes: "",
  timeline: "",
  dueDate: null,
  pipeline: 2,
  leadCalledAt: null,
  photos: [],
};

function estimate(status: EstimateDTO["status"], lines: EstimateDTO["lines"] = []): EstimateDTO {
  return {
    id: "est_1002",
    number: "EST-1002",
    jobId: job.id,
    customerId: "cust_harbor",
    status,
    notes: "",
    terms: "",
    taxRate: 0,
    publicToken: null,
    sentAt: null,
    viewedAt: null,
    acceptedAt: null,
    changesAt: null,
    signedName: "",
    clientNote: "",
    sentEmail: false,
    sentSms: false,
    lastFollowUpAt: null,
    followUpCount: 0,
    createdAt: "2026-09-17T12:00:00.000Z",
    lines,
    deliveries: [],
  };
}

function employee(hours: number): EmployeeDTO {
  const today = todayString();
  return {
    id: "emp_maya",
    firstName: "Maya",
    lastName: "Chen",
    jobTitle: "Lead Electrician",
    photoUrl: null,
    email: "maya.chen@jobcommand.local",
    phone: "312-555-0148",
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
        scheduledHours: 8,
        actualHours: hours,
        clockIn: `${today}T12:00:00.000Z`,
        clockOut: hours ? `${today}T${String(12 + hours).padStart(2, "0")}:00:00.000Z` : null,
        scheduledStart: null,
        scheduledEnd: null,
        status: hours ? "COMPLETE" : "IN_PROGRESS",
        jobId: job.id,
        serviceCodeId: null,
        notes: null,
        job: null,
        serviceCode: null,
      },
    ],
    payPeriods: [],
    adjustments: [],
    auditLogs: [],
  };
}

test("office PIN is last four of the phone and rejects a crew PIN", () => {
  assert.equal(pinFromPhone("15016175269"), "5269");
  assert.equal(unlockWithPin({ pin: "5269", phone: "15016175269" }), true);
  assert.equal(unlockWithPin({ pin: "0148", phone: "15016175269" }), false);
  const stored = hashPin("0148");
  assert.equal(verifyPin("0148", stored), true);
  assert.equal(verifyPin("5269", stored), false);
});

test("PIN session is office or field and crew never sees payroll", async () => {
  const stored = hashPin("5269");
  const session = await sessionAfterPin({ pin: "5269", storedHash: stored, account: office, now: 1_000_000 });
  assert.deepEqual(session, office);
  assert.equal(can(session, "payroll"), true);
  assert.equal(can(maya, "payroll"), false);
  assert.equal(can(maya, "cost"), false);
  assert.deepEqual([...fieldDock("CREW")], ["command", "crew", "schedule"]);
});

test("driveway voice fills the bid then sits in the offline queue", () => {
  const voice = voiceOntoJob({
    session: maya,
    job,
    estimate: estimate("DRAFT"),
    transcript:
      "Exterior is 1800 square feet, two stories. They want the trim white and leave the brick. Eight hours labor plus 24 linear feet of fascia at $12 a foot.",
    actor: "Maya Chen",
  });
  assert.equal(voice.ok, true);
  if (!voice.ok) return;
  assert.ok(voice.lines.some((line) => line.kind === "LABOR" && line.quantity === 8));
  assert.ok(voice.lines.some((line) => /fascia/i.test(line.description) && line.quantity === 24));
  const queued = drainPipeline(voice.queue);
  assert.equal(queued.filter((item) => item.type === "estimate.save").length, 1);
  const state = fieldStateAfterQueue({
    job,
    estimate: estimate("DRAFT"),
    employees: [employee(0)],
    queue: queued,
  });
  assert.match(state.job.notes, /trim white/i);
  assert.ok((state.estimate?.lines || []).some((line) => /fascia/i.test(line.description)));
});

test("site photos attach to the open job and refill only a live draft", () => {
  const photos = [
    { id: "local:photo:1", url: "blob:site", caption: "On-site photo", createdAt: new Date().toISOString() },
  ];
  const live = photosOntoJob({
    session: maya,
    job: { ...job, notes: "Harbor fascia and trim." },
    estimate: estimate("DRAFT"),
    photos,
    actor: "Maya Chen",
  });
  assert.equal(live.ok, true);
  if (!live.ok) return;
  assert.equal(live.filled, true);
  const queued = drainPipeline(live.queue);
  assert.equal(queued.filter((item) => item.type === "photo.upload").length, 1);
  assert.equal(queued.filter((item) => item.type === "photo.analyze").length, 1);
  const sent = photosOntoJob({
    session: maya,
    job,
    estimate: estimate("SENT"),
    photos,
    actor: "Maya Chen",
  });
  assert.equal(sent.ok && sent.filled, false);
});

test("voice then extra hours trip background job cost without a crew spreadsheet", () => {
  const voice = voiceOntoJob({
    session: office,
    job,
    estimate: estimate("DRAFT"),
    transcript: "Eight hours labor at forty five an hour.",
    actor: "Eric Stlawrence",
  });
  assert.equal(voice.ok, true);
  if (!voice.ok) return;
  const queued = drainPipeline(voice.queue);
  const onBid = fieldStateAfterQueue({
    job,
    estimate: estimate("DRAFT"),
    employees: [employee(8)],
    queue: queued,
  });
  assert.equal(onBid.cost.overLabor, false);
  const over = fieldStateAfterQueue({
    job,
    estimate: estimate("DRAFT"),
    employees: [employee(12)],
    queue: queued,
  });
  assert.equal(over.cost.overLabor, true);
  assert.equal(over.cost.alert, "hours");
  assert.equal(can(maya, "cost"), false);
});

test("repeat estimate saves coalesce so the phone queue stays thin", () => {
  const first = voiceOntoJob({
    session: maya,
    job,
    estimate: estimate("DRAFT"),
    transcript: "Eight hours labor.",
    actor: "Maya Chen",
  });
  const second = voiceOntoJob({
    session: maya,
    job,
    estimate: estimate("DRAFT"),
    transcript: "Eight hours labor plus 24 linear feet of fascia at $12 a foot.",
    actor: "Maya Chen",
  });
  assert.equal(first.ok && second.ok, true);
  if (!first.ok || !second.ok) return;
  const queued = drainPipeline([...first.queue, ...second.queue]);
  assert.equal(queued.filter((item) => item.type === "estimate.save").length, 1);
  assert.equal(queued.filter((item) => item.type === "job.note").length, 1);
  assert.equal(queued.filter((item) => item.type === "voice.ingest").length, 2);
});
