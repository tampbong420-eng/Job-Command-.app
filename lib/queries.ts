import { prisma } from "@/lib/prisma";
import { bankForScreen } from "@/lib/bank-fields";
import { toBillingDTO } from "@/lib/billing";
import { ensureBilling } from "@/lib/billing-store";
import { mostRecentWeekday, toDayString } from "@/lib/dates";
import { deliveryDTO } from "@/lib/delivery-log";
import { parseEstimateStatus } from "@/lib/estimate-status";
import { inferShift } from "@/lib/schedule";
import { parseEntryKind } from "@/lib/schedule-day";
import { attachJobCosts } from "@/lib/job-cost-core";
import { crewSafePrep } from "@/lib/active-board";
import { DEFAULT_SHELL_THEME, parseShellTheme } from "@/lib/shell-theme";
import { parseEmploymentStatus } from "@/lib/employment";
import { displayJobCode } from "@/lib/shop-brand";
import { stripeConfigured } from "@/lib/stripe-rest";
import type {
  AdjustmentDTO,
  AuditLogDTO,
  CustomerDTO,
  DocLineDTO,
  EmployeeDTO,
  EstimateDTO,
  InvoiceDTO,
  JobDTO,
  PayPeriodDTO,
  PayrollSettingsDTO,
  ServiceCodeDTO,
  SessionDTO,
  TimeEntryDTO,
  WorkspacePayload,
} from "@/lib/types";
import type {
  AuditLog,
  Customer,
  DeliveryEvent,
  DocLine,
  Employee,
  Estimate,
  Invoice,
  Job,
  JobPhoto,
  PayAdjustment,
  PayPeriod,
  ServiceCode,
  TimeEntry,
} from "@prisma/client";
import { shopProfileFromRow } from "@/lib/signup-shop";

type EmployeeRecord = Employee & {
  timeEntries: (TimeEntry & {
    job: (Job & { photos?: JobPhoto[] }) | null;
    serviceCode: ServiceCode | null;
  })[];
  payPeriods: (PayPeriod & { adjustments: PayAdjustment[] })[];
  adjustments: PayAdjustment[];
  auditLogs: AuditLog[];
};

function jobDTO(job: Job & { photos?: JobPhoto[] }, shopName?: string | null): JobDTO {
  return {
    id: job.id,
    code: displayJobCode(job.code, shopName),
    name: job.name,
    client: job.client,
    customerId: job.customerId ?? null,
    address: job.address,
    notes: job.notes ?? "",
    timeline: job.timeline ?? "",
    dueDate: job.dueDate ? toDayString(job.dueDate) : null,
    pipeline: job.pipeline ?? 0,
    leadCalledAt: job.leadCalledAt?.toISOString() ?? null,
    prepChecklist: job.prepChecklist || "{}",
    photos: (job.photos || []).map((photo) => ({
      id: photo.id,
      url: photo.url,
      caption: photo.caption,
      createdAt: photo.createdAt.toISOString(),
    })),
  };
}

function customerDTO(customer: Customer): CustomerDTO {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    address: customer.address,
  };
}

function lineDTO(line: DocLine): DocLineDTO {
  return {
    id: line.id,
    kind: line.kind === "LABOR" || line.kind === "MATERIAL" ? line.kind : "OTHER",
    description: line.description,
    quantity: line.quantity,
    unit: line.unit,
    rate: line.rate,
    amount: Math.round(line.quantity * line.rate * 100) / 100,
    tier: (line as { tier?: string }).tier || "",
  };
}

function invoiceDTO(
  invoice: Invoice & { customer: Customer; job: Job | null; lines: DocLine[] }
): InvoiceDTO {
  return {
    id: invoice.id,
    number: invoice.number,
    customerId: invoice.customerId,
    jobId: invoice.jobId,
    amount: invoice.amount,
    status:
      invoice.status === "PAID" || invoice.status === "DRAFT" ? invoice.status : "PENDING",
    dueDate: toDayString(invoice.dueDate),
    notes: invoice.notes,
    terms: invoice.terms,
    taxRate: invoice.taxRate,
    sentAt: invoice.sentAt?.toISOString() ?? null,
    paidAt: invoice.paidAt?.toISOString() ?? null,
    publicToken: invoice.publicToken ?? null,
    payUrl: invoice.payUrl || "",
    applicationFee: invoice.applicationFee || 0,
    customerName: invoice.customer.name,
    jobName: invoice.job?.name ?? null,
    lines: [...invoice.lines]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(lineDTO),
  };
}

