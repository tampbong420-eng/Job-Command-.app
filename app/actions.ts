"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { inShopOfToken } from "@/lib/shop-of";
import { fromDayString, periodFromClock, shopToday, toDayString } from "@/lib/dates";
import { formatRangeLabel, hoursBetween, rangesOverlap } from "@/lib/schedule";
import {
  computePay,
  currentPeriodFor,
  deriveStatus,
  liveActualHours,
  type PayComputeResult,
} from "@/lib/payroll";
import type { PayFrequency, PayType, PeriodStatus } from "@/lib/types";
import { loadPayrollSettings } from "@/lib/queries";
import { ensureEstimateToken, newPublicToken } from "@/lib/estimate-link";
import { logEstimateViewed } from "@/lib/delivery-store";
import { deliverEstimate } from "@/lib/send-estimate";
import { deliverInvoice, markInvoicePaid, openClientCardCheckout, type ClientCardStart } from "@/lib/send-invoice";
import { refreshJobCost } from "@/lib/job-cost";
import { raiseAlert, raiseEstimateAlert, raiseScheduleAlert } from "@/lib/alerts";
import { writeSessionCookie } from "@/lib/session";
import { getLiveSession } from "@/lib/live-session";
import { can, ownsEmployee, type Permission } from "@/lib/access";
import { ensureAccounts, toSession } from "@/lib/accounts";
import { UNSET_PIN_HASH, hashPin, normalizePin, pinIsSet, pinProblem } from "@/lib/pin";
import { readBank, sealBank } from "@/lib/bank-fields";
import { appOrigin } from "@/lib/origin";
import { headers } from "next/headers";
import { parseShellTheme } from "@/lib/shell-theme";
import { formatShellInk, parseShellInk } from "@/lib/shell-ink";
import { parsePayPrefs, payPrefsSummary } from "@/lib/pay-prefs";
import { parseEmployeeOnboard, withholdFromElection } from "@/lib/employee-onboard";
import { parseEmploymentStatus } from "@/lib/employment";
import { accountLast4, validAbaRouting, validDepositAccount } from "@/lib/direct-deposit";
import { nextJobCode } from "@/lib/shop-brand";
import { findOrCreateCustomer, associateJobClient } from "@/lib/client-store";
import { mergePrepForSave } from "@/lib/active-board";
import { Prisma } from "@prisma/client";
import type { Employee, PayAdjustment, TimeEntry } from "@prisma/client";
import { kindForNewBooking, parseEntryKind, type EntryKind } from "@/lib/schedule-day";
import { estimateWasSent, parseEstimateStatus } from "@/lib/estimate-status";
import {
  DEFAULT_ESTIMATE_TERMS,
  invoiceTermsFor,
  documentTotals,
  type DocLineDraft,
} from "@/lib/documents";
import {
  billingOnSetup,
  mapConnectAccount,
  parseBillingInterval,
  TRIAL_LOCK_MESSAGE,
  type BillingKind,
  type SignupLanding,
} from "@/lib/billing";
import { LEGAL_VERSION } from "@/lib/legal";
import { cardCheckOnFile } from "@/lib/card-check";
import { ensureBilling, loadBillingRow } from "@/lib/billing-store";
import {
  createBillingPortal,
  createConnectAccount,
  createConnectOnboardingLink,
  createSubscriptionCheckout,
  provisionSignupTrial,
  retrieveConnectAccount,
} from "@/lib/billing-stripe";
import { hit } from "@/lib/rate-limit";
import { stripeConfigured } from "@/lib/stripe-rest";

/** Audit name when a call carries no person. Never a real or demo owner's name. */
const ACTOR_FALLBACK = "Office";

async function rejectHotAction() {
  const result = hit("/", "POST", headers(), true);
  if (!result.ok) throw new Error("Too many requests. Wait a moment.");
}

async function requirePerm(permission: Permission) {
  await rejectHotAction();
  const session = await getLiveSession();
  if (!can(session, permission)) return null;
  return session;
}

async function allowSetupOrAdmin() {
  await rejectHotAction();
  const session = await getLiveSession();
  if (can(session, "admin")) return session;
  const admin = await prisma.account.findFirst({ where: { role: "ADMIN" } });
  if (!admin) {
    return { accountId: "setup", role: "ADMIN" as const, name: "Setup", employeeId: null };
  }
  const settings = await loadPayrollSettings();
  if (!settings.setupComplete) {
    return { accountId: "setup", role: "ADMIN" as const, name: "Setup", employeeId: null };
  }
  return null;
}

async function writeAudit(input: {
  employeeId?: string | null;
  actor?: string | null;
  action: string;
  field?: string;
  oldValue?: string | null;
  newValue?: string | null;
}) {
  await prisma.auditLog.create({
    data: {
      employeeId: input.employeeId ?? null,
      actor: input.actor?.trim() || ACTOR_FALLBACK,
      action: input.action,
      field: input.field,
      oldValue: input.oldValue ?? null,
      newValue: input.newValue ?? null,
    },
  });
}

function isLocked(status: string) {
  return status === "APPROVED" || status === "PAID" || status === "LOCKED";
}

async function requireBasePlan() {
  const settings = await loadPayrollSettings();
  if (!settings.billing.baseUnlocked) {
    throw new Error(TRIAL_LOCK_MESSAGE);
  }
}

/** Auto-advance only: never skips a step, never un-archives. Manual taps use setJobPipeline. */
async function advanceJobPipeline(jobId: string | null | undefined, to: number) {
  if (!jobId || to < 1 || to > 5) return;
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job || job.pipeline >= 6) return;
  if (job.pipeline >= to) return;
  if (to > 1 && job.pipeline < to - 1) return;
  await prisma.job.update({
    where: { id: jobId },
    data: {
      pipeline: to,
      leadCalledAt: job.leadCalledAt ?? new Date(),
    },
  });
}

async function resolveClock(employee: Employee, day = new Date()) {
  const settings = await loadPayrollSettings();
  if (settings.setupComplete) {
    return periodFromClock(
      settings.payFrequency,
      settings.periodAnchor,
      day
    );
  }
  return currentPeriodFor(
    employee.payFrequency as PayFrequency,
    toDayString(employee.baselineStartDate),
    day
  );
}

async function periodForEmployee(employee: Employee, day = new Date()) {
  return resolveClock(employee, day);
}

async function findPeriodRecord(employeeId: string, start: string, end: string) {
  return prisma.payPeriod.findFirst({
    where: {
      employeeId,
      startDate: fromDayString(start),
      endDate: fromDayString(end),
    },
  });
}

async function dayEntries(employeeId: string, date: Date) {
  return prisma.timeEntry.findMany({
    where: { employeeId, date },
    include: { job: true, employee: true },
    orderBy: [{ scheduledStart: "asc" }, { createdAt: "asc" }],
  });
}

async function findDayEntry(
  employeeId: string,
  date: Date,
  opts?: { entryId?: string | null; jobId?: string | null }
) {
  if (opts?.entryId && !opts.entryId.startsWith("draft-")) {
    const byId = await prisma.timeEntry.findFirst({
      where: { id: opts.entryId, employeeId },
      include: { job: true, employee: true },
    });
    if (byId) return byId;
  }
  if (opts?.jobId) {
    const byJob = await prisma.timeEntry.findFirst({
      where: { employeeId, date, jobId: opts.jobId },
      include: { job: true, employee: true },
    });
    if (byJob) return byJob;
    return null;
  }
  const rows = await dayEntries(employeeId, date);
  return rows[0] || null;
}

async function assertEditable(employeeId: string, dateIso: string) {
  const employee = await prisma.employee.findUniqueOrThrow({
    where: { id: employeeId },
  });
  const period = await periodForEmployee(employee, fromDayString(dateIso));
  const record = await findPeriodRecord(employeeId, period.start, period.end);
  if (record && isLocked(record.status)) {
    throw new Error(
      "This pay period is approved or paid. Unlock it before editing hours or rates."
    );
  }
  return { employee, period, record };
}

function snapshotFromEntries(
  employee: Employee,
  periodStart: string,
  periodEnd: string,
  entries: TimeEntry[],
  adjustments: PayAdjustment[],
  clock: { frequency: PayFrequency; baselineStartDate: string }
): PayComputeResult {
  return computePay({
    payType: employee.payType as PayType,
    hourlyRate: employee.hourlyRate,
    salaryAnnual: employee.salaryAnnual,
    frequency: clock.frequency,
    federalWithholdPct: employee.federalWithholdPct,
    stateWithholdPct: employee.stateWithholdPct,
    baselineStartDate: clock.baselineStartDate,
    periodStart,
    periodEnd,
    days: entries.map((entry) => ({
      date: toDayString(entry.date),
      scheduledHours: entry.scheduledHours,
      actualHours: entry.actualHours,
      clockIn: entry.clockIn?.toISOString() ?? null,
      clockOut: entry.clockOut?.toISOString() ?? null,
    })),
    adjustments: adjustments.map((item) => ({
      type: item.type as "DEDUCTION" | "REIMBURSEMENT",
      amount: item.amount,
    })),
  });
}

async function upsertPeriodSnapshot(
  employeeId: string,
  start: string,
  end: string,
  status?: PeriodStatus
) {
  const employee = await prisma.employee.findUniqueOrThrow({
    where: { id: employeeId },
  });
  const entries = await prisma.timeEntry.findMany({
    where: {
      employeeId,
      date: {
        gte: fromDayString(start),
        lte: fromDayString(end),
      },
    },
  });
  const existing = await findPeriodRecord(employeeId, start, end);
  const adjustments = await prisma.payAdjustment.findMany({
    where: existing
      ? { payPeriodId: existing.id }
      : { employeeId, payPeriodId: null },
  });
  const settings = await loadPayrollSettings();
  const clock = settings.setupComplete
    ? {
        frequency: settings.payFrequency as PayFrequency,
        baselineStartDate: settings.periodAnchor,
      }
    : {
        frequency: employee.payFrequency as PayFrequency,
        baselineStartDate: toDayString(employee.baselineStartDate),
      };
  const computed = snapshotFromEntries(
    employee,
    start,
    end,
    entries,
    adjustments,
    clock
  );

  return prisma.payPeriod.upsert({
    where: existing
      ? { id: existing.id }
      : { employeeId_startDate_endDate: {
          employeeId,
          startDate: fromDayString(start),
          endDate: fromDayString(end),
        } },
    update: {
      frequency: clock.frequency,
      regularHours: computed.regularHours,
      overtimeHours: computed.overtimeHours,
      regularPay: computed.regularPay,
      overtimePay: computed.overtimePay,
      grossPay: computed.grossPay,
      deductions: computed.deductions,
      reimbursements: computed.reimbursements,
      federalTax: computed.federalTax,
      stateTax: computed.stateTax,
      netPay: computed.netPay,
      ...(status ? { status } : {}),
    },
    create: {
      employeeId,
      startDate: fromDayString(start),
      endDate: fromDayString(end),
      frequency: clock.frequency,
      regularHours: computed.regularHours,
      overtimeHours: computed.overtimeHours,
      regularPay: computed.regularPay,
      overtimePay: computed.overtimePay,
      grossPay: computed.grossPay,
      deductions: computed.deductions,
      reimbursements: computed.reimbursements,
      federalTax: computed.federalTax,
      stateTax: computed.stateTax,
      netPay: computed.netPay,
      status: status ?? "OPEN",
    },
  });
}

