import { estimateWasSent, parseEstimateStatus } from "@/lib/estimate-status";
import { todayString } from "@/lib/dates";
import { isPricedLine } from "@/lib/documents";
import { costOverTalk } from "@/lib/job-cost-core";
import { materialPrepItems, materialsReady, parsePrep } from "@/lib/job-prep";
import type { CustomerDTO, EmployeeDTO, EstimateDTO, InvoiceDTO, JobDTO } from "@/lib/types";

export type FolderTab = "details" | "estimate" | "work" | "invoice";
export type StepTone = "empty" | "partial" | "solid";

/** Outline used on dispatch cards and job pickers. Closed work is omitted. */
export const DISPATCH_OUTLINE = {
  orange: "#f97316",
  yellow: "#eab308",
  lime: "#4ade80",
} as const;

export type DispatchOutline = keyof typeof DISPATCH_OUTLINE;

/** Lead and estimate are early. Crew and materials are in progress. On-job is the touch-up. */
export function dispatchOutline(pipeline: number): DispatchOutline | null {
  if (pipeline >= 5) return null;
  if (pipeline >= 4) return "lime";
  if (pipeline >= 3) return "yellow";
  return "orange";
}

export function isClosedForDispatch(pipeline: number) {
  return pipeline >= 5;
}

export function jobsOpenForDispatch<T extends { pipeline: number }>(jobs: T[]) {
  return jobs.filter((job) => !isClosedForDispatch(job.pipeline));
}

export const PIPE_STEPS = [
  { id: 1, key: "lead", left: "New Lead", right: "Call", fill: "#dc2626" },
  { id: 2, key: "estimate", left: "Schedule", right: "Estimate", fill: "#f97316" },
  { id: 3, key: "schedule", left: "Assign crew", right: "Materials", fill: "#eab308" },
  { id: 4, key: "active", left: "Active", right: "On job", fill: "#4ade80" },
  { id: 5, key: "pay", left: "Invoice", right: "Paid", fill: "#166534" },
  { id: 6, key: "archive", left: "Finished", right: "Archive", fill: "#27272a" },
] as const;

export type PipeFacts = {
  phone: string;
  email: string;
  property: string;
  leadCalled: boolean;
  appointment: boolean;
  estimateReady: boolean;
  estimateSent: boolean;
  estimateViewed: boolean;
  estimateApproved: boolean;
  estimateChanges: boolean;
  startDate: boolean;
  crewAssigned: boolean;
  materialsReady: boolean;
  onSite: boolean;
  onSiteNames: string[];
  invoiceSent: boolean;
  /** Every billed (non-draft) invoice on this job is PAID. A deposit or one of two invoices is not "paid". */
  paid: boolean;
  /** Money state across ALL of this job's invoices (audit bug 5). Optional so hand-built facts still type. */
  pay?: JobPayStatus;
};

export type JobPayState = "none" | "unsent" | "owed" | "partial" | "paid";

export type JobPayStatus = {
  state: JobPayState;
  /** Sum of non-draft invoice totals. */
  billed: number;
  /** Sum of PAID invoice totals. */
  paidSoFar: number;
  /** Sum of non-draft invoices not yet PAID. */
  owed: number;
};

function cents(value: number) {
  return Math.round((Number(value) || 0) * 100);
}

/**
 * What this job's client still owes, across every invoice on the job. "paid" only when
 * every billed invoice is PAID; some paid + some open is "partial" (e.g. deposit in, balance out).
 */
export function jobPayStatus(
  invoices: Array<Pick<InvoiceDTO, "jobId" | "status" | "amount" | "sentAt">>,
  jobId: string
): JobPayStatus {
  const billed = invoices.filter((invoice) => invoice.jobId === jobId && invoice.status !== "DRAFT");
  const paidRows = billed.filter((invoice) => invoice.status === "PAID");
  const openRows = billed.filter((invoice) => invoice.status !== "PAID");
  const billedC = billed.reduce((sum, invoice) => sum + cents(invoice.amount), 0);
  const paidC = paidRows.reduce((sum, invoice) => sum + cents(invoice.amount), 0);
  const owedC = openRows.reduce((sum, invoice) => sum + cents(invoice.amount), 0);
  let state: JobPayState;
  if (!billed.length) state = "none";
  else if (!openRows.length) state = "paid";
  else if (paidRows.length) state = "partial";
  else if (openRows.some((invoice) => invoice.sentAt)) state = "owed";
  else state = "unsent";
  return { state, billed: billedC / 100, paidSoFar: paidC / 100, owed: owedC / 100 };
}