function estimateDTO(
  estimate: Estimate & { lines: DocLine[]; deliveries?: DeliveryEvent[] }
): EstimateDTO {
  return {
    id: estimate.id,
    number: estimate.number,
    jobId: estimate.jobId,
    customerId: estimate.customerId,
    status: parseEstimateStatus(estimate.status),
    notes: estimate.notes,
    terms: estimate.terms,
    taxRate: estimate.taxRate,
    publicToken: estimate.publicToken,
    sentAt: estimate.sentAt?.toISOString() ?? null,
    viewedAt: estimate.viewedAt?.toISOString() ?? null,
    acceptedAt: estimate.acceptedAt?.toISOString() ?? null,
    changesAt: estimate.changesAt?.toISOString() ?? null,
    signedName: estimate.signedName,
    clientNote: estimate.clientNote,
    sentEmail: estimate.sentEmail,
    sentSms: estimate.sentSms,
    lastFollowUpAt: estimate.lastFollowUpAt?.toISOString() ?? null,
    followUpCount: estimate.followUpCount,
    createdAt: estimate.createdAt?.toISOString() ?? null,
    lines: [...estimate.lines]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(lineDTO),
    deliveries: [...(estimate.deliveries || [])]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(deliveryDTO),
  };
}

function serviceDTO(code: ServiceCode): ServiceCodeDTO {
  return {
    id: code.id,
    code: code.code,
    name: code.name,
    className: code.className,
  };
}

function entryDTO(
  entry: TimeEntry & {
    job: (Job & { photos?: JobPhoto[] }) | null;
    serviceCode: ServiceCode | null;
  },
  shopName?: string | null
): TimeEntryDTO {
  const shift = inferShift(
    entry.scheduledHours,
    entry.scheduledStart,
    entry.scheduledEnd
  );
  return {
    id: entry.id,
    date: toDayString(entry.date),
    scheduledHours: entry.scheduledHours,
    actualHours: entry.actualHours,
    clockIn: entry.clockIn?.toISOString() ?? null,
    clockOut: entry.clockOut?.toISOString() ?? null,
    scheduledStart: shift.start,
    scheduledEnd: shift.end,
    status: entry.status as TimeEntryDTO["status"],
    jobId: entry.jobId,
    serviceCodeId: entry.serviceCodeId,
    notes: entry.notes,
    kind: parseEntryKind((entry as { kind?: unknown }).kind),
    job: entry.job ? jobDTO(entry.job, shopName) : null,
    serviceCode: entry.serviceCode ? serviceDTO(entry.serviceCode) : null,
  };
}

function adjustmentDTO(item: PayAdjustment): AdjustmentDTO {
  return {
    id: item.id,
    payPeriodId: item.payPeriodId,
    jobId: item.jobId,
    type: item.type as AdjustmentDTO["type"],
    category: item.category as AdjustmentDTO["category"],
    description: item.description,
    amount: item.amount,
  };
}

function periodDTO(
  period: PayPeriod & { adjustments: PayAdjustment[] }
): PayPeriodDTO {
  return {
    id: period.id,
    startDate: toDayString(period.startDate),
    endDate: toDayString(period.endDate),
    frequency: period.frequency as PayPeriodDTO["frequency"],
    regularHours: period.regularHours,
    overtimeHours: period.overtimeHours,
    regularPay: period.regularPay,
    overtimePay: period.overtimePay,
    grossPay: period.grossPay,
    deductions: period.deductions,
    reimbursements: period.reimbursements,
    federalTax: period.federalTax,
    stateTax: period.stateTax,
    netPay: period.netPay,
    status: period.status as PayPeriodDTO["status"],
    approvedBy: period.approvedBy,
    approvedAt: period.approvedAt?.toISOString() ?? null,
    paidAt: period.paidAt?.toISOString() ?? null,
    adjustments: period.adjustments.map(adjustmentDTO),
  };
}

function auditDTO(log: AuditLog): AuditLogDTO {
  return {
    id: log.id,
    actor: log.actor,
    action: log.action,
    field: log.field,
    oldValue: log.oldValue,
    newValue: log.newValue,
    createdAt: log.createdAt.toISOString(),
  };
}