export async function updateIdentity(input: {
  employeeId: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  actor: string;
}) {
  if (!(await requirePerm("admin"))) return;
  const current = await prisma.employee.findUniqueOrThrow({
    where: { id: input.employeeId },
  });
  await prisma.employee.update({
    where: { id: input.employeeId },
    data: {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      jobTitle: input.jobTitle.trim(),
    },
  });
  await writeAudit({
    employeeId: input.employeeId,
    actor: input.actor,
    action: "Updated identity",
    field: "name/title",
    oldValue: `${current.firstName} ${current.lastName} · ${current.jobTitle}`,
    newValue: `${input.firstName.trim()} ${input.lastName.trim()} · ${input.jobTitle.trim()}`,
  });
  revalidatePath("/");
}

export async function updatePhoto(employeeId: string, photoUrl: string, actor: string) {
  const session = await getLiveSession();
  if (!ownsEmployee(session, employeeId) && !can(session, "admin")) return;
  const current = await prisma.employee.findUniqueOrThrow({
    where: { id: employeeId },
  });
  await prisma.employee.update({
    where: { id: employeeId },
    data: { photoUrl },
  });
  await writeAudit({
    employeeId,
    actor,
    action: "Updated photo",
    field: "photoUrl",
    oldValue: current.photoUrl,
    newValue: photoUrl,
  });
  revalidatePath("/");
}

export async function updatePayConfig(input: {
  employeeId: string;
  payType: PayType;
  hourlyRate: number;
  salaryAnnual: number;
  baselineStartDate: string;
  payFrequency: PayFrequency;
  federalWithholdPct: number;
  stateWithholdPct: number;
  actor: string;
}) {
  if (!(await requirePerm("payroll"))) return;
  const current = await prisma.employee.findUniqueOrThrow({
    where: { id: input.employeeId },
  });
  const period = await periodForEmployee(current);
  const record = await findPeriodRecord(input.employeeId, period.start, period.end);
  if (record && isLocked(record.status)) {
    throw new Error("Pay configuration is locked until this period is unlocked.");
  }

  await prisma.employee.update({
    where: { id: input.employeeId },
    data: {
      payType: input.payType,
      hourlyRate: input.hourlyRate,
      salaryAnnual: input.salaryAnnual,
      baselineStartDate: fromDayString(input.baselineStartDate),
      payFrequency: input.payFrequency,
      federalWithholdPct: input.federalWithholdPct,
      stateWithholdPct: input.stateWithholdPct,
    },
  });

  await writeAudit({
    employeeId: input.employeeId,
    actor: input.actor,
    action: "Updated pay configuration",
    field: "payRate",
    oldValue: JSON.stringify({
      payType: current.payType,
      hourlyRate: current.hourlyRate,
      salaryAnnual: current.salaryAnnual,
      frequency: current.payFrequency,
    }),
    newValue: JSON.stringify({
      payType: input.payType,
      hourlyRate: input.hourlyRate,
      salaryAnnual: input.salaryAnnual,
      frequency: input.payFrequency,
    }),
  });
  revalidatePath("/");
}

export async function saveEmployeeDeposit(input: {
  employeeId: string;
  actor: string;
  routing: string;
  account: string;
  accountType: "CHECKING" | "SAVINGS";
}) {
  if (!(await requirePerm("payroll"))) return;
  const typedRouting = input.routing.replace(/\D/g, "");
  const before = typedRouting ? null : await prisma.employee.findUnique({ where: { id: input.employeeId } });
  // Blank routing = keep the saved one (the screen only shows its last 4).
  const routing = typedRouting || (before ? readBank(before).routing : "");
  if (!validAbaRouting(routing)) throw new Error("Routing number has to be a real 9-digit bank number.");
  const current = await prisma.employee.findUniqueOrThrow({ where: { id: input.employeeId } });
  // Go-public B5: decrypted only here on the server; stored AES-256-GCM encrypted (lib/bank-fields.ts).
  const saved = readBank(current);
  const typed = input.account.replace(/\D/g, "");
  const account = typed || saved.account;
  if (!validDepositAccount(account)) throw new Error("Account number needs 4 to 17 digits.");
  const accountType = input.accountType === "SAVINGS" ? "SAVINGS" : "CHECKING";
  await prisma.employee.update({
    where: { id: input.employeeId },
    data: {
      ...sealBank(current.id, { routing, account }),
      depositAccountType: accountType,
    },
  });
  await writeAudit({
    employeeId: input.employeeId,
    actor: input.actor,
    action: "Saved direct deposit",
    field: "directDeposit",
    oldValue: saved.account ? `····${accountLast4(saved.account)}` : "",
    newValue: `${accountType} ····${accountLast4(account)}`,
  });
  revalidatePath("/");
}

/**
 * TimeEntry.kind (JOB | ESTIMATE) only exists once `prisma db push` + `prisma generate` ran and the
 * server restarted. Until then the running client has no such column, so writes skip it and the
 * Schedule reads the tag from the job's stage (same rule the backfill writes).
 */
const ENTRY_KIND_READY = "kind" in (Prisma.TimeEntryScalarFieldEnum as Record<string, string>);

async function resolveEntryKind(
  input: { kind?: EntryKind; jobId: string | null },
  existing: { jobId: string | null; kind?: unknown } | null
): Promise<EntryKind | ""> {
  const asked = parseEntryKind(input.kind);
  if (asked) return asked;
  const kept = existing ? parseEntryKind(existing.kind) : "";
  if (kept && existing?.jobId === input.jobId) return kept;
  if (!input.jobId) return kept;
  const job = await prisma.job.findUnique({ where: { id: input.jobId }, include: { estimate: true } });
  if (!job) return kept;
  return kindForNewBooking({
    dueDate: job.dueDate,
    estimateSent: job.estimate
      ? estimateWasSent(parseEstimateStatus(job.estimate.status), job.estimate.sentAt?.toISOString() ?? null)
      : false,
  });
}