/** "$280" for whole dollars, "$280.50" otherwise. Short enough for the stage bar. */
export function shortMoney(value: number) {
  const c = Math.max(0, Math.round((Number(value) || 0) * 100));
  const whole = c % 100 === 0;
  return `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 })}`;
}

/**
 * The right-hand word on the Invoice stage bar while it is open. It used to read the stage
 * name "Paid" even when nothing was paid (audit A01 #2). Now it says the real money state.
 */
export function invoiceStageWord(pay: JobPayStatus | undefined, invoiceSent: boolean): string {
  if (!pay || pay.state === "none") return invoiceSent ? "Waiting" : "Not sent";
  if (pay.state === "paid") return "Paid ✓";
  if (pay.state === "partial") return `${shortMoney(pay.owed)} left`;
  if (pay.state === "owed") return `Owes ${shortMoney(pay.owed)}`;
  return "Not sent";
}

export function customerForJob(job: JobDTO, customers: CustomerDTO[], estimate?: EstimateDTO | null) {
  return (
    customers.find((item) => item.id === job.customerId) ||
    customers.find((item) => item.id === estimate?.customerId) ||
    customers.find((item) => item.name.trim().toLowerCase() === job.client.trim().toLowerCase()) ||
    null
  );
}

export function latestJobInvoice(invoices: InvoiceDTO[], jobId: string) {
  return (
    invoices
      .filter((invoice) => invoice.jobId === jobId)
      .sort((a, b) => b.number.localeCompare(a.number))[0] || null
  );
}

/** The invoice the Invoice step should show: the oldest one still owed, else the newest. */
export function jobInvoiceToWorkOn(invoices: InvoiceDTO[], jobId: string) {
  const open = invoices
    .filter((invoice) => invoice.jobId === jobId && invoice.status === "PENDING")
    .sort((a, b) => a.number.localeCompare(b.number))[0];
  return open || latestJobInvoice(invoices, jobId);
}

export function readPipeFacts(input: {
  job: JobDTO;
  customer: CustomerDTO | null;
  estimate: EstimateDTO | null;
  invoices: InvoiceDTO[];
  employees: EmployeeDTO[];
  now: Date;
}): PipeFacts {
  const { job, customer, estimate, invoices, employees, now } = input;
  const today = todayString(now);
  const invoice = jobInvoiceToWorkOn(invoices, job.id);
  const priced = (estimate?.lines || []).filter(isPricedLine);
  const onSitePeople = employees.filter((employee) =>
    employee.timeEntries.some(
      (entry) => entry.jobId === job.id && entry.date === today && entry.clockIn && !entry.clockOut
    )
  );
  const onThisJob = employees.flatMap((employee) =>
    employee.timeEntries
      .filter((entry) => entry.jobId === job.id && entry.scheduledHours > 0)
      .map((entry) => ({ employee, entry }))
  );
  const startLocked = Boolean(job.dueDate);
  const prepItems = materialPrepItems(estimate);
  const prep = parsePrep(job.prepChecklist);
  const pay = jobPayStatus(invoices, job.id);
  return {
    phone: customer?.phone.trim() || "",
    email: customer?.email.trim() || "",
    property: (job.address || customer?.address || "").trim(),
    leadCalled: Boolean(job.leadCalledAt),
    appointment: onThisJob.length > 0,
    estimateReady: Boolean(estimate && priced.length),
    estimateSent: estimateWasSent(parseEstimateStatus(estimate?.status || ""), estimate?.sentAt),
    estimateViewed: Boolean(estimate?.viewedAt) || estimate?.status === "VIEWED" || estimate?.status === "ACCEPTED",
    estimateApproved: estimate?.status === "ACCEPTED",
    estimateChanges: estimate?.status === "CHANGES",
    startDate: startLocked,
    crewAssigned: startLocked && onThisJob.length > 0,
    materialsReady: materialsReady(prepItems, prep),
    onSite: onSitePeople.length > 0,
    onSiteNames: onSitePeople.map((person) => `${person.firstName} ${person.lastName}`),
    invoiceSent: Boolean(invoice?.sentAt),
    paid: pay.state === "paid",
    pay,
  };
}

