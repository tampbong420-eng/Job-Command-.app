import { prisma } from "@/lib/prisma";
import { jobPayStatus } from "@/lib/job-pipeline";
import { roundMoney } from "@/lib/documents";
import { toDayString } from "@/lib/dates";
import { learnFromJobCost } from "@/lib/price-memory";
import { costForJob } from "@/lib/job-cost-core";
import type { EmployeeDTO, EstimateDTO, InvoiceDTO, JobCostDTO, JobDTO } from "@/lib/types";

export { attachJobCosts, costForJob, COST_OVER_RATIO } from "@/lib/job-cost-core";

function snapshotFields(cost: JobCostDTO) {
  return {
    laborHoursBudget: cost.laborHoursBudget,
    laborHoursActual: cost.laborHoursActual,
    laborCostBudget: cost.laborCostBudget,
    laborCostActual: cost.laborCostActual,
    materialBudget: cost.materialBudget,
    materialActual: cost.materialActual,
    otherBudget: cost.otherBudget,
    otherActual: cost.otherActual,
    revenue: cost.revenue,
    grossProfit: cost.grossProfit,
    laborMargin: cost.laborMargin,
    netMargin: cost.netMargin,
    overLabor: cost.overLabor,
    overMaterial: cost.overMaterial,
    computedAt: new Date(),
  };
}

export async function persistJobCost(jobId: string, now = new Date()) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      estimate: { include: { lines: true } },
      invoices: { include: { lines: true } },
      photos: true,
    },
  });
  if (!job) return null;

  const employees = await prisma.employee.findMany({
    include: {
      timeEntries: true,
      adjustments: true,
    },
  });

  const jobDto: JobDTO = {
    id: job.id,
    code: job.code,
    name: job.name,
    client: job.client,
    customerId: job.customerId ?? null,
    address: job.address,
    notes: job.notes,
    timeline: job.timeline,
    dueDate: job.dueDate ? toDayString(job.dueDate) : null,
    pipeline: job.pipeline,
    leadCalledAt: job.leadCalledAt?.toISOString() ?? null,
    photos: [],
  };

  const employeesDto = employees.map((employee) => ({
    id: employee.id,
    payType: employee.payType as EmployeeDTO["payType"],
    hourlyRate: employee.hourlyRate,
    salaryAnnual: employee.salaryAnnual,
    timeEntries: employee.timeEntries.map((entry) => ({
      date: toDayString(entry.date),
      actualHours: entry.actualHours,
      clockIn: entry.clockIn?.toISOString() ?? null,
      clockOut: entry.clockOut?.toISOString() ?? null,
      jobId: entry.jobId,
    })),
    adjustments: employee.adjustments.map((item) => ({
      jobId: item.jobId,
      type: item.type,
      category: item.category,
      amount: item.amount,
    })),
  })) as unknown as EmployeeDTO[];

  const estimate: EstimateDTO | null = job.estimate
    ? {
        id: job.estimate.id,
        number: job.estimate.number,
        jobId: job.estimate.jobId,
        customerId: job.estimate.customerId,
        status: (job.estimate.status as EstimateDTO["status"]) || "DRAFT",
        notes: job.estimate.notes,
        terms: job.estimate.terms,
        taxRate: job.estimate.taxRate,
        publicToken: job.estimate.publicToken,
        sentAt: job.estimate.sentAt?.toISOString() ?? null,
        viewedAt: job.estimate.viewedAt?.toISOString() ?? null,
        acceptedAt: job.estimate.acceptedAt?.toISOString() ?? null,
        changesAt: job.estimate.changesAt?.toISOString() ?? null,
        signedName: job.estimate.signedName,
        clientNote: job.estimate.clientNote,
        sentEmail: job.estimate.sentEmail,
        sentSms: job.estimate.sentSms,
        lastFollowUpAt: job.estimate.lastFollowUpAt?.toISOString() ?? null,
        followUpCount: job.estimate.followUpCount,
        createdAt: job.estimate.createdAt.toISOString(),
        deliveries: [],
        lines: job.estimate.lines.map((line) => ({
          id: line.id,
          kind: line.kind === "LABOR" || line.kind === "MATERIAL" ? line.kind : "OTHER",
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          rate: line.rate,
          amount: roundMoney(line.quantity * line.rate),
        })),
      }
    : null;

  const invoices: InvoiceDTO[] = job.invoices.map((invoice) => ({
    id: invoice.id,
    number: invoice.number,
    customerId: invoice.customerId,
    jobId: invoice.jobId,
    amount: invoice.amount,
    status: invoice.status === "PAID" || invoice.status === "DRAFT" ? invoice.status : "PENDING",
    dueDate: toDayString(invoice.dueDate),
    notes: invoice.notes,
    terms: invoice.terms,
    taxRate: invoice.taxRate,
    sentAt: invoice.sentAt?.toISOString() ?? null,
    customerName: "",
    jobName: job.name,
    lines: invoice.lines.map((line) => ({
      id: line.id,
      kind: line.kind === "LABOR" || line.kind === "MATERIAL" ? line.kind : "OTHER",
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      rate: line.rate,
      amount: roundMoney(line.quantity * line.rate),
    })),
  }));

  const cost = costForJob({ job: jobDto, employees: employeesDto, estimate, invoices, now });
  const existing = await prisma.jobCost.findUnique({ where: { jobId } });
  await prisma.jobCost.upsert({
    where: { jobId },
    create: { jobId, ...snapshotFields(cost), learned: false },
    update: snapshotFields(cost),
  });

  // Learn only once the whole job is paid, not when a deposit or one of two invoices clears.
  const paid = jobPayStatus(invoices, jobId).state === "paid";
  const complete = job.pipeline >= 5 || paid;
  if (complete && !existing?.learned) {
    await learnFromJobCost(cost);
    await prisma.jobCost.update({ where: { jobId }, data: { learned: true } });
  }
  return cost;
}

export async function refreshJobCost(jobId?: string | null) {
  if (!jobId) return;
  try {
    await persistJobCost(jobId);
  } catch (error) {
    console.error("job cost snapshot failed", error);
  }
}

export async function runJobCostSync(now = new Date()) {
  const jobs = await prisma.job.findMany({ select: { id: true } });
  let saved = 0;
  for (const job of jobs) {
    const cost = await persistJobCost(job.id, now);
    if (cost) saved += 1;
  }
  return { saved };
}