export async function upsertDayHours(input: {
  employeeId: string;
  date: string;
  scheduledHours: number;
  actualHours: number;
  jobId: string | null;
  serviceCodeId: string | null;
  notes?: string | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  actor: string;
  entryId?: string;
  clockIn?: string | null;
  /** Missed punch-out fix (“Casey left at 3”). Missing = keep the row's clock-out. */
  clockOut?: string | null;
  /** JOB | ESTIMATE from the Schedule add flow. Missing = keep the row's tag or derive it from the job. */
  kind?: EntryKind;
}) {
  if (!(await requirePerm("dispatch"))) return;
  await assertEditable(input.employeeId, input.date);
  const date = fromDayString(input.date);
  let scheduledHours = Number(input.scheduledHours) || 0;
  if (input.scheduledStart && input.scheduledEnd) {
    scheduledHours = hoursBetween(input.scheduledStart, input.scheduledEnd);
  }

  if ((Number(input.scheduledHours) || 0) <= 0 && input.jobId && !input.scheduledStart && !input.scheduledEnd) {
    const row = await findDayEntry(input.employeeId, date, {
      entryId: input.entryId,
      jobId: input.jobId,
    });
    if (row) {
      const siblings = await dayEntries(input.employeeId, date);
      const olderShift = siblings.some(
        (other) =>
          other.id !== row.id &&
          other.id < row.id &&
          (other.scheduledHours > 0 || Boolean(other.scheduledStart))
      );
      if (olderShift || (!row.scheduledHours && !row.scheduledStart)) {
        await prisma.timeEntry.delete({ where: { id: row.id } });
      } else {
        await prisma.timeEntry.update({ where: { id: row.id }, data: { jobId: null } });
      }
      revalidatePath("/");
      return;
    }
  }

  if (scheduledHours <= 0 && !input.jobId) {
    const rows = await dayEntries(input.employeeId, date);
    if (rows.length) {
      await prisma.timeEntry.updateMany({
        where: { employeeId: input.employeeId, date },
        data: {
          scheduledHours: 0,
          scheduledStart: null,
          scheduledEnd: null,
          jobId: null,
          status: "SCHEDULED",
          ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
        },
      });
      await writeAudit({
        employeeId: input.employeeId,
        actor: input.actor,
        action: "Edited timesheet hours",
        field: input.date,
        oldValue: `sched ${rows[0].scheduledHours}`,
        newValue: "sched 0 / off",
      });
      await raiseScheduleAlert({
        employeeId: input.employeeId,
        date: input.date,
        jobId: null,
        scheduledHours: 0,
        start: null,
        end: null,
        previous: {
          jobId: rows[0].jobId,
          scheduledHours: rows[0].scheduledHours,
          start: rows[0].scheduledStart,
          end: rows[0].scheduledEnd,
        },
      });
      revalidatePath("/");
      return;
    }
  }

  const existing = await findDayEntry(input.employeeId, date, {
    entryId: input.entryId,
    jobId: input.jobId,
  });
  const actualHours =
    input.actualHours !== undefined
      ? Number(input.actualHours) || 0
      : existing?.actualHours ?? 0;
  const nextStart =
    input.scheduledStart !== undefined
      ? input.scheduledStart
      : (existing?.scheduledStart ?? null);
  const nextEnd =
    input.scheduledEnd !== undefined
      ? input.scheduledEnd
      : (existing?.scheduledEnd ?? null);
  if (nextStart && nextEnd) {
    scheduledHours = hoursBetween(nextStart, nextEnd);
  }
  if (scheduledHours > 0 && input.jobId && nextStart && nextEnd) {
    const rows = await dayEntries(input.employeeId, date);
    const clash = rows.find((row) => {
      if (existing && row.id === existing.id) return false;
      if (!row.jobId || row.jobId === input.jobId || row.scheduledHours <= 0) return false;
      return rangesOverlap(
        nextStart,
        nextEnd,
        row.scheduledStart || "07:00",
        row.scheduledEnd || "15:00"
      );
    });
    if (clash) {
      const who = clash.employee.firstName;
      const other = clash.job?.name || clash.job?.client || "another job";
      throw new Error(
        `${who} is already on ${other} ${formatRangeLabel(clash.scheduledStart, clash.scheduledEnd)}. Pick another crew.`
      );
    }
  }
  const nextClockIn =
    input.clockIn !== undefined
      ? input.clockIn
        ? new Date(input.clockIn)
        : null
      : existing?.clockIn ?? null;
  const nextClockOut =
    input.clockOut !== undefined
      ? input.clockOut
        ? new Date(input.clockOut)
        : null
      : existing?.clockOut ?? null;
  const status = deriveStatus({
    date: input.date,
    scheduledHours,
    actualHours,
    clockIn: nextClockIn?.toISOString() ?? null,
    clockOut: nextClockOut?.toISOString() ?? null,
  });

  const payload = {
    scheduledHours,
    actualHours,
    scheduledStart: nextStart,
    scheduledEnd: nextEnd,
    jobId: input.jobId,
    serviceCodeId: input.serviceCodeId,
    notes: input.notes ?? existing?.notes ?? null,
    status,
    clockIn: nextClockIn,
    ...(input.clockOut !== undefined ? { clockOut: nextClockOut } : {}),
  };
  if (ENTRY_KIND_READY) {
    const kind = await resolveEntryKind(input, existing);
    if (kind) Object.assign(payload, { kind });
  }

  if (existing) {
    await prisma.timeEntry.update({ where: { id: existing.id }, data: payload });
  } else {
    await prisma.timeEntry.create({
      data: {
        employeeId: input.employeeId,
        date,
        ...payload,
      },
    });
  }

  await writeAudit({
    employeeId: input.employeeId,
    actor: input.actor,
    action: "Edited timesheet hours",
    field: input.date,
    oldValue: existing
      ? `sched ${existing.scheduledHours} / actual ${existing.actualHours}`
      : null,
    newValue: `sched ${scheduledHours} / actual ${actualHours}`,
  });

  if (input.jobId && scheduledHours > 0) {
    const job = await prisma.job.findUnique({ where: { id: input.jobId } });
    // Estimate visits book hours without a project due date. Yellow only fills after Schedule lock.
    if (job && job.pipeline < 6 && job.dueDate && nextStart) {
      await advanceJobPipeline(input.jobId, 3);
    }
  }

  await refreshJobCost(input.jobId);
  await associateJobClient(input.jobId);
  await raiseScheduleAlert({
    employeeId: input.employeeId,
    date: input.date,
    jobId: input.jobId,
    scheduledHours,
    start: nextStart,
    end: nextEnd,
    previous: existing
      ? {
          jobId: existing.jobId,
          scheduledHours: existing.scheduledHours,
          start: existing.scheduledStart,
          end: existing.scheduledEnd,
        }
      : null,
  });
  revalidatePath("/");
}

export async function clockToday(input: {
  employeeId: string;
  action: "IN" | "OUT";
  actor: string;
  jobId?: string | null;
  unpaidHours?: number;
}) {
  const session = await getLiveSession();
  if (!ownsEmployee(session, input.employeeId)) return;
  const now = new Date();
  const date = shopToday(now);
  const iso = toDayString(date);
  await assertEditable(input.employeeId, iso);
  const rows = await dayEntries(input.employeeId, date);

  if (input.action === "IN") {
    const live = rows.find((row) => row.clockIn && !row.clockOut);
    // Moving the clock to another job mid-shift: bank the live row first so the
    // first job's worked hours aren't silently discarded by the re-punch below.
    const transferFrom = live && input.jobId && live.jobId !== input.jobId ? live : null;
    if (transferFrom) {
      const banked = Math.max(
        0,
        Math.round(
          liveActualHours(
            {
              date: iso,
              actualHours: transferFrom.actualHours,
              clockIn: transferFrom.clockIn!.toISOString(),
              clockOut: null,
            },
            now
          ) * 10
        ) / 10
      );
      await prisma.timeEntry.update({
        where: { id: transferFrom.id },
        data: {
          clockOut: now,
          actualHours: banked,
          status: deriveStatus(
            {
              date: iso,
              scheduledHours: transferFrom.scheduledHours,
              actualHours: banked,
              clockIn: transferFrom.clockIn!.toISOString(),
              clockOut: now.toISOString(),
            },
            now
          ),
        },
      });
      await writeAudit({
        employeeId: input.employeeId,
        actor: input.actor,
        action: "Clocked out",
        field: iso,
        newValue: `${banked.toFixed(1)} hrs`,
      });
    }
    const open = transferFrom ? rows.filter((row) => row.id !== transferFrom.id) : rows;
    const byJob = input.jobId ? open.find((row) => row.jobId === input.jobId) : null;
    const nextVisit = open.find((row) => row.scheduledHours > 0 && !row.clockOut);
    const existing = byJob || nextVisit || open[0] || null;
    const scheduledHours = existing?.scheduledHours ?? 8;
    const jobId = input.jobId !== undefined ? input.jobId : existing?.jobId ?? null;
    if (existing) {
      await prisma.timeEntry.update({
        where: { id: existing.id },
        data: {
          clockIn: now,
          clockOut: null,
          status: "IN_PROGRESS",
          jobId,
        },
      });
    } else {
      await prisma.timeEntry.create({
        data: {
          employeeId: input.employeeId,
          date,
          scheduledHours,
          actualHours: 0,
          clockIn: now,
          status: "IN_PROGRESS",
          jobId,
        },
      });
    }
    await writeAudit({
      employeeId: input.employeeId,
      actor: input.actor,
      action: "Clocked in",
      field: iso,
      newValue: now.toISOString(),
    });
    if (jobId) {
      await advanceJobPipeline(jobId, 4);
      await associateJobClient(jobId);
    }
    await refreshJobCost(jobId);
  } else {
    const existing = rows.find((row) => row.clockIn && !row.clockOut) || rows[0];
    if (!existing?.clockIn) {
      throw new Error("Cannot clock out before clocking in.");
    }
    const actualHours = Math.max(
      0,
      Math.round(
        (liveActualHours(
          {
            date: iso,
            actualHours: existing.actualHours,
            clockIn: existing.clockIn.toISOString(),
            clockOut: null,
          },
          now
        ) -
          (Number(input.unpaidHours) || 0)) *
          10
      ) / 10
    );
    const status = deriveStatus(
      {
        date: iso,
        scheduledHours: existing.scheduledHours,
        actualHours,
        clockIn: existing.clockIn.toISOString(),
        clockOut: now.toISOString(),
      },
      now
    );
    await prisma.timeEntry.update({
      where: { id: existing.id },
      data: { clockOut: now, actualHours, status },
    });
    await writeAudit({
      employeeId: input.employeeId,
      actor: input.actor,
      action: "Clocked out",
      field: iso,
      newValue: `${actualHours.toFixed(1)} hrs`,
    });
    await refreshJobCost(existing.jobId);
    await associateJobClient(existing.jobId);
  }

  revalidatePath("/");
}

export async function setPeriodApproval(input: {
  employeeId: string;
  approved: boolean;
  actor: string;
  periodStart?: string;
  periodEnd?: string;
}) {
  if (!(await requirePerm("payroll"))) return;
  const employee = await prisma.employee.findUniqueOrThrow({
    where: { id: input.employeeId },
  });
  const span = input.periodStart && input.periodEnd
    ? { start: input.periodStart, end: input.periodEnd }
    : await periodForEmployee(employee);

  const period = await upsertPeriodSnapshot(
    input.employeeId,
    span.start,
    span.end,
    input.approved ? "APPROVED" : "OPEN"
  );

  await prisma.payPeriod.update({
    where: { id: period.id },
    data: input.approved
      ? { approvedBy: input.actor || ACTOR_FALLBACK, approvedAt: new Date() }
      : { approvedBy: null, approvedAt: null, status: "OPEN" },
  });

  await writeAudit({
    employeeId: input.employeeId,
    actor: input.actor,
    action: input.approved ? "Approved pay period" : "Unlocked pay period",
    field: "status",
    oldValue: input.approved ? "OPEN" : "APPROVED",
    newValue: input.approved ? "APPROVED" : "OPEN",
  });
  revalidatePath("/");
}

export async function markPeriodPaid(input: {
  employeeId: string;
  periodId: string;
  actor: string;
}) {
  if (!(await requirePerm("payroll"))) return;
  const period = await prisma.payPeriod.findUniqueOrThrow({
    where: { id: input.periodId },
  });
  if (period.status !== "APPROVED" && period.status !== "PAID") {
    throw new Error("A supervisor must approve this period before it can be marked paid.");
  }

  await prisma.payPeriod.update({
    where: { id: period.id },
    data: { status: "PAID", paidAt: new Date() },
  });

  const year = new Date().getUTCFullYear();
  const paid = await prisma.payPeriod.findMany({
    where: {
      employeeId: input.employeeId,
      status: "PAID",
      startDate: { gte: new Date(Date.UTC(year, 0, 1)) },
    },
  });
  await prisma.employee.update({
    where: { id: input.employeeId },
    data: {
      ytdGross: paid.reduce((sum, item) => sum + item.grossPay, 0),
      ytdFederalTax: paid.reduce((sum, item) => sum + item.federalTax, 0),
      ytdStateTax: paid.reduce((sum, item) => sum + item.stateTax, 0),
      ytdNet: paid.reduce((sum, item) => sum + item.netPay, 0),
      ytdOvertime: paid.reduce((sum, item) => sum + item.overtimeHours, 0),
    },
  });

  await writeAudit({
    employeeId: input.employeeId,
    actor: input.actor,
    action: "Recorded payment",
    field: "status",
    oldValue: period.status,
    newValue: "PAID",
  });
  revalidatePath("/");
}