export function subtasks(id: number, facts: PipeFacts): boolean[] {
  if (id === 1) return [Boolean(facts.phone), facts.leadCalled];
  if (id === 2) return [facts.appointment, facts.estimateReady, facts.estimateSent];
  if (id === 3) return [facts.startDate, facts.crewAssigned, facts.materialsReady];
  if (id === 4) return [facts.onSite];
  if (id === 5) return [facts.invoiceSent, facts.paid];
  return [];
}

export function stageComplete(id: number, facts: PipeFacts) {
  const tasks = subtasks(id, facts);
  return tasks.length > 0 && tasks.every(Boolean);
}

export function pipeIdForStage(key: string) {
  if (key === "invoice") return 5;
  if (key === "field") return 4;
  return PIPE_STEPS.find((step) => step.key === key)?.id || 1;
}

export function stageKeyForPipeId(id: number) {
  if (id === 5) return "invoice" as const;
  const key = PIPE_STEPS.find((step) => step.id === id)?.key;
  return (key || "lead") as "lead" | "estimate" | "schedule" | "active" | "invoice" | "archive";
}

export function stageGaps(id: number, facts: PipeFacts): string[] {
  if (id === 1) {
    return [
      ...(!facts.phone ? ["a phone number"] : []),
      ...(!facts.leadCalled ? ["a logged call"] : []),
    ];
  }
  if (id === 2) {
    return [
      ...(!facts.appointment ? ["a locked site visit"] : []),
      ...(!facts.estimateReady ? ["priced estimate lines"] : []),
      ...(!facts.estimateSent ? ["the estimate sent to the client"] : []),
    ];
  }
  if (id === 3) {
    return [
      ...(!facts.startDate ? ["a project start date"] : []),
      ...(!facts.crewAssigned ? ["crew assigned"] : []),
      ...(!facts.materialsReady ? ["every material purchased and staged"] : []),
    ];
  }
  if (id === 4) return facts.onSite ? [] : ["a clock-in on this job"];
  if (id === 5) {
    return [
      ...(!facts.invoiceSent ? ["the invoice sent"] : []),
      ...(!facts.paid ? ["payment marked Paid"] : []),
    ];
  }
  if (id === 6) return facts.paid ? [] : ["payment cleared on Invoice / Paid"];
  return [];
}

/** The stage button lit on the job card. One step past the last finished stage. */
export function highlightedStageId(filled: number) {
  return Math.min(6, Math.max(1, filled + 1));
}

/** Sequential fill from signed-off facts only. Pipeline 6 is the gray-black close-out. */
export function filledThrough(pipeline: number, facts: PipeFacts) {
  if (pipeline >= 6) return 6;
  let filled = 0;
  if (stageComplete(1, facts)) filled = 1;
  if (filled >= 1 && stageComplete(2, facts)) filled = 2;
  if (filled >= 2 && stageComplete(3, facts)) filled = 3;
  if (filled >= 3 && stageComplete(4, facts)) filled = 4;
  if (filled >= 4 && stageComplete(5, facts)) filled = 5;
  return filled;
}

/** Current color plus completed colors. Future colors stay locked. */
export function canOpenPipeStep(id: number, filled: number) {
  if (id < 1 || id > 6) return false;
  if (id === 6) return filled >= 5;
  return id <= filled + 1;
}

export function lockTalk(id: number, filled: number) {
  const current = PIPE_STEPS[Math.min(5, Math.max(0, filled)) ];
  const target = PIPE_STEPS[id - 1];
  const nowLabel = current ? `${current.left}${current.right ? ` / ${current.right}` : ""}` : "New Lead / Call";
  const nextLabel = target ? `${target.left}${target.right ? ` / ${target.right}` : ""}` : "that stage";
  return `Finish ${nowLabel} first. ${nextLabel} stays locked until you do.`;
}