export function employeeDTO(employee: EmployeeRecord, shopName?: string | null): EmployeeDTO {
  return {
    id: employee.id,
    firstName: employee.firstName,
    lastName: employee.lastName,
    jobTitle: employee.jobTitle,
    photoUrl: employee.photoUrl,
    email: employee.email,
    phone: employee.phone,
    payType: employee.payType as EmployeeDTO["payType"],
    hourlyRate: employee.hourlyRate,
    salaryAnnual: employee.salaryAnnual,
    baselineStartDate: toDayString(employee.baselineStartDate),
    payFrequency: employee.payFrequency as EmployeeDTO["payFrequency"],
    federalWithholdPct: employee.federalWithholdPct,
    stateWithholdPct: employee.stateWithholdPct,
    payMethod: employee.payMethod === "CASH" ? "CASH" : employee.payMethod === "W2" ? "W2" : "",
    filingStatus: employee.filingStatus || "",
    allowances: employee.allowances || 0,
    onboardedAt: employee.onboardedAt ? employee.onboardedAt.toISOString() : null,
    employmentStatus: parseEmploymentStatus(employee.employmentStatus),
    employmentEndDate: employee.employmentEndDate ? toDayString(employee.employmentEndDate) : null,
    // Go-public B5: the phone only ever gets the last 4 (numbers are encrypted at rest).
    ...bankForScreen(employee),
    depositAccountType: employee.depositAccountType === "SAVINGS" ? "SAVINGS" : employee.depositAccountType === "CHECKING" ? "CHECKING" : "",
    ytdGross: employee.ytdGross,
    ytdFederalTax: employee.ytdFederalTax,
    ytdStateTax: employee.ytdStateTax,
    ytdNet: employee.ytdNet,
    ytdOvertime: employee.ytdOvertime,
    timeEntries: employee.timeEntries.map((entry) => entryDTO(entry, shopName)),
    payPeriods: employee.payPeriods.map(periodDTO),
    adjustments: employee.adjustments.map(adjustmentDTO),
    auditLogs: employee.auditLogs.map(auditDTO),
  };
}

const employeeInclude = {
  timeEntries: {
    include: { job: { include: { photos: { orderBy: { createdAt: "desc" as const } } } }, serviceCode: true },
    orderBy: { date: "asc" as const },
  },
  payPeriods: {
    include: { adjustments: true },
    orderBy: { startDate: "desc" as const },
  },
  adjustments: { orderBy: { createdAt: "desc" as const } },
  auditLogs: { orderBy: { createdAt: "desc" as const }, take: 40 },
};

export async function loadPayrollSettings(): Promise<PayrollSettingsDTO> {
  await prisma.appSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      payFrequency: "WEEKLY",
      periodAnchor: new Date(`${mostRecentWeekday(1)}T00:00:00.000Z`),
      setupComplete: false,
      shellTheme: DEFAULT_SHELL_THEME,
    },
    update: {},
  });
  const row = (await ensureBilling()) || (await prisma.appSettings.findUniqueOrThrow({
    where: { id: "default" },
    // logoUrl column may not exist in prod yet (added 2026-10-03) — omit it here,
    // fetched defensively below via raw SQL.
    omit: { logoUrl: true },
  }));
  // logoUrl column may not exist yet in production (added 2026-10-03) — fetch defensively.
  let logoUrl: string | null = null;
  try {
    const withLogo = await prisma.$queryRaw<{ logoUrl: string | null }[]>`
      SELECT "logoUrl" FROM "AppSettings" WHERE id = 'default' LIMIT 1
    `;
    logoUrl = withLogo[0]?.logoUrl || null;
  } catch {
    // Column doesn't exist yet — logo upload will work after migration.
    logoUrl = null;
  }
  // A shop saved on a removed look (Standard Dark, Color, Harbor, Steel, Grove, Dusk) moves to Dark (Lime Industrial) for good.
  if (row.shellTheme !== parseShellTheme(row.shellTheme)) {
    await prisma.appSettings
      .update({ where: { id: "default" }, data: { shellTheme: parseShellTheme(row.shellTheme) } })
      .catch(() => undefined);
  }
  return {
    payFrequency:
      row.payFrequency === "BIWEEKLY" ? "BIWEEKLY" : "WEEKLY",
    periodAnchor: toDayString(row.periodAnchor),
    setupComplete: row.setupComplete && Boolean(row.businessName),
    ownerFirstName: row.ownerFirstName,
    ownerLastName: row.ownerLastName,
    ownerEmail: row.ownerEmail,
    ownerPhone: row.ownerPhone,
    businessName: row.businessName,
    businessAddress: row.businessAddress,
    businessEmail: row.businessEmail,
    industry: row.industry,
    businessSize: row.businessSize,
    accountingSoftware:
      row.accountingSoftware === "QUICKBOOKS" ||
      row.accountingSoftware === "XERO" ||
      row.accountingSoftware === "OTHER"
        ? row.accountingSoftware
        : "NONE",
    companyPhone: row.companyPhone,
    answeringLine: row.answeringLine,
    logoUrl: logoUrl,
    acceptCard: row.acceptCard !== false,
    acceptAch: Boolean(row.acceptAch),
    acceptCash: row.acceptCash !== false,
    depositPercent: row.depositPercent || 0,
    billing: toBillingDTO(row, new Date(), stripeConfigured()),
    termsAcceptedAt: row.termsAcceptedAt ? row.termsAcceptedAt.toISOString() : null,
    termsVersion: row.termsVersion || "",
    estimatePrompt: row.estimatePrompt || "",
    shellTheme: parseShellTheme(row.shellTheme),
    shellInk: row.shellInk || "",
    shop: shopProfileFromRow(row),
    bosses: (await prisma.boss.findMany({ orderBy: { createdAt: "asc" } })).map(
      (boss) => ({
        id: boss.id,
        firstName: boss.firstName,
        lastName: boss.lastName,
        phone: boss.phone,
        email: boss.email,
        isOwner: boss.isOwner,
      })
    ),
  };
}