export async function addAdjustment(input: {
  employeeId: string;
  type: "DEDUCTION" | "REIMBURSEMENT";
  category: "TOOL_ALLOWANCE" | "UNIFORM" | "MATERIALS" | "OTHER";
  description: string;
  amount: number;
  actor: string;
}) {
  if (!(await requirePerm("payroll"))) return;
  const employee = await prisma.employee.findUniqueOrThrow({
    where: { id: input.employeeId },
  });
  const span = await periodForEmployee(employee);
  const record = await findPeriodRecord(input.employeeId, span.start, span.end);
  if (record && isLocked(record.status)) {
    throw new Error("This period is locked. Unlock it before adding adjustments.");
  }

  const period =
    record ??
    (await upsertPeriodSnapshot(input.employeeId, span.start, span.end));

  const today = shopToday();
  const onJob = await prisma.timeEntry.findFirst({
    where: { employeeId: input.employeeId, date: today, jobId: { not: null } },
    orderBy: { updatedAt: "desc" },
  });

  await prisma.payAdjustment.create({
    data: {
      employeeId: input.employeeId,
      payPeriodId: period.id,
      jobId: onJob?.jobId || null,
      type: input.type,
      category: input.category,
      description: input.description.trim(),
      amount: Math.abs(input.amount),
    },
  });
  await upsertPeriodSnapshot(input.employeeId, span.start, span.end);
  await writeAudit({
    employeeId: input.employeeId,
    actor: input.actor,
    action: "Added pay adjustment",
    field: input.category,
    newValue: `${input.type} ${input.amount}`,
  });
  await refreshJobCost(onJob?.jobId);
  revalidatePath("/");
}

export async function createEmployee(input: {
  firstName: string;
  lastName: string;
  jobTitle: string;
  payType: PayType;
  hourlyRate: number;
  actor: string;
  phone?: string | null;
}) {
  if (!(await allowSetupOrAdmin())) return;
  const employee = await prisma.employee.create({
    data: {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      jobTitle: input.jobTitle.trim(),
      payType: input.payType,
      hourlyRate: input.hourlyRate,
      salaryAnnual: input.payType === "SALARY" ? input.hourlyRate * 2080 : 0,
      baselineStartDate: shopToday(),
      payFrequency: (await loadPayrollSettings()).payFrequency,
      photoUrl: "/avatars/generic.svg",
      phone: input.phone?.trim() || null,
    },
  });
  await writeAudit({
    employeeId: employee.id,
    actor: input.actor,
    action: "Created employee profile",
    field: "profile",
    newValue: `${employee.firstName} ${employee.lastName}`,
  });
  await prisma.account.create({
    data: {
      role: "CREW",
      name: `${employee.firstName} ${employee.lastName}`.trim(),
      employeeId: employee.id,
      // Never made from the phone (go-public B1): the person picks it on their invite link.
      pinHash: UNSET_PIN_HASH,
      inviteToken: newPublicToken(),
    },
  });
  revalidatePath("/");
  return employee.id;
}

export async function issueCrewInvite(input: { employeeId: string; rotate?: boolean }) {
  const session = await requirePerm("company");
  if (!session) throw new Error("Office only.");
  await ensureAccounts();
  const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
  if (!employee) throw new Error("That person is not on the crew.");
  let account = await prisma.account.findUnique({ where: { employeeId: employee.id } });
  if (!account) {
    account = await prisma.account.create({
      data: {
        role: "CREW",
        name: `${employee.firstName} ${employee.lastName}`.trim(),
        employeeId: employee.id,
        // Never made from the phone (go-public B1): the person picks it on their invite link.
      pinHash: UNSET_PIN_HASH,
        inviteToken: newPublicToken(),
      },
    });
  } else if (!account.inviteToken || input.rotate) {
    account = await prisma.account.update({
      where: { id: account.id },
      data: { inviteToken: newPublicToken() },
    });
  }
  const origin = appOrigin({ headers: headers() });
  return {
    url: `${origin.replace(/\/$/, "")}/j/${encodeURIComponent(account.inviteToken || "")}`,
    name: account.name,
  };
}

export async function refreshPeriod(employeeId: string) {
  if (!(await requirePerm("payroll"))) return;
  const employee = await prisma.employee.findUniqueOrThrow({
    where: { id: employeeId },
  });
  const span = await periodForEmployee(employee);
  await upsertPeriodSnapshot(employeeId, span.start, span.end);
  revalidatePath("/");
}

export async function deleteEmployee(input: {
  employeeId: string;
  actor: string;
}) {
  if (!(await requirePerm("admin"))) return;
  const current = await prisma.employee.findUniqueOrThrow({
    where: { id: input.employeeId },
  });
  await prisma.employee.delete({ where: { id: input.employeeId } });
  await writeAudit({
    actor: input.actor,
    action: "Removed employee",
    field: "profile",
    oldValue: `${current.firstName} ${current.lastName}`,
  });
  revalidatePath("/");
}

export async function payCurrentPeriod(input: {
  employeeId: string;
  actor: string;
  periodStart: string;
  periodEnd: string;
}) {
  if (!(await requirePerm("payroll"))) return;
  const period = await upsertPeriodSnapshot(
    input.employeeId,
    input.periodStart,
    input.periodEnd,
    "PAID"
  );
  await prisma.payPeriod.update({
    where: { id: period.id },
    data: {
      status: "PAID",
      paidAt: new Date(),
      approvedBy: input.actor || ACTOR_FALLBACK,
      approvedAt: new Date(),
    },
  });

  const year = new Date().getUTCFullYear();
  const paid = await prisma.payPeriod.findMany({
    where: {
      employeeId: input.employeeId,
      status: "PAID",
      startDate: { gte: new Date(Date.UTC(year, 0, 1)) },
    },
  });
  await prisma.employee.update({
    where: { id: input.employeeId },
    data: {
      ytdGross: paid.reduce((sum, item) => sum + item.grossPay, 0),
      ytdFederalTax: paid.reduce((sum, item) => sum + item.federalTax, 0),
      ytdStateTax: paid.reduce((sum, item) => sum + item.stateTax, 0),
      ytdNet: paid.reduce((sum, item) => sum + item.netPay, 0),
      ytdOvertime: paid.reduce((sum, item) => sum + item.overtimeHours, 0),
    },
  });
  await writeAudit({
    employeeId: input.employeeId,
    actor: input.actor,
    action: "Recorded payment",
    field: "status",
    oldValue: period.status,
    newValue: "PAID",
  });
  revalidatePath("/");
}

export async function applyShiftToWeekdays(input: {
  employeeId: string;
  dates: string[];
  scheduledStart: string;
  scheduledEnd: string;
  actor: string;
}) {
  if (!(await requirePerm("dispatch"))) return;
  for (const date of input.dates) {
    const existing = await findDayEntry(input.employeeId, fromDayString(date));
    await upsertDayHours({
      employeeId: input.employeeId,
      date,
      scheduledHours: hoursBetween(input.scheduledStart, input.scheduledEnd),
      actualHours: existing?.actualHours ?? 0,
      scheduledStart: input.scheduledStart,
      scheduledEnd: input.scheduledEnd,
      jobId: existing?.jobId ?? null,
      serviceCodeId: existing?.serviceCodeId ?? null,
      notes: existing?.notes,
      actor: input.actor,
      entryId: existing?.id,
    });
  }
}

export async function copyPreviousWeek(input: {
  employeeId: string;
  dates: string[];
  previousDates: string[];
  actor: string;
}) {
  if (!(await requirePerm("dispatch"))) return;
  for (let i = 0; i < input.dates.length; i += 1) {
    const date = input.dates[i];
    const previous = input.previousDates[i];
    const source = await findDayEntry(input.employeeId, fromDayString(previous));
    const existing = await findDayEntry(input.employeeId, fromDayString(date));
    await upsertDayHours({
      employeeId: input.employeeId,
      date,
      scheduledHours: source?.scheduledHours ?? 0,
      actualHours: existing?.actualHours ?? 0,
      scheduledStart: source?.scheduledStart ?? null,
      scheduledEnd: source?.scheduledEnd ?? null,
      jobId: source?.jobId ?? null,
      serviceCodeId: source?.serviceCodeId ?? existing?.serviceCodeId ?? null,
      notes: existing?.notes,
      actor: input.actor,
      entryId: existing?.id,
    });
  }
}

export async function updateStartDate(input: {
  employeeId: string;
  baselineStartDate: string;
  actor: string;
}) {
  if (!(await requirePerm("admin"))) return;
  const current = await prisma.employee.findUniqueOrThrow({
    where: { id: input.employeeId },
  });
  await prisma.employee.update({
    where: { id: input.employeeId },
    data: { baselineStartDate: fromDayString(input.baselineStartDate) },
  });
  await writeAudit({
    employeeId: input.employeeId,
    actor: input.actor,
    action: "Updated start date",
    field: "baselineStartDate",
    oldValue: toDayString(current.baselineStartDate),
    newValue: input.baselineStartDate,
  });
  revalidatePath("/");
}

export async function updateEmploymentRecord(input: {
  employeeId: string;
  actor: string;
  employmentStatus?: string;
  employmentEndDate?: string | null;
}) {
  if (!(await requirePerm("admin"))) return;
  const current = await prisma.employee.findUniqueOrThrow({
    where: { id: input.employeeId },
  });
  const status =
    input.employmentStatus != null ? parseEmploymentStatus(input.employmentStatus) : undefined;
  const endDate =
    input.employmentEndDate === undefined
      ? undefined
      : input.employmentEndDate
        ? fromDayString(input.employmentEndDate)
        : null;
  await prisma.employee.update({
    where: { id: input.employeeId },
    data: {
      ...(status ? { employmentStatus: status } : {}),
      ...(endDate !== undefined ? { employmentEndDate: endDate } : {}),
    },
  });
  await writeAudit({
    employeeId: input.employeeId,
    actor: input.actor,
    action: "Updated employment record",
    field: "employment",
    oldValue: `${current.employmentStatus || "ACTIVE"} ${current.employmentEndDate ? toDayString(current.employmentEndDate) : ""}`.trim(),
    newValue: `${status || current.employmentStatus || "ACTIVE"} ${
      endDate ? toDayString(endDate) : input.employmentEndDate === null ? "" : current.employmentEndDate ? toDayString(current.employmentEndDate) : ""
    }`.trim(),
  });
  revalidatePath("/");
}