export function stageCoachTalk(id: number, who: string, facts: PipeFacts, filled: number) {
  if (id > filled + 1 && !(id === 6 && filled >= 5)) {
    return lockTalk(id, filled);
  }
  if (id === 1) {
    if (!facts.phone) {
      return `Type the name, phone, and house for ${who}. Then tap Call.`;
    }
    if (!facts.leadCalled) {
      return `Got it — I've got a number for ${who}. Tap Call so we know you reached them. That opens the visit.`;
    }
      return `Got it. The call is done for ${who} — now pick a visit and talk the bid.`;
  }
  if (id === 2) {
    if (!facts.appointment) {
      return `Alright — we're on Schedule Estimate for ${who}. Confirm the visit on this page, then use the camera or the phone roll. Write the materials and the scope. Every line stays editable.`;
    }
    if (!facts.estimateReady) {
      return `Alright — we're on Schedule Estimate for ${who}. Use the camera or the phone roll, then write the materials and the scope. Every line stays editable.`;
    }
    if (facts.estimateChanges) {
      return `Got it — ${who} asked for changes. Snap a new photo if you need one, tweak any line you want, and send the bid again.`;
    }
    if (!facts.estimateSent) {
      return `Got it. The bid for ${who} is ready. Send it so they can look it over — that unlocks Yellow.`;
    }
    if (!facts.estimateApproved) {
      return facts.estimateViewed
        ? `Alright — ${who} opened the estimate. We're waiting on a signature — I'll flip it to Approved the moment they sign.`
        : `Alright — the estimate is out to ${who}. I'll nudge them if they haven't opened it by tomorrow.`;
    }
    return `Got it. Orange stage is locked in for ${who} — now let's grab the materials list or snap a photo of the receipt before we move to Yellow.`;
  }
  if (id === 3) {
    if (!facts.startDate) {
      return `Alright — Orange estimate is locked. Who's heading up the crew on this one, and what day are we rolling out?`;
    }
    if (!facts.crewAssigned) {
      return `Got it. Start is on the board for ${who}. Who's heading up the crew, and how many days are we on site?`;
    }
    if (!facts.materialsReady) {
      return `Got it. Crew is set for ${who} — hold the round mic with dispatch notes or what's bought, then Active unlocks.`;
    }
    return `Got it. Yellow is locked in for ${who} — clock in on Active / On job when you're actually there.`;
  }
  if (id === 4) {
    if (!facts.onSite) {
      return `Alright — we're on Active for ${who}. Clock the crew in so I can track who's on site and the hours they're logging. Invoice / Paid opens once someone is actually there.`;
    }
    return `Got it. ${facts.onSiteNames.join(" and ") || "The crew"} ${facts.onSiteNames.length > 1 ? "are" : "is"} on site for ${who}. Hold the round mic to page the crew, add a note, or fix hours if someone forgot to punch. Invoice / Paid is next when the work's done.`;
  }
  if (id === 5) {
    if (!facts.invoiceSent) {
      return `Alright — we're on Invoice / Paid for ${who}. I'll pull labor hours and materials onto the invoice — tweak any line, then send the card link. Complete stays locked until it clears.`;
    }
    if (!facts.paid) {
      return `Got it. The invoice is out to ${who}. Dark green stays see-through until the card payment lands — I'll flip it solid when Stripe says paid.`;
    }
    return `Got it. ${who} is paid. Dark green is locked solid. Finished Archive is open — close the file when you're ready.`;
  }
  if (id === 6) {
    if (!facts.paid) {
      return `Hold up — archive stays locked for ${who} until payment clears on Invoice / Paid.`;
    }
    return `Got it. ${who} is paid. Tap Close out job and I'll file it gray-black.`;
  }
  return `Alright — I'm right here for ${who}. Hold the round mic and tell me what you just finished.`;
}

/** Gray/black Complete only after Invoice / Paid has cleared. */
export function canArchiveJob(pipeline: number, facts: PipeFacts) {
  return facts.paid || pipeline >= 5;
}

