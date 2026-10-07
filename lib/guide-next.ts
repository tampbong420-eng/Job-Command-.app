import type { JobStageKey } from "@/lib/page-theme";
import type { PipeFacts } from "@/lib/job-pipeline";

/**
 * Guide: one tap to the next thing that needs YOU.
 *
 * Office: each open job has at most one step — the first hole in its paperwork. Jobs waiting on
 * someone else are skipped (estimate out for signature, crew still working, invoice out for
 * payment) and say why. Tapping Guide on a job opens that job's step; when that job has nothing
 * for you, Guide moves to the next customer that does. Nothing anywhere → "All caught up".
 *
 * Crew: only their own clock. On the clock → their job; not yet in → "Clock in on <today's job>";
 * clocked out → caught up. Crew never get office paperwork, and the office never gets "Clock in".
 */

/** Where the step lands on the stage page (lib/guide-land.ts scrolls to it and lights it up). */
export type GuideSpot =
  | "lead-phone"
  | "lead-call"
  | "estimate-visit"
  | "estimate-lines"
  | "estimate-send"
  | "schedule-day"
  | "schedule-crew"
  | "schedule-materials"
  | "invoice-send"
  | "close"
  | "clock-in"
  | "on-clock";

export type GuideStep = {
  id: string;
  jobId: string;
  stage: JobStageKey;
  spot: GuideSpot;
  line: string;
};

export type GuideWaitKind = "signature" | "start" | "work" | "payment";

export type GuideWait = { jobId: string; kind: GuideWaitKind; line: string };

export type GuideJob = {
  id: string;
  client: string;
  pipeline: number;
  facts: PipeFacts;
  /** Someone has clocked in on this job at some point (the work has begun). */
  started?: boolean;
  /** The work is done: Finish job was tapped, or every scheduled day is behind us with nobody on site. */
  workDone?: boolean;
};

export type GuideRole = "office" | "field";

/** The crew member's own clock today. */
export type CrewClock = {
  /** Job they're clocked in on right now. */
  liveJobId: string | null;
  /** Jobs they're booked on today and haven't clocked in on yet, earliest first. */
  dueJobIds: string[];
};

function whoOf(job: Pick<GuideJob, "client">) {
  return job.client.trim() || "this client";
}

/** The office step for one job, or why it's waiting on someone else. */
export function guideForJob(job: GuideJob): { step: GuideStep | null; wait: GuideWait | null } {
  const none = { step: null, wait: null };
  if (job.pipeline >= 6) return none;
  const who = whoOf(job);
  const f = job.facts;
  const step = (kind: string, stage: JobStageKey, spot: GuideSpot, line: string) => ({
    step: { id: `${job.id}:${kind}`, jobId: job.id, stage, spot, line },
    wait: null,
  });
  const wait = (kind: GuideWaitKind, line: string) => ({ step: null, wait: { jobId: job.id, kind, line } });

  // Money end first: these outrank anything left unchecked earlier in the file.
  if (f.paid) return step("close", "archive", "close", `Close out ${who}.`);
  if (f.invoiceSent) return wait("payment", `${who} has the invoice — waiting on payment.`);
  // Work states only count once the job is on the calendar (a clock-in on an unscheduled lead is a site visit).
  if (f.startDate && job.workDone) return step("invoice", "invoice", "invoice-send", `Send the invoice for ${who}.`);
  if (f.startDate && (job.started || f.onSite)) {
    return wait("work", `${who} is in progress — nothing for the office until the work is done.`);
  }

  // Front of the file, in order.
  if (!f.phone) return step("phone", "lead", "lead-phone", `Type the phone for ${who}.`);
  if (!f.leadCalled) return step("call", "lead", "lead-call", `Call ${who}.`);
  if (!f.appointment) return step("visit", "estimate", "estimate-visit", `Schedule the visit for ${who}.`);
  if (!f.estimateReady) return step("bid", "estimate", "estimate-lines", `Write the bid for ${who}.`);
  if (f.estimateChanges) return step("changes", "estimate", "estimate-send", `Update the bid for ${who} and send it again.`);
  if (!f.estimateSent) return step("send", "estimate", "estimate-send", `Send the bid for ${who} to sign.`);
  // Signed first, then the day. (If the office already set a day, they took the yes some other way.)
  if (!f.estimateApproved && !f.startDate) return wait("signature", `${who} has the bid — waiting on their signature.`);
  if (!f.startDate) return step("day", "schedule", "schedule-day", `Set the start day for ${who}.`);
  if (!f.crewAssigned) return step("crew", "schedule", "schedule-crew", `Assign the crew for ${who}.`);
  if (!f.materialsReady) return step("materials", "schedule", "schedule-materials", `Check the materials for ${who}.`);
  return wait("start", `${who} is ready — waiting for the crew to start.`);
}

/** One fillable hole per open job (office). Waiting jobs give nothing. */
export function guideStepsForJob(job: GuideJob): GuideStep[] {
  const { step } = guideForJob(job);
  return step ? [step] : [];
}