export async function createJob(input: {
  name: string;
  client: string;
  address?: string;
  dueDate?: string;
  actor: string;
  customerId?: string;
}) {
  if (!(await requirePerm("lead"))) return;
  const count = await prisma.job.count();
  const settings = await loadPayrollSettings();
  const client = input.client.trim() || "Unassigned";
  const address = input.address?.trim() || "";
  const customer = await findOrCreateCustomer({
    id: input.customerId,
    name: client,
    address,
    actor: input.actor,
    quiet: true,
  });
  const job = await prisma.job.create({
    data: {
      code: nextJobCode(settings.businessName, count),
      name: input.name.trim(),
      client: customer?.name || client,
      customerId: customer?.id || null,
      address: address || customer?.address || "",
      dueDate: input.dueDate ? fromDayString(input.dueDate) : null,
    },
  });
  await writeAudit({
    actor: input.actor,
    action: "Created job",
    field: "job",
    newValue: `${job.code} ${job.name}`,
  });
  revalidatePath("/");
  return job.id;
}

export async function createCustomer(input: {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  actor: string;
  jobId?: string;
}) {
  if (!(await requirePerm("estimate"))) return;
  if (!input.name.trim()) throw new Error("Name the customer.");
  const customer = await findOrCreateCustomer(input);
  if (input.jobId) {
    await associateJobClient(input.jobId, {
      customerId: customer?.id,
      name: input.name,
      phone: input.phone,
      email: input.email,
      address: input.address,
      actor: input.actor,
    });
  }
  revalidatePath("/");
  return customer?.id;
}

export async function createInvoice(input: {
  customerId: string;
  jobId?: string;
  amount: number;
  dueDate: string;
  actor: string;
}) {
  if (!(await requirePerm("invoice"))) return;
  if (!input.customerId) throw new Error("Pick a customer.");
  if (!(input.amount > 0)) throw new Error("Invoice needs an amount.");
  const count = await prisma.invoice.count();
  const invoice = await prisma.invoice.create({
    data: {
      number: `INV-${1001 + count}`,
      customerId: input.customerId,
      jobId: input.jobId || null,
      amount: input.amount,
      status: "PENDING",
      dueDate: fromDayString(input.dueDate),
      lines: {
        create: {
          kind: "OTHER",
          description: "Services",
          quantity: 1,
          unit: "ea",
          rate: input.amount,
          sortOrder: 0,
        },
      },
    },
  });
  await writeAudit({
    actor: input.actor,
    action: "Created invoice",
    field: "invoice",
    newValue: `${invoice.number} ${invoice.amount}`,
  });
  revalidatePath("/");
  return invoice.id;
}

export async function payInvoice(input: { invoiceId: string; actor: string }) {
  if (!(await requirePerm("invoice"))) return;
  const current = await prisma.invoice.findUniqueOrThrow({
    where: { id: input.invoiceId },
  });
  if (current.status === "PAID") {
    await prisma.invoice.update({
      where: { id: input.invoiceId },
      data: { status: "PENDING", paidAt: null },
    });
    await writeAudit({
      actor: input.actor,
      action: "Reopened invoice",
      field: "invoice",
      newValue: input.invoiceId,
    });
  } else {
    await markInvoicePaid({ invoiceId: current.id, actor: input.actor });
    await advanceJobPipeline(current.jobId, 5);
    await associateJobClient(current.jobId);
    await writeAudit({
      actor: input.actor,
      action: "Paid invoice",
      field: "invoice",
      newValue: input.invoiceId,
    });
  }
  await refreshJobCost(current.jobId);
  revalidatePath("/");
}

export async function setJobPipeline(input: {
  jobId: string;
  pipeline: number;
  actor: string;
}) {
  const session = await getLiveSession();
  if (!can(session, "lead") && !(can(session, "estimate") && input.pipeline <= 4)) return;
  const pipeline = Math.max(0, Math.min(6, Math.round(input.pipeline)));
  const job = await prisma.job.findUniqueOrThrow({ where: { id: input.jobId } });
  await prisma.job.update({
    where: { id: input.jobId },
    data: {
      pipeline,
      leadCalledAt: pipeline >= 1 ? job.leadCalledAt ?? new Date() : job.leadCalledAt,
    },
  });
  await writeAudit({
    actor: input.actor,
    action: "Set job pipeline",
    field: "pipeline",
    oldValue: String(job.pipeline),
    newValue: String(pipeline),
  });
  await refreshJobCost(input.jobId);
  revalidatePath("/");
}

export async function updateJob(input: {
  jobId: string;
  name?: string;
  client?: string;
  address?: string;
  phone?: string;
  email?: string;
  notes?: string;
  timeline?: string;
  dueDate?: string | null;
  prepChecklist?: string;
  actor: string;
}) {
  if (!(await requirePerm("estimate"))) return;
  // Active board rows merge one by one, and crew phones can't touch change orders (lib/active-board.ts).
  const prepChecklist =
    input.prepChecklist !== undefined
      ? mergePrepForSave(
          (await prisma.job.findUnique({ where: { id: input.jobId }, select: { prepChecklist: true } }))?.prepChecklist,
          input.prepChecklist,
          (await getLiveSession())?.role
        )
      : undefined;
  await prisma.job.update({
    where: { id: input.jobId },
    data: {
      name: input.name?.trim() || undefined,
      client: input.client?.trim() || undefined,
      address: input.address !== undefined ? input.address.trim() : undefined,
      notes: input.notes !== undefined ? input.notes.trim() : undefined,
      timeline: input.timeline !== undefined ? input.timeline.trim() : undefined,
      dueDate: input.dueDate === null ? null : input.dueDate ? fromDayString(input.dueDate) : undefined,
      prepChecklist,
    },
  });
  await associateJobClient(input.jobId, {
    name: input.client,
    address: input.address,
    phone: input.phone,
    email: input.email,
    actor: input.actor,
  });
  await writeAudit({
    actor: input.actor,
    action: "Updated job",
    field: "job",
    newValue: input.jobId,
  });
  revalidatePath("/");
}

export async function pageCrew(input: { jobId: string; text: string; actor: string }) {
  if (!(await requirePerm("alerts"))) return;
  const text = input.text.replace(/\s+/g, " ").trim();
  if (!text) return;
  const job = await prisma.job.findUnique({ where: { id: input.jobId } });
  if (!job) return;
  await raiseAlert({
    kind: "DISPATCH",
    priority: "urgent",
    title: `${job.code} · job site`,
    body: text,
    href: "/",
    jobId: job.id,
  });
  await writeAudit({
    actor: input.actor,
    action: "Paged crew",
    field: job.id,
    newValue: text.slice(0, 180),
  });
}

export async function saveLead(input: {
  jobId: string;
  clientName: string;
  phone: string;
  address: string;
  scopeOfWork: string;
  timeline: string;
  actor: string;
  appointment?: {
    employeeId: string;
    date: string;
    start: string;
    end: string;
  } | null;
}) {
  if (!(await requirePerm("lead"))) return;
  const clientName = input.clientName.trim();
  if (!clientName) throw new Error("Put a name on this lead.");
  const job = await prisma.job.findUniqueOrThrow({ where: { id: input.jobId } });
  const phone = input.phone.trim();
  const address = input.address.trim();
  const notes = input.scopeOfWork.trim();
  const timeline = input.timeline.trim();

  const customer = await findOrCreateCustomer({
    name: clientName,
    phone,
    address,
    actor: input.actor,
    quiet: true,
  });

  await prisma.job.update({
    where: { id: job.id },
    data: {
      client: clientName,
      customerId: customer?.id || null,
      address,
      notes,
      timeline,
      pipeline: Math.max(job.pipeline, 1),
      leadCalledAt: job.leadCalledAt,
    },
  });
  await associateJobClient(job.id, {
    customerId: customer?.id,
    name: clientName,
    phone,
    address,
    actor: input.actor,
  });

  await writeAudit({
    actor: input.actor,
    action: "Saved lead",
    field: "job",
    newValue: `${clientName} ${phone} ${address}`.trim(),
  });

  if (input.appointment?.employeeId && input.appointment.date) {
    const date = fromDayString(input.appointment.date);
    const rows = await dayEntries(input.appointment.employeeId, date);
    const same = rows.find((row) => row.jobId === job.id);
    const overlap = rows.find((row) => {
      if (row.jobId === job.id || row.scheduledHours <= 0) return false;
      const bookedStart = row.scheduledStart || "07:00";
      const bookedEnd = row.scheduledEnd || "15:00";
      return rangesOverlap(
        input.appointment!.start || "09:00",
        input.appointment!.end || "10:00",
        bookedStart,
        bookedEnd
      );
    });
    if (overlap) {
      const who = overlap.employee.firstName;
      const other = overlap.job?.name || overlap.job?.client || "another job";
      throw new Error(
        `${who} is on ${other} ${overlap.scheduledStart || "that slot"}. Lead is saved — pick the packed slot.`
      );
    }
    await upsertDayHours({
      employeeId: input.appointment.employeeId,
      date: input.appointment.date,
      scheduledHours: hoursBetween(
        input.appointment.start || "09:00",
        input.appointment.end || "10:00"
      ),
      actualHours: same?.actualHours ?? 0,
      jobId: job.id,
      serviceCodeId: same?.serviceCodeId ?? null,
      scheduledStart: input.appointment.start || "09:00",
      scheduledEnd: input.appointment.end || "10:00",
      actor: input.actor,
      entryId: same?.id,
    });
  }

  revalidatePath("/");
}

export async function updateCustomer(input: {
  customerId: string;
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  actor: string;
}) {
  if (!(await requirePerm("estimate"))) return;
  await prisma.customer.update({
    where: { id: input.customerId },
    data: {
      name: input.name !== undefined ? input.name.trim() || undefined : undefined,
      phone: input.phone !== undefined ? input.phone.trim() : undefined,
      email: input.email !== undefined ? input.email.trim() : undefined,
      address: input.address !== undefined ? input.address.trim() : undefined,
    },
  });
  await writeAudit({
    actor: input.actor,
    action: "Updated customer",
    field: "customer",
    newValue: input.customerId,
  });
  revalidatePath("/");
}