export function invoiceTone(facts: Pick<PipeFacts, "invoiceSent" | "paid">): "empty" | "sent" | "paid" {
  if (facts.paid) return "paid";
  if (facts.invoiceSent) return "sent";
  return "empty";
}

export function stepTone(id: number, facts: PipeFacts, filled: number): StepTone {
  if (id === 5) {
    const tone = invoiceTone(facts);
    if (tone === "paid" || filled >= 5) return "solid";
    if (tone === "sent") return "partial";
    return filled >= 5 ? "solid" : "empty";
  }
  if (filled >= id) return "solid";
  if (id === 6) return "empty";
  const done = subtasks(id, facts).filter(Boolean).length;
  const need = subtasks(id, facts).length;
  if (done === 0) return "empty";
  if (done < need) return "partial";
  return filled >= id - 1 ? "solid" : "partial";
}

export function nextFolderTab(filled: number): FolderTab {
  if (filled < 1) return "details";
  if (filled < 2) return "estimate";
  if (filled < 4) return "work";
  return "invoice";
}

export function copilotTalk(job: JobDTO, facts: PipeFacts, filled: number) {
  const who = job.client || "this client";
  const move = copilotNextMove(who, facts, filled, facts.property || "the job site");
  const over = costOverTalk(who, job.cost);
  return over ? `${over} ${move}` : move;
}

function copilotNextMove(who: string, facts: PipeFacts, filled: number, site: string) {
  if (filled >= 6) {
    return `Got it. ${who} is closed out. Pull the card back only if something bounced.`;
  }
  if (filled < 1) {
    if (!facts.phone) {
      return `Alright — ${who} landed with no number. Open New lead, hold the round mic, and tell me their name and phone so we can call.`;
    }
    if (!facts.leadCalled) {
      return `Got it — you've got a number for ${who}. Open New lead and tap Call so we know you reached them.`;
    }
  }
  if (filled < 2) {
    if (!facts.appointment) {
      return `Alright — you talked to ${who}. Open Schedule Estimate — I'll pack a visit from the shop, then we write the bid.`;
    }
    if (!facts.phone && !facts.email) {
      return `Alright — visit is set at ${site}. Drop a phone or email on the card so we can send the PDF.`;
    }
    if (!facts.estimateReady) {
      return `Alright — we're on Schedule Estimate for ${who}. Use the camera or the phone roll, then write the materials and the scope. Every line stays editable.`;
    }
    if (facts.estimateChanges) {
      return `Got it — ${who} wants changes. Open Schedule Estimate, tweak the lines, and send the bid again.`;
    }
    if (facts.estimateSent && !facts.estimateApproved) {
      return facts.estimateViewed
        ? `Alright — ${who} opened the estimate. Waiting on a signature — I'll flip it to Approved the moment they sign.`
        : `Alright — the estimate is out to ${who}. I'll nudge them if they haven't opened it by tomorrow.`;
    }
    return `Alright — the estimate for ${who} is sitting unsent. Text or email it — they get a phone link to review and sign.`;
  }
  if (filled < 3) {
    if (!facts.startDate) {
      return `Alright — Orange estimate is locked for ${who}. Who's heading up the crew on this one, and what day are we rolling out?`;
    }
    if (!facts.crewAssigned) {
      return `Got it. Start is on the board for ${who}. Who's heading up the crew, and how many days are we on site?`;
    }
    return `Got it. Crew is set for ${who}. Check off materials on Assign crew / Materials before Active unlocks.`;
  }
  if (filled < 4) {
    if (facts.onSite) {
      return `Got it. ${facts.onSiteNames.join(" and ")} are on the job at ${site}. Tap Add photo if you still need a shot of the property.`;
    }
    return `Got it. Yellow is locked in for ${who}. Clock in on Active / On job when you're actually there.`;
  }
  if (filled < 5) {
    if (!facts.invoiceSent) {
      return `Alright — work is live at ${site}. Open Invoice / Paid, send the card link, then we're waiting on payment.`;
    }
    return `Got it. Invoice is out to ${who}. Dark green goes solid when the card payment clears.`;
  }
  return `Got it. ${who} is paid. Open Complete and close the file. It'll collapse gray.`;
}
