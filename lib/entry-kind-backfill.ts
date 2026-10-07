/**
 * One-off, idempotent backfill for TimeEntry.kind (added 2026-10-02 with the unified Schedule).
 * Only rows still untagged (kind = "") are touched, so running it twice changes nothing.
 * A row on a job whose card is lit on stage 2 (Schedule / Estimate) becomes ESTIMATE; every other
 * row becomes JOB. Used by prisma/seed.ts and scripts/backfill-entry-kind.ts.
 */
import type { PrismaClient } from "@prisma/client";
import { toDayString } from "./dates";
import { kindFromStage } from "./schedule-day";
import { jobStageMap } from "./schedule-stage";
import type { CustomerDTO, EmployeeDTO, EstimateDTO, InvoiceDTO, JobDTO } from "./types";

const iso = (value: Date | null | undefined) => (value ? value.toISOString() : null);

export async function backfillEntryKinds(prisma: PrismaClient, now = new Date()) {
  const untagged = await prisma.timeEntry.findMany({
    where: { kind: "" },
    select: { id: true, jobId: true },
  });
  if (!untagged.length) return { tagged: 0, estimate: 0, job: 0 };

  const [jobs, customers, estimates, invoices, employees] = await Promise.all([
    prisma.job.findMany(),
    prisma.customer.findMany(),
    prisma.estimate.findMany({ include: { lines: true } }),
    prisma.invoice.findMany(),
    prisma.employee.findMany({ include: { timeEntries: true } }),
  ]);

  // Only the fields readPipeFacts looks at; the casts keep this script free of the server-only loaders.
  const stages = jobStageMap({
    now,
    jobs: jobs.map((job) => ({ ...job, dueDate: iso(job.dueDate), leadCalledAt: iso(job.leadCalledAt) })) as unknown as JobDTO[],
    customers: customers as unknown as CustomerDTO[],
    estimates: estimates.map((estimate) => ({
      ...estimate,
      sentAt: iso(estimate.sentAt),
      viewedAt: iso(estimate.viewedAt),
      acceptedAt: iso(estimate.acceptedAt),
    })) as unknown as EstimateDTO[],
    invoices: invoices.map((invoice) => ({ ...invoice, sentAt: iso(invoice.sentAt) })) as unknown as InvoiceDTO[],
    employees: employees.map((employee) => ({
      ...employee,
      timeEntries: employee.timeEntries.map((entry) => ({
        ...entry,
        date: toDayString(entry.date),
        clockIn: iso(entry.clockIn),
        clockOut: iso(entry.clockOut),
      })),
    })) as unknown as EmployeeDTO[],
  });

  const estimateIds: string[] = [];
  const jobIds: string[] = [];
  for (const row of untagged) {
    const kind = kindFromStage(row.jobId ? stages.get(row.jobId) : undefined);
    (kind === "ESTIMATE" ? estimateIds : jobIds).push(row.id);
  }
  for (let index = 0; index < estimateIds.length; index += 400) {
    await prisma.timeEntry.updateMany({
      where: { id: { in: estimateIds.slice(index, index + 400) }, kind: "" },
      data: { kind: "ESTIMATE" },
    });
  }
  for (let index = 0; index < jobIds.length; index += 400) {
    await prisma.timeEntry.updateMany({
      where: { id: { in: jobIds.slice(index, index + 400) }, kind: "" },
      data: { kind: "JOB" },
    });
  }
  return { tagged: untagged.length, estimate: estimateIds.length, job: jobIds.length };
}