async function replaceLines(
  where: { estimateId?: string; invoiceId?: string },
  lines: DocLineDraft[]
) {
  if (where.estimateId) await prisma.docLine.deleteMany({ where: { estimateId: where.estimateId } });
  if (where.invoiceId) await prisma.docLine.deleteMany({ where: { invoiceId: where.invoiceId } });
  const lineData = (withTier: boolean) =>
    lines.map((line, index) => ({
      estimateId: where.estimateId,
      invoiceId: where.invoiceId,
      kind: line.kind,
      description: line.description.trim() || (line.kind === "LABOR" ? "Labor" : "Item"),
      quantity: Number(line.quantity) || 0,
      unit: line.unit || "ea",
      rate: Number(line.rate) || 0,
      sortOrder: index,
      ...(withTier ? { tier: line.tier || "" } : {}),
    }));
  try {
    await prisma.docLine.createMany({ data: lineData(true) });
  } catch {
    // Tier column may not exist in prod yet — ensure it, then retry.
    try {
      await prisma.$executeRaw`ALTER TABLE "DocLine" ADD COLUMN IF NOT EXISTS "tier" TEXT DEFAULT ''`;
      await prisma.docLine.createMany({ data: lineData(true) });
    } catch {
      // Fall back to untiered lines.
      await prisma.docLine.createMany({ data: lineData(false) });
    }
  }
}

export async function saveEstimate(input: {
  jobId: string;
  customerId?: string | null;
  notes: string;
  terms?: string;
  prompt?: string;
  taxRate?: number;
  lines: DocLineDraft[];
  actor: string;
}) {
  if (!(await requirePerm("estimate"))) return;
  const totals = documentTotals(input.lines, input.taxRate);
  const existing = await prisma.estimate.findUnique({ where: { jobId: input.jobId } });
  const count = await prisma.estimate.count();
  const estimate = existing
    ? await prisma.estimate.update({
        where: { id: existing.id },
        data: {
          customerId: input.customerId || existing.customerId || null,
          notes: input.notes,
          terms: input.terms?.trim() || DEFAULT_ESTIMATE_TERMS,
          taxRate: input.taxRate || 0,
        },
      })
    : await prisma.estimate.create({
        data: {
          number: `EST-${1001 + count}`,
          jobId: input.jobId,
          customerId: input.customerId || null,
          notes: input.notes,
          terms: input.terms?.trim() || DEFAULT_ESTIMATE_TERMS,
          taxRate: input.taxRate || 0,
        },
      });
  if (typeof input.prompt === "string") {
    await prisma.appSettings.updateMany({
      where: { id: "default" },
      data: { estimatePrompt: input.prompt.trim() },
    });
  }
  await replaceLines({ estimateId: estimate.id }, input.lines);
  await associateJobClient(input.jobId, {
    customerId: input.customerId || estimate.customerId,
    actor: input.actor,
  });
  await writeAudit({
    actor: input.actor,
    action: "Saved estimate",
    field: "estimate",
    newValue: `${estimate.number} ${totals.total}`,
  });
  await refreshJobCost(input.jobId);
  revalidatePath("/");
  return estimate.id;
}

export async function saveJobInvoice(input: {
  invoiceId?: string;
  jobId: string;
  customerId: string;
  notes: string;
  terms?: string;
  taxRate?: number;
  dueDate: string;
  lines: DocLineDraft[];
  actor: string;
}) {
  if (!(await requirePerm("invoice"))) return;
  if (!input.customerId) throw new Error("Pick a customer.");
  const totals = documentTotals(input.lines, input.taxRate);
  const count = await prisma.invoice.count();
  const existing = input.invoiceId
    ? await prisma.invoice.findUnique({ where: { id: input.invoiceId } })
    : null;
  if (existing?.status === "PAID") throw new Error("This invoice is already paid.");
  const shopRow = await prisma.appSettings.findUnique({ where: { id: "default" }, select: { businessName: true } });
  const defaultTerms = invoiceTermsFor(shopRow?.businessName);
  const invoice = existing
    ? await prisma.invoice.update({
        where: { id: existing.id },
        data: {
          customerId: input.customerId,
          jobId: input.jobId,
          amount: totals.total,
          notes: input.notes,
          terms: input.terms?.trim() || defaultTerms,
          taxRate: input.taxRate || 0,
          dueDate: fromDayString(input.dueDate),
          status: existing.status === "PAID" ? "PAID" : "PENDING",
        },
      })
    : await prisma.invoice.create({
        data: {
          number: `INV-${1001 + count}`,
          customerId: input.customerId,
          jobId: input.jobId,
          amount: totals.total,
          notes: input.notes,
          terms: input.terms?.trim() || defaultTerms,
          taxRate: input.taxRate || 0,
          dueDate: fromDayString(input.dueDate),
          status: "PENDING",
        },
      });
  await replaceLines({ invoiceId: invoice.id }, input.lines);
  await associateJobClient(input.jobId, { customerId: input.customerId, actor: input.actor });
  await writeAudit({
    actor: input.actor,
    action: "Saved invoice",
    field: "invoice",
    newValue: `${invoice.number} ${totals.total}`,
  });
  await refreshJobCost(input.jobId);
  revalidatePath("/");
  return invoice.id;
}

export async function markDocumentSent(input: {
  kind: "estimate" | "invoice";
  id: string;
  actor: string;
}) {
  if (input.kind === "invoice") {
    if (!(await requirePerm("invoice"))) return;
  } else if (!(await requirePerm("estimate"))) return;
  const sentAt = new Date();
  if (input.kind === "estimate") {
    await ensureEstimateToken(input.id);
    const estimate = await prisma.estimate.update({
      where: { id: input.id },
      data: { sentAt, status: "SENT" },
    });
    await advanceJobPipeline(estimate.jobId, 2);
  } else {
    await prisma.invoice.update({
      where: { id: input.id },
      data: { sentAt },
    });
  }
  await writeAudit({
    actor: input.actor,
    action: `Sent ${input.kind}`,
    field: input.kind,
    newValue: input.id,
  });
  revalidatePath("/");
}

export async function sendEstimate(input: {
  estimateId: string;
  actor: string;
  channels?: Array<"email" | "sms">;
  origin: string;
}) {
  if (!(await requirePerm("estimate"))) return;
  await requireBasePlan();
  const result = await deliverEstimate(input);
  const estimate = await prisma.estimate.findUnique({ where: { id: result.estimateId } });
  if (estimate) await advanceJobPipeline(estimate.jobId, 2);
  const used = [
    result.email?.ok ? "email" : null,
    result.sms?.ok ? "sms" : null,
  ].filter(Boolean);
  await writeAudit({
    actor: input.actor,
    action: "Sent estimate",
    field: "estimate",
    newValue: `${result.estimateId} ${used.join("+")} ${result.url}`,
  });
  revalidatePath("/");
  revalidatePath(`/e/${result.url.split("/").pop()}`);
  return result;
}

export async function sendInvoice(input: {
  invoiceId: string;
  actor: string;
  channels?: Array<"email" | "sms">;
  origin: string;
}) {
  if (!(await requirePerm("invoice"))) return;
  await requireBasePlan();
  const result = await deliverInvoice(input);
  const invoice = await prisma.invoice.findUnique({ where: { id: result.invoiceId } });
  await writeAudit({
    actor: input.actor,
    action: "Sent invoice",
    field: "invoice",
    newValue: `${result.invoiceId} ${result.url}`,
  });
  revalidatePath("/");
  if (invoice?.publicToken) revalidatePath(`/p/${invoice.publicToken}`);
  return result;
}

/**
 * Client "Pay by card" on /p/<token>. Opens a real Stripe Checkout when the shop's
 * card payments are set up; otherwise says so. This NEVER marks the invoice paid
 * (audit bug 4): PAID only comes from the signed Stripe webhook or the owner
 * recording cash / check on the Invoice step.
 */
async function startInvoiceCardPaymentInShop(input: { token: string }): Promise<ClientCardStart> {
  const token = String(input?.token || "").trim();
  if (!token) return { ok: false, reason: "invalid", message: "This pay link is not valid." };
  const origin = appOrigin({ headers: headers() });
  return openClientCardCheckout({ token, origin });
}

export async function acceptEstimate(input: { estimateId: string; actor: string }) {
  if (!(await requirePerm("estimate"))) return;
  await prisma.estimate.update({
    where: { id: input.estimateId },
    data: { status: "ACCEPTED", acceptedAt: new Date(), signedName: input.actor },
  });
  await writeAudit({
    actor: input.actor,
    action: "Accepted estimate",
    field: "estimate",
    newValue: input.estimateId,
  });
  await raiseEstimateAlert({ estimateId: input.estimateId, kind: "ESTIMATE_APPROVED", actor: input.actor });
  revalidatePath("/");
}

async function recordEstimateViewInShop(token: string) {
  const estimate = await prisma.estimate.findUnique({ where: { publicToken: token } });
  if (!estimate) return null;
  if (estimate.status === "ACCEPTED" || estimate.status === "CHANGES") return estimate;
  if (estimate.status === "DRAFT") return estimate;
  if (!estimate.viewedAt || estimate.status === "SENT") {
    await prisma.estimate.update({
      where: { id: estimate.id },
      data: {
        viewedAt: estimate.viewedAt || new Date(),
        status: "VIEWED",
      },
    });
    await logEstimateViewed({ estimateId: estimate.id, customerId: estimate.customerId });
    await writeAudit({
      actor: estimate.customerId || "client",
      action: "Client opened estimate",
      field: "estimate",
      newValue: estimate.id,
    });
    await raiseEstimateAlert({ estimateId: estimate.id, kind: "ESTIMATE_VIEWED" });
    revalidatePath("/");
  }
  return estimate;
}

async function clientApproveEstimateInShop(input: { token: string; signedName: string }) {
  const name = input.signedName.trim();
  if (name.length < 2) throw new Error("Type your name to sign.");
  const estimate = await prisma.estimate.findUnique({ where: { publicToken: input.token } });
  if (!estimate) throw new Error("This estimate link is not valid.");
  if (estimate.status === "DRAFT") throw new Error("This estimate has not been sent yet.");
  await prisma.estimate.update({
    where: { id: estimate.id },
    data: {
      status: "ACCEPTED",
      acceptedAt: new Date(),
      signedName: name,
      viewedAt: estimate.viewedAt || new Date(),
    },
  });
  await writeAudit({
    actor: name,
    action: "Client approved estimate",
    field: "estimate",
    newValue: estimate.id,
  });
  await raiseEstimateAlert({ estimateId: estimate.id, kind: "ESTIMATE_APPROVED", actor: name });
  revalidatePath("/");
  revalidatePath(`/e/${input.token}`);
}