export function fieldEmployeeDTO(employee: EmployeeDTO): EmployeeDTO {
  return {
    ...employee,
    depositRoutingLast4: "",
    depositAccountLast4: "",
    payType: "HOURLY",
    hourlyRate: 0,
    salaryAnnual: 0,
    federalWithholdPct: 0,
    stateWithholdPct: 0,
    payMethod: "",
    filingStatus: "",
    allowances: 0,
    ytdGross: 0,
    ytdFederalTax: 0,
    ytdStateTax: 0,
    ytdNet: 0,
    ytdOvertime: 0,
    payPeriods: [],
    adjustments: [],
    auditLogs: [],
  };
}

export async function loadWorkspace(session?: SessionDTO | null): Promise<WorkspacePayload> {
  const [employees, jobs, customers, invoices, estimates, serviceCodes, settings] = await Promise.all([
    prisma.employee.findMany({
      include: employeeInclude,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.job.findMany({
      include: { photos: { orderBy: { createdAt: "desc" } } },
      orderBy: { code: "asc" },
    }),
    prisma.customer.findMany({ orderBy: { name: "asc" } }),
    prisma.invoice.findMany({
      include: { customer: true, job: true, lines: true },
      orderBy: { dueDate: "asc" },
    }),
    prisma.estimate.findMany({
      include: {
        lines: true,
        deliveries: { orderBy: { createdAt: "desc" }, take: 24 },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.serviceCode.findMany({ orderBy: { code: "asc" } }),
    loadPayrollSettings(),
  ]);

  let payload: WorkspacePayload = {
    employees: employees.map((employee) => employeeDTO(employee, settings.businessName)),
    jobs: jobs.map((job) => jobDTO(job, settings.businessName)),
    customers: customers.map(customerDTO),
    invoices: invoices.map(invoiceDTO),
    estimates: estimates.map(estimateDTO),
    serviceCodes: serviceCodes.map(serviceDTO),
    settings,
    session: session ?? null,
  };
  payload = {
    ...payload,
    jobs: attachJobCosts({
      jobs: payload.jobs,
      employees: payload.employees,
      estimates: payload.estimates,
      invoices: payload.invoices,
    }),
  };

  if (session?.role === "CREW" && session.employeeId) {
    const self = payload.employees.find((row) => row.id === session.employeeId);
    const jobIds = new Set(
      (self?.timeEntries || []).map((entry) => entry.jobId).filter((id): id is string => Boolean(id))
    );
    const fieldJobs = payload.jobs.filter((job) => jobIds.has(job.id)).map((job) => ({ ...job, cost: undefined, prepChecklist: crewSafePrep(job.prepChecklist) || "{}" }));
    const fieldEstimates = payload.estimates.filter((estimate) => jobIds.has(estimate.jobId));
    payload = {
      ...payload,
      employees: self ? [fieldEmployeeDTO(self)] : [],
      jobs: fieldJobs,
      invoices: [],
      estimates: fieldEstimates,
      customers: payload.customers.filter(
        (customer) =>
          fieldEstimates.some((estimate) => estimate.customerId === customer.id) ||
          fieldJobs.some((job) => job.customerId === customer.id || job.client === customer.name)
      ),
      settings: {
        ...payload.settings,
        ownerEmail: "",
        accountingSoftware: "NONE",
        answeringLine: "",
        billing: {
          ...payload.settings.billing,
          cardBrand: "",
          cardLast4: "",
          connectAccountId: "",
          connectBankLast4: "",
        },
        bosses: payload.settings.bosses.map((boss) => ({ ...boss, email: null })),
      },
    };
  }

  return payload;
}

export async function loadEmployee(id: string): Promise<EmployeeDTO | null> {
  const employee = await prisma.employee.findUnique({
    where: { id },
    include: employeeInclude,
  });
  return employee ? employeeDTO(employee) : null;
}