/** The crew member's own next move: their clock, nothing else. */
export function crewGuideSteps(jobs: Pick<GuideJob, "id" | "client">[], clock: CrewClock): GuideStep[] {
  const named = (id: string) => jobs.find((job) => job.id === id);
  if (clock.liveJobId) {
    const job = named(clock.liveJobId);
    if (!job) return [];
    return [{ id: `${job.id}:on-clock`, jobId: job.id, stage: "active", spot: "on-clock", line: `You're on the clock at ${whoOf(job)}.` }];
  }
  for (const id of clock.dueJobIds) {
    const job = named(id);
    if (job) return [{ id: `${job.id}:clock`, jobId: job.id, stage: "active", spot: "clock-in", line: `Clock in on ${whoOf(job)}.` }];
  }
  return [];
}

/** Every step, in board order. Field (crew) mode only ever has the crew member's clock. */
export function guideQueue(jobs: GuideJob[], mode: GuideRole = "office", clock?: CrewClock) {
  if (mode === "field") return clock ? crewGuideSteps(jobs, clock) : [];
  return jobs.flatMap((job) => guideStepsForJob(job));
}

/** What the office is waiting on, per job (for the Guide line when it skips a job). */
export function guideWaits(jobs: GuideJob[]): GuideWait[] {
  return jobs.map((job) => guideForJob(job).wait).filter((wait): wait is GuideWait => Boolean(wait));
}

/**
 * Which step a Guide tap goes to.
 * - On a job with a step → that step. Tapping again once you're there → the next customer.
 * - On a job with nothing for you → the next customer after it (board order) that has a step.
 * - Not on a job → the first step (or the one after the last, on a repeat tap).
 * - Nothing anywhere → null ("All caught up").
 */
export function pickGuideStep(
  queue: GuideStep[],
  input: { order: string[]; currentJobId?: string | null; repeatOf?: string | null }
): GuideStep | null {
  if (!queue.length) return null;
  const { order } = input;
  const byJob = (id: string) => queue.find((step) => step.jobId === id) || null;
  const after = (jobId: string) => {
    const at = order.indexOf(jobId);
    if (at < 0) return queue.find((step) => step.jobId !== jobId) || null;
    for (let i = 1; i < order.length; i++) {
      const hit = byJob(order[(at + i) % order.length]);
      if (hit && hit.jobId !== jobId) return hit;
    }
    return null;
  };
  const current = input.currentJobId || null;
  if (current) {
    const own = byJob(current);
    if (own && own.id !== input.repeatOf) return own;
    return after(current) || own;
  }
  if (input.repeatOf) {
    const last = queue.find((step) => step.id === input.repeatOf);
    if (last) return after(last.jobId) || last;
  }
  return queue[0];
}

/** @deprecated kept for older callers: plain round-robin through the queue. */
export function nextGuideStep(queue: GuideStep[], currentId: string | null) {
  if (!queue.length) return null;
  if (!currentId) return queue[0];
  const index = queue.findIndex((item) => item.id === currentId);
  if (index < 0) return queue[0];
  return queue[(index + 1) % queue.length];
}

type ClockEntry = {
  jobId: string | null;
  /** JOB | ESTIMATE. Estimate visits don't start the work. */
  kind?: string | null;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  scheduledHours: number;
  scheduledStart?: string | null;
};

/** Has anyone ever clocked in on this job? Is the work done (finished, or every booked day is past and nobody's on)? */
export function jobWorkState(
  jobId: string,
  people: { timeEntries: ClockEntry[] }[],
  today: string,
  finishedAt?: string | null
): { started: boolean; workDone: boolean } {
  const entries = people.flatMap((person) =>
    person.timeEntries.filter((entry) => entry.jobId === jobId && entry.kind !== "ESTIMATE")
  );
  const started = entries.some((entry) => Boolean(entry.clockIn));
  if (finishedAt) return { started: true, workDone: true };
  const live = entries.some((entry) => entry.date === today && entry.clockIn && !entry.clockOut);
  const booked = entries.filter((entry) => entry.scheduledHours > 0 || entry.clockIn).map((entry) => entry.date);
  const lastDay = booked.sort().at(-1);
  const workDone = started && !live && Boolean(lastDay) && (lastDay as string) < today;
  return { started, workDone };
}

/** A crew member's own clock today, from their time rows. */
export function crewClockToday(entries: ClockEntry[], today: string): CrewClock {
  const todays = entries.filter((entry) => entry.date === today && entry.jobId);
  const live = todays.find((entry) => entry.clockIn && !entry.clockOut);
  const due = todays
    .filter((entry) => !entry.clockIn && !entry.clockOut && (entry.scheduledHours > 0 || entry.scheduledStart))
    .sort((a, b) => (a.scheduledStart || "99").localeCompare(b.scheduledStart || "99"))
    .map((entry) => entry.jobId as string);
  return { liveJobId: live?.jobId || null, dueJobIds: [...new Set(due)] };
}