async function clientRequestEstimateChangesInShop(input: { token: string; note: string }) {
  const note = input.note.trim();
  if (note.length < 3) throw new Error("Tell us what to change.");
  const estimate = await prisma.estimate.findUnique({ where: { publicToken: input.token } });
  if (!estimate) throw new Error("This estimate link is not valid.");
  if (estimate.status === "DRAFT") throw new Error("This estimate has not been sent yet.");
  if (estimate.status === "ACCEPTED") throw new Error("This estimate is already approved.");
  await prisma.estimate.update({
    where: { id: estimate.id },
    data: {
      status: "CHANGES",
      changesAt: new Date(),
      clientNote: note,
      viewedAt: estimate.viewedAt || new Date(),
    },
  });
  await writeAudit({
    actor: "client",
    action: "Client requested estimate changes",
    field: "estimate",
    newValue: note.slice(0, 240),
  });
  await raiseEstimateAlert({ estimateId: estimate.id, kind: "ESTIMATE_CHANGES" });
  revalidatePath("/");
  revalidatePath(`/e/${input.token}`);
}

export async function savePayrollSetup(input: {
  frequency: "WEEKLY" | "BIWEEKLY";
  periodStart: string;
  actor: string;
}) {
  if (!(await allowSetupOrAdmin())) return;
  const start = fromDayString(input.periodStart);
  await prisma.appSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      payFrequency: input.frequency,
      periodAnchor: start,
      setupComplete: true,
    },
    update: {
      payFrequency: input.frequency,
      periodAnchor: start,
      setupComplete: true,
    },
  });
  await prisma.employee.updateMany({
    data: { payFrequency: input.frequency },
  });
  const employees = await prisma.employee.findMany();
  for (const employee of employees) {
    const span = await periodForEmployee(employee);
    await upsertPeriodSnapshot(employee.id, span.start, span.end);
  }
  await writeAudit({
    actor: input.actor,
    action: "Set payroll period",
    field: "payFrequency",
    newValue: `${input.frequency} ${input.periodStart}`,
  });
  revalidatePath("/");
}

export async function saveShellTheme(input: { theme: string; ink?: string; actor: string }) {
  if (!(await allowSetupOrAdmin())) return;
  const look = parseShellTheme(input.theme);
  const ink = input.ink == null ? undefined : formatShellInk(parseShellInk(input.ink));
  await prisma.appSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      payFrequency: "WEEKLY",
      periodAnchor: new Date(),
      setupComplete: false,
      shellTheme: look,
      ...(ink !== undefined ? { shellInk: ink } : {}),
    },
    update: {
      shellTheme: look,
      ...(ink !== undefined ? { shellInk: ink } : {}),
    },
  });
  await writeAudit({
    actor: input.actor,
    action: "Set app look",
    field: "shellTheme",
    newValue: ink ? `${look} ${ink}` : look,
  });
  revalidatePath("/");
}

export async function savePayPrefs(input: {
  acceptCard: boolean;
  acceptAch: boolean;
  acceptCash: boolean;
  depositPercent: number;
  actor: string;
}) {
  if (!(await allowSetupOrAdmin())) return;
  const prefs = parsePayPrefs(input);
  await prisma.appSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      payFrequency: "WEEKLY",
      periodAnchor: new Date(),
      setupComplete: false,
      ...prefs,
    },
    update: prefs,
  });
  await writeAudit({
    actor: input.actor,
    action: "Set invoice payment options",
    field: "payPrefs",
    newValue: payPrefsSummary(prefs),
  });
  revalidatePath("/");
}

export async function completeOnboarding(input: {
  owner: { firstName: string; lastName: string; email: string; phone: string; pin?: string };
  business: {
    name: string;
    address: string;
    email?: string;
    industry: string;
    size: string;
    logoUrl?: string | null;
  };
  accountingSoftware: "QUICKBOOKS" | "XERO" | "OTHER" | "NONE";
  frequency: "WEEKLY" | "BIWEEKLY";
  periodStart: string;
  bosses: { firstName: string; lastName: string; phone?: string; email?: string }[];
  crew: {
    firstName: string;
    lastName: string;
    jobTitle: string;
    phone?: string;
    hourlyRate?: number;
  }[];
  companyPhone: string;
  answeringLine: string;
  termsAccepted: boolean;
  actor: string;
  shellTheme?: string;
  shellInk?: string;
  payPrefs?: {
    acceptCard: boolean;
    acceptAch: boolean;
    acceptCash: boolean;
    depositPercent: number;
  };
}): Promise<(SignupLanding & { mock: boolean }) | void> {
  if (!(await allowSetupOrAdmin())) return;
  if (!input.termsAccepted) {
    throw new Error("Agree to the Terms & Conditions and Privacy Policy to finish setup.");
  }
  // Go-public B1: the office PIN is always picked, never the end of a phone number, never 0000/1234.
  {
    const typedPin = String(input.owner.pin || "").replace(/\D/g, "");
    const officeNow = await prisma.account.findFirst({ where: { role: "ADMIN", employeeId: null } });
    if (typedPin || !officeNow || !pinIsSet(officeNow.pinHash)) {
      const problem = pinProblem(typedPin, [input.owner.phone, input.companyPhone]);
      if (problem) throw new Error(problem);
    }
  }
  const start = fromDayString(input.periodStart);
  const existing = await prisma.appSettings.findUnique({ where: { id: "default" } });
  const trial = billingOnSetup(existing, new Date()) || {};
  // A new trial needs the $1 card check first (signup finish verifies the phone's one-use token).
  if (Object.keys(trial).length && !cardCheckOnFile(existing)) {
    throw new Error("Check your card first. It’s a $1 hold, returned right away.");
  }
  const agreed = { termsAcceptedAt: new Date(), termsVersion: LEGAL_VERSION };
  const look = parseShellTheme(input.shellTheme);
  const ink = formatShellInk(parseShellInk(input.shellInk));
  const pay = parsePayPrefs(input.payPrefs);
  await prisma.appSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      payFrequency: input.frequency,
      periodAnchor: start,
      setupComplete: true,
      ownerFirstName: input.owner.firstName.trim(),
      ownerLastName: input.owner.lastName.trim(),
      ownerEmail: input.owner.email.trim(),
      ownerPhone: input.owner.phone.trim(),
      businessName: input.business.name.trim(),
      businessAddress: input.business.address.trim(),
      businessEmail: (input.business.email || input.owner.email).trim(),
      industry: input.business.industry,
      businessSize: input.business.size,
      accountingSoftware: input.accountingSoftware,
      companyPhone: input.companyPhone.trim(),
      answeringLine: input.answeringLine.trim(),
      logoUrl: input.business.logoUrl ?? null,
      shellTheme: look,
      shellInk: ink,
      ...pay,
      ...trial,
      ...agreed,
    },
    update: {
      payFrequency: input.frequency,
      periodAnchor: start,
      setupComplete: true,
      ownerFirstName: input.owner.firstName.trim(),
      ownerLastName: input.owner.lastName.trim(),
      ownerEmail: input.owner.email.trim(),
      ownerPhone: input.owner.phone.trim(),
      businessName: input.business.name.trim(),
      businessAddress: input.business.address.trim(),
      businessEmail: (input.business.email || input.owner.email).trim(),
      industry: input.business.industry,
      businessSize: input.business.size,
      accountingSoftware: input.accountingSoftware,
      companyPhone: input.companyPhone.trim(),
      answeringLine: input.answeringLine.trim(),
      logoUrl: input.business.logoUrl ?? undefined,
      shellTheme: look,
      shellInk: ink,
      ...pay,
      ...trial,
      ...agreed,
    },
  });

  await prisma.boss.deleteMany();
  await prisma.boss.create({
    data: {
      firstName: input.owner.firstName.trim(),
      lastName: input.owner.lastName.trim(),
      phone: input.owner.phone.trim() || null,
      email: input.owner.email.trim() || null,
      isOwner: true,
      hasAppAccess: true,
    },
  });
  for (const boss of input.bosses) {
    if (!boss.firstName.trim()) continue;
    await prisma.boss.create({
      data: {
        firstName: boss.firstName.trim(),
        lastName: boss.lastName.trim(),
        phone: boss.phone?.trim() || null,
        email: boss.email?.trim() || null,
        isOwner: false,
        hasAppAccess: true,
      },
    });
  }

  await prisma.employee.updateMany({
    data: { payFrequency: input.frequency },
  });
  const actor =
    `${input.owner.firstName} ${input.owner.lastName}`.trim() || input.actor;
  for (const member of input.crew) {
    if (!member.firstName.trim()) continue;
    await createEmployee({
      actor,
      firstName: member.firstName,
      lastName: member.lastName || "Crew",
      jobTitle: member.jobTitle || "Field",
      payType: "HOURLY",
      hourlyRate: member.hourlyRate || 0,
      phone: member.phone,
    });
  }

  const employees = await prisma.employee.findMany();
  for (const employee of employees) {
    const span = await periodForEmployee(employee);
    await upsertPeriodSnapshot(employee.id, span.start, span.end);
  }

  await writeAudit({
    actor,
    action: "Finished company setup",
    field: "onboarding",
    newValue: input.business.name,
  });
  await ensureAccounts();
  const admin = await prisma.account.findFirst({ where: { role: "ADMIN", employeeId: null } });
  const ownerPin = normalizePin(input.owner.pin);
  if (admin && ownerPin) {
    await prisma.account.update({ where: { id: admin.id }, data: { pinHash: hashPin(ownerPin) } });
  }
  if (admin) await writeSessionCookie(toSession(admin));

  const provisioned = await provisionSignupTrial({
    email: input.owner.email.trim(),
    name: `${input.owner.firstName} ${input.owner.lastName}`.trim() || input.business.name.trim(),
    existingCustomerId: existing?.stripeCustomerId,
    existingSubId: existing?.stripeSubId,
  });
  await prisma.appSettings.update({
    where: { id: "default" },
    data: provisioned.rowPatch,
  });
  await writeAudit({
    actor,
    action: provisioned.landing.verified
      ? "Verified 30-day Stripe trial"
      : "Signup trial pending Stripe confirmation",
    field: "billing",
    newValue: provisioned.rowPatch.stripeCustomerId || "pending",
  });
  revalidatePath("/");
  return provisioned.landing;
}

export async function startBillingCheckout(kind: BillingKind, intervalInput?: string) {
  if (!(await requirePerm("admin"))) return null;
  // Go-public B4: no Stripe key = nothing is charged and nothing turns on. Say so; never fake "subscribed".
  if (!stripeConfigured()) return { url: "", mock: true as const, notConnected: true as const };
  const interval = kind === "base" ? parseBillingInterval(intervalInput) : "month";
  await ensureBilling();
  const row = await loadBillingRow();
  const settings = await loadPayrollSettings();
  const origin = appOrigin({ headers: headers() });
  const session = await createSubscriptionCheckout({
    kind,
    interval,
    origin,
    email: settings.ownerEmail || undefined,
    name: `${settings.ownerFirstName} ${settings.ownerLastName}`.trim() || settings.businessName,
    customerId: row?.stripeCustomerId || undefined,
    trialEndsAt: row?.trialEndsAt || undefined,
  });
  if (session.mock) return { url: "", mock: true as const, notConnected: true as const };
  return { url: session.url, mock: false as const };
}

export async function openBillingPortal() {
  if (!(await requirePerm("admin"))) return null;
  const row = await loadBillingRow();
  const origin = appOrigin({ headers: headers() });
  const liveCustomer = row?.stripeCustomerId && !row.stripeCustomerId.startsWith("mock_");
  // Go-public B4: no fake "Visa •••• 4242" on file when Stripe isn't connected.
  if (!stripeConfigured() || !liveCustomer) return { url: "", mock: true as const, notConnected: true as const };
  return createBillingPortal({ customerId: String(row?.stripeCustomerId), origin });
}

export async function startConnectOnboarding() {
  if (!(await requirePerm("admin"))) return null;
  // Go-public B4: no fake "bank linked •••• 6789" when Stripe isn't connected.
  if (!stripeConfigured()) return { url: "", mock: true as const, notConnected: true as const };
  await ensureBilling();
  const settings = await loadPayrollSettings();
  const row = await loadBillingRow();
  const origin = appOrigin({ headers: headers() });
  let accountId = row?.connectAccountId || "";
  if (!accountId) {
    const created = await createConnectAccount({ email: settings.ownerEmail || undefined });
    accountId = created.id;
    await prisma.appSettings.update({
      where: { id: "default" },
      data: {
        connectAccountId: accountId,
        connectStatus: created.mock ? "complete" : "pending",
        connectBankLast4: created.mock ? "6789" : "",
      },
    });
    if (created.mock) {
      revalidatePath("/");
      return { url: `${origin}/?tab=company&connect=return`, mock: true as const };
    }
  } else if (accountId.startsWith("acct_mock")) {
    await prisma.appSettings.update({
      where: { id: "default" },
      data: mapConnectAccount({
        id: accountId,
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
        last4: "6789",
      }),
    });
    revalidatePath("/");
    return { url: `${origin}/?tab=company&connect=return`, mock: true as const };
  }
  const link = await createConnectOnboardingLink({ accountId, origin });
  if (!row?.connectAccountId) {
    await prisma.appSettings.update({
      where: { id: "default" },
      data: { connectAccountId: accountId, connectStatus: "pending" },
    });
  }
  revalidatePath("/");
  return { url: link.url, mock: link.mock };
}

export async function refreshConnectAccount() {
  if (!(await requirePerm("admin"))) return null;
  const row = await loadBillingRow();
  if (!row?.connectAccountId) return { status: "unlinked" as const };
  const live = await retrieveConnectAccount(row.connectAccountId);
  if (!live) return { status: row.connectStatus };
  const mapped = mapConnectAccount(live);
  await prisma.appSettings.update({ where: { id: "default" }, data: mapped });
  revalidatePath("/");
  return { status: mapped.connectStatus };
}

async function completeEmployeeOnboardInShop(input: {
  token?: string | null;
  username: string;
  password: string;
  payMethod: string;
  filingStatus: string;
  allowances: number;
  /** The crew member's own sign-in PIN, 4–6 numbers (required when none is set yet). */
  pin?: string;
}) {
  await rejectHotAction();
  const parsed = parseEmployeeOnboard(input);
  if (!parsed.ok) throw new Error(parsed.error);

  let account = parsed.value.token
    ? await prisma.account.findUnique({
        where: { inviteToken: parsed.value.token },
        include: { employee: true },
      })
    : null;
  if (!account) {
    const session = await getLiveSession();
    if (session?.role === "CREW" && session.employeeId) {
      account = await prisma.account.findUnique({
        where: { employeeId: session.employeeId },
        include: { employee: true },
      });
    }
  }
  if (!account || account.role !== "CREW" || !account.employee) {
    throw new Error("Open your invite link to create this account.");
  }
  if (account.employee.onboardedAt) {
    throw new Error("This account is already set up. Unlock with your PIN.");
  }

  const taken = await prisma.account.findFirst({
    where: { username: parsed.value.username, NOT: { id: account.id } },
  });
  const typedPin = String(input.pin || "").replace(/\D/g, "");
  let newPinHash: string | null = null;
  if (typedPin || !pinIsSet(account.pinHash)) {
    const shopRow = await prisma.appSettings.findUnique({ where: { id: "default" } });
    const problem = pinProblem(typedPin, [account.employee.phone, shopRow?.companyPhone, shopRow?.ownerPhone]);
    if (problem) throw new Error(problem);
    newPinHash = hashPin(typedPin);
  }
  if (taken) throw new Error("That username is taken. Pick another.");

  const withhold = withholdFromElection({
    payMethod: parsed.value.payMethod,
    filingStatus: parsed.value.filingStatus,
    allowances: parsed.value.allowances,
  });
  const onboardedAt = new Date();

  await prisma.$transaction([
    prisma.employee.update({
      where: { id: account.employee.id },
      data: {
        payMethod: parsed.value.payMethod,
        filingStatus: parsed.value.filingStatus,
        allowances: parsed.value.allowances,
        federalWithholdPct: withhold.federalWithholdPct,
        stateWithholdPct: withhold.stateWithholdPct,
        onboardedAt,
      },
    }),
    prisma.account.update({
      where: { id: account.id },
      data: {
        username: parsed.value.username,
        passwordHash: hashPin(parsed.value.password),
        ...(newPinHash ? { pinHash: newPinHash } : {}),
      },
    }),
    prisma.auditLog.create({
      data: {
        employeeId: account.employee.id,
        actor: account.name,
        action: "Completed employee tax and pay setup",
        field: "withholdings",
        newValue: `${parsed.value.payMethod} ${parsed.value.filingStatus} ${parsed.value.allowances} fed ${withhold.federalWithholdPct} state ${withhold.stateWithholdPct}`,
      },
    }),
  ]);

  await writeSessionCookie(toSession(account));
  revalidatePath("/");
  if (parsed.value.token) revalidatePath(`/j/${parsed.value.token}`);
  return { ok: true as const };
}

// Signed-out public link: run in the shop that owns the link (multi-shop B2).
export async function recordEstimateView(token: string) {
  return inShopOfToken("estimate", token, () => recordEstimateViewInShop(token));
}

// Signed-out public link: run in the shop that owns the link (multi-shop B2).
export async function clientApproveEstimate(input: { token: string; signedName: string }) {
  return inShopOfToken("estimate", input?.token, () => clientApproveEstimateInShop(input));
}

// Signed-out public link: run in the shop that owns the link (multi-shop B2).
export async function clientRequestEstimateChanges(input: { token: string; note: string }) {
  return inShopOfToken("estimate", input?.token, () => clientRequestEstimateChangesInShop(input));
}

// Signed-out public link: run in the shop that owns the link (multi-shop B2).
export async function startInvoiceCardPayment(input: { token: string }) {
  return inShopOfToken("invoice", input?.token, () => startInvoiceCardPaymentInShop(input));
}

// Crew invite link: run in the shop that sent the invite (multi-shop B2).
export async function completeEmployeeOnboard(input: Parameters<typeof completeEmployeeOnboardInShop>[0]) {
  if (!input?.token) return completeEmployeeOnboardInShop(input);
  return inShopOfToken("invite", input.token, () => completeEmployeeOnboardInShop(input));
}

/**
 * Permanently delete a job and all its related records (Eric, 2026-10-03).
 * This cannot be undone — the UI must confirm first.
 */
export async function deleteJob(input: { jobId: string; actor: string }) {
  const { jobId } = input;
  if (!jobId) throw new Error("Missing job id.");
  // Delete related records first (no cascade in schema).
  await prisma.payAdjustment.deleteMany({ where: { jobId } }).catch(() => undefined);
  await prisma.crewPing.deleteMany({ where: { jobId } }).catch(() => undefined);
  await prisma.jobPhoto.deleteMany({ where: { jobId } }).catch(() => undefined);
  await prisma.timeEntry.deleteMany({ where: { jobId } }).catch(() => undefined);
  await prisma.invoice.deleteMany({ where: { jobId } }).catch(() => undefined);
  await prisma.estimate.deleteMany({ where: { jobId } }).catch(() => undefined);
  // JobCost has a 1-1 relation; delete if exists.
  await prisma.jobCost.deleteMany({ where: { jobId } }).catch(() => undefined);
  await prisma.job.delete({ where: { id: jobId } });
  revalidatePath("/");
  return { ok: true as const };
}

/**
 * Update the company logo (Eric, 2026-10-03). Used from Jobs page Edit mode
 * and signup. White-label: each business puts their own logo here.
 */
export async function updateCompanyLogo(input: { logoUrl: string }) {
  const { logoUrl } = input;
  if (!logoUrl) throw new Error("Missing logo URL.");
  try {
    await prisma.appSettings.updateMany({
      data: { logoUrl },
    });
  } catch {
    // Column may not exist yet — ensure it then retry.
    await prisma.$executeRaw`ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT`;
    await prisma.appSettings.updateMany({
      data: { logoUrl },
    });
  }
  revalidatePath("/");
  return { ok: true as const };
}
