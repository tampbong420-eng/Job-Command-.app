import { addDays, differenceInCalendarDays } from "date-fns";
import { lineAmount, type DocLineDraft } from "@/lib/documents";
import {
  employmentStatusLabel,
  parseEmploymentStatus,
  type EmploymentStatus,
} from "@/lib/employment";
import { isMockSeedId } from "@/lib/initial-data";
import { getPeriodContaining, toDayString, todayString, utcDay } from "@/lib/dates";
import {
  computePay,
  liveActualHours,
  roundHours,
  roundMoney,
} from "@/lib/payroll";
import type {
  AdjustmentDTO,
  EmployeeDTO,
  EstimateDTO,
  InvoiceDTO,
  JobDTO,
  PayFrequency,
  PayType,
} from "@/lib/types";

export type ContractorTaxBasis = {
  labor: number;
  materials: number;
  other: number;
  materialTax: number;
  laborTax: 0;
  taxableBasis: number;
  nontaxable: number;
};

export type MaterialItem = {
  source: "invoice" | "reimbursement";
  jobId: string | null;
  jobCode: string;
  jobName: string;
  document: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  taxRate: number;
  accruedTax: number;
};

export type TaxRecord = {
  invoiceNumber: string;
  jobName: string;
  status: InvoiceDTO["status"];
  taxRate: number;
  materials: number;
  laborNontaxable: number;
  otherNontaxable: number;
  accruedMaterialTax: number;
  lumpSum: boolean;
};

export type JobLedgerRow = {
  jobId: string;
  code: string;
  name: string;
  client: string;
  grossCollected: number;
  billedAccrual: number;
  laborBilled: number;
  materialBilled: number;
  materialReimbursed: number;
  materialCost: number;
  accruedMaterialTax: number;
  lumpSumInvoices: number;
};

export type EmployeePayrollRow = {
  employeeId: string;
  name: string;
  title: string;
  status: EmploymentStatus;
  statusLabel: string;
  hireDate: string;
  endDate: string | null;
  payType: PayType;
  hourlyRate: number;
  regularHours: number;
  overtimeHours: number;
  actualHours: number;
  regularPay: number;
  overtimePay: number;
  reimbursements: number;
  grossPay: number;
  deductions: number;
  federalTax: number;
  stateTax: number;
  netPay: number;
};

export type YearEndBooks = {
  year: number;
  companyName: string;
  generatedAt: string;
  throughDate: string;
  revenue: {
    grossCollected: number;
    billedAccrual: number;
    laborBilled: number;
    materialBilled: number;
    otherBilled: number;
  };
  materials: {
    billed: number;
    reimbursed: number;
    totalCost: number;
    lines: MaterialItem[];
  };
  labor: {
    billedNontaxable: number;
    isolated: true;
  };
  tax: {
    materialTaxAccrued: number;
    laborTaxAccrued: 0;
    note: string;
    records: TaxRecord[];
  };
  payroll: {
    regularHours: number;
    overtimeHours: number;
    actualHours: number;
    grossWages: number;
    federalWithheld: number;
    stateWithheld: number;
    reimbursements: number;
    net: number;
    employees: EmployeePayrollRow[];
  };
  jobs: JobLedgerRow[];
};

const TAX_NOTE =
  "Standard contractor books: sales-tax basis is billed materials only. Labor and other charges are isolated and nontaxable in this ledger.";

export function calendarYearRange(year: number) {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

export function yearOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const y = Number(String(iso).slice(0, 4));
  return Number.isFinite(y) && y >= 1900 && y <= 9999 ? y : null;
}

export function parseExportYear(raw: string | null | undefined, now = new Date()) {
  const fallback = now.getUTCFullYear();
  const y = Number(String(raw || "").trim());
  if (!Number.isInteger(y) || y < 2000 || y > 2100) return fallback;
  return y;
}

export function listExportYears(now = new Date()) {
  const current = now.getUTCFullYear();
  return [0, 1, 2, 3, 4, 5].map((offset) => current - offset);
}

export function contractorTaxBasis(
  lines: DocLineDraft[],
  taxRatePct = 0
): ContractorTaxBasis {
  const labor = roundMoney(
    lines.filter((line) => line.kind === "LABOR").reduce((sum, line) => sum + lineAmount(line), 0)
  );
  const materials = roundMoney(
    lines
      .filter((line) => line.kind === "MATERIAL")
      .reduce((sum, line) => sum + lineAmount(line), 0)
  );
  const other = roundMoney(
    lines
      .filter((line) => line.kind !== "LABOR" && line.kind !== "MATERIAL")
      .reduce((sum, line) => sum + lineAmount(line), 0)
  );
  const materialTax = roundMoney(materials * ((Number(taxRatePct) || 0) / 100));
  return {
    labor,
    materials,
    other,
    materialTax,
    laborTax: 0,
    taxableBasis: materials,
    nontaxable: roundMoney(labor + other),
  };
}

function minIso(values: string[]) {
  return values.reduce((a, b) => (a < b ? a : b));
}

function maxIso(values: string[]) {
  return values.reduce((a, b) => (a > b ? a : b));
}

function liveJob(id: string | null | undefined) {
  return Boolean(id) && !isMockSeedId(id);
}

function invoiceCashYear(invoice: InvoiceDTO) {
  if (invoice.status !== "PAID") return null;
  return yearOf(invoice.paidAt) ?? yearOf(invoice.dueDate);
}

function invoiceAccrualYear(invoice: InvoiceDTO) {
  if (invoice.status === "DRAFT") return null;
  return yearOf(invoice.sentAt) ?? yearOf(invoice.dueDate);
}

/** W-2 box 1 wages: regular + OT only. Material reimbursements stay off this total. */
export function box1GrossWages(regularPay: number, overtimePay: number) {
  return roundMoney((Number(regularPay) || 0) + (Number(overtimePay) || 0));
}

function jobMeta(jobs: JobDTO[], jobId: string | null) {
  const job = jobs.find((row) => row.id === jobId);
  return {
    jobId,
    jobCode: job?.code || "",
    jobName: job?.name || "Unassigned",
    client: job?.client || "",
  };
}

function emptyJobRow(job: Pick<JobDTO, "id" | "code" | "name" | "client">): JobLedgerRow {
  return {
    jobId: job.id,
    code: job.code,
    name: job.name,
    client: job.client,
    grossCollected: 0,
    billedAccrual: 0,
    laborBilled: 0,
    materialBilled: 0,
    materialReimbursed: 0,
    materialCost: 0,
    accruedMaterialTax: 0,
    lumpSumInvoices: 0,
  };
}

function emptyPayrollRow(employee: EmployeeDTO): EmployeePayrollRow {
  return {
    employeeId: employee.id,
    name: `${employee.firstName} ${employee.lastName}`.trim(),
    title: employee.jobTitle,
    status: parseEmploymentStatus(employee.employmentStatus),
    statusLabel: employmentStatusLabel(employee.employmentStatus),
    hireDate: employee.baselineStartDate || "",
    endDate: employee.employmentEndDate || null,
    payType: employee.payType,
    hourlyRate: employee.hourlyRate,
    regularHours: 0,
    overtimeHours: 0,
    actualHours: 0,
    regularPay: 0,
    overtimePay: 0,
    reimbursements: 0,
    grossPay: 0,
    deductions: 0,
    federalTax: 0,
    stateTax: 0,
    netPay: 0,
  };
}

function yearOverlapFraction(input: {
  spanStart: string;
  spanEnd: string;
  yearStart: string;
  yearEnd: string;
  hoursInYear: number;
  hoursInPeriod: number;
}) {
  const crossesYear = input.spanStart < input.yearStart || input.spanEnd > input.yearEnd;
  if (!crossesYear) return 1;
  if (input.hoursInPeriod > 0) {
    return Math.min(1, Math.max(0, input.hoursInYear / input.hoursInPeriod));
  }
  const overlapStart = maxIso([input.spanStart, input.yearStart]);
  const overlapEnd = minIso([input.spanEnd, input.yearEnd]);
  if (overlapStart > overlapEnd) return 0;
  const periodDays =
    differenceInCalendarDays(utcDay(input.spanEnd), utcDay(input.spanStart)) + 1;
  const overlapDays =
    differenceInCalendarDays(utcDay(overlapEnd), utcDay(overlapStart)) + 1;
  if (periodDays <= 0) return 0;
  return Math.min(1, Math.max(0, overlapDays / periodDays));
}

function adjustmentsForPeriod(employee: EmployeeDTO, startDate: string): AdjustmentDTO[] {
  const stored = employee.payPeriods.find((period) => period.startDate === startDate);
  if (stored) return stored.adjustments;
  return employee.adjustments.filter((item) => {
    const period = employee.payPeriods.find((row) => row.id === item.payPeriodId);
    return period?.startDate === startDate;
  });
}

export function payrollForEmployeeYear(
  employee: EmployeeDTO,
  year: number,
  now = new Date()
): EmployeePayrollRow | null {
  if (isMockSeedId(employee.id)) return null;

  const { start: yearStart, end: yearEnd } = calendarYearRange(year);
  const today = todayString(now);
  const hired = (employee.baselineStartDate || "").slice(0, 10) || yearStart;
  const ended = (employee.employmentEndDate || "").slice(0, 10) || yearEnd;
  if (hired > yearEnd) return null;
  if (ended < yearStart) return null;

  const firstWork = maxIso([yearStart, hired]);
  const lastWork = minIso([yearEnd, ended, today]);
  const row = emptyPayrollRow(employee);
  if (firstWork > lastWork) return row;

  const baseline = hired;
  let cursor = firstWork;
  const frequency = (employee.payFrequency || "WEEKLY") as PayFrequency;
  let guard = 0;

  while (cursor <= lastWork && guard < 80) {
    guard += 1;
    const span = getPeriodContaining(cursor, baseline, frequency);
    const spanStart = toDayString(span.start);
    const spanEnd = toDayString(span.end);
    if (spanStart > yearEnd) break;

    const overlapStart = maxIso([spanStart, yearStart, firstWork]);
    const overlapEnd = minIso([spanEnd, yearEnd, lastWork]);
    if (overlapStart > overlapEnd) {
      cursor = toDayString(addDays(utcDay(spanEnd), 1));
      if (cursor <= spanStart) break;
      continue;
    }

    const periodAdjustments = adjustmentsForPeriod(employee, spanStart);
    const days = employee.timeEntries
      .filter((entry) => entry.date >= spanStart && entry.date <= spanEnd)
      .map((entry) => ({
        date: entry.date,
        scheduledHours: entry.scheduledHours,
        actualHours: liveActualHours(entry, now),
        clockIn: entry.clockIn,
        clockOut: entry.clockOut,
      }));
    const computed = computePay({
      payType: employee.payType,
      hourlyRate: employee.hourlyRate,
      salaryAnnual: employee.salaryAnnual,
      frequency,
      federalWithholdPct: employee.federalWithholdPct,
      stateWithholdPct: employee.stateWithholdPct,
      baselineStartDate: baseline,
      periodStart: spanStart,
      periodEnd: spanEnd,
      days,
      adjustments: periodAdjustments.map((item) => ({
        type: item.type,
        amount: item.amount,
      })),
      now,
    });

    const hoursInPeriod = roundHours(days.reduce((sum, day) => sum + day.actualHours, 0));
    const hoursInYear = roundHours(
      days
        .filter((day) => day.date >= overlapStart && day.date <= overlapEnd)
        .reduce((sum, day) => sum + day.actualHours, 0)
    );
    const fraction = yearOverlapFraction({
      spanStart,
      spanEnd,
      yearStart,
      yearEnd,
      hoursInYear,
      hoursInPeriod,
    });
    const adjustmentsInYear = yearOf(spanStart) === year;

    row.regularHours = roundHours(row.regularHours + computed.regularHours * fraction);
    row.overtimeHours = roundHours(row.overtimeHours + computed.overtimeHours * fraction);
    row.actualHours = roundHours(row.actualHours + computed.actualHours * fraction);
    row.regularPay = roundMoney(row.regularPay + computed.regularPay * fraction);
    row.overtimePay = roundMoney(row.overtimePay + computed.overtimePay * fraction);
    row.federalTax = roundMoney(row.federalTax + computed.federalTax * fraction);
    row.stateTax = roundMoney(row.stateTax + computed.stateTax * fraction);
    row.grossPay = roundMoney(
      row.grossPay + box1GrossWages(computed.regularPay, computed.overtimePay) * fraction
    );
    if (adjustmentsInYear) {
      row.reimbursements = roundMoney(row.reimbursements + computed.reimbursements);
      row.deductions = roundMoney(row.deductions + computed.deductions);
    }
    row.netPay = roundMoney(
      box1GrossWages(row.regularPay, row.overtimePay) +
        row.reimbursements -
        row.deductions -
        row.federalTax -
        row.stateTax
    );

    cursor = toDayString(addDays(utcDay(spanEnd), 1));
    if (cursor <= spanStart) break;
  }

  if (year === now.getUTCFullYear()) {
    const orphans = employee.adjustments.filter((item) => !item.payPeriodId);
    const reimbursements = roundMoney(
      orphans.filter((item) => item.type === "REIMBURSEMENT").reduce((sum, item) => sum + item.amount, 0)
    );
    const deductions = roundMoney(
      orphans.filter((item) => item.type === "DEDUCTION").reduce((sum, item) => sum + item.amount, 0)
    );
    row.reimbursements = roundMoney(row.reimbursements + reimbursements);
    row.deductions = roundMoney(row.deductions + deductions);
    row.netPay = roundMoney(row.netPay + reimbursements - deductions);
  }

  return row;
}

function materialReimbursementsForYear(
  employees: EmployeeDTO[],
  jobs: JobDTO[],
  year: number,
  now: Date
): MaterialItem[] {
  const currentYear = now.getUTCFullYear();
  const lines: MaterialItem[] = [];
  for (const employee of employees) {
    if (isMockSeedId(employee.id)) continue;
    for (const adj of employee.adjustments) {
      if (adj.type !== "REIMBURSEMENT" || adj.category !== "MATERIALS") continue;
      if (isMockSeedId(adj.jobId)) continue;
      const period = employee.payPeriods.find((row) => row.id === adj.payPeriodId);
      const adjYear = yearOf(period?.startDate) ?? (adj.payPeriodId ? null : currentYear);
      if (adjYear !== year) continue;
      const meta = jobMeta(jobs, adj.jobId);
      lines.push({
        source: "reimbursement",
        jobId: adj.jobId,
        jobCode: meta.jobCode,
        jobName: meta.jobName,
        document: period ? `Payroll ${period.startDate}` : "Open reimbursement",
        description: adj.description || "Job-site materials out of pocket",
        quantity: 1,
        unit: "ea",
        rate: adj.amount,
        amount: roundMoney(adj.amount),
        taxRate: 0,
        accruedTax: 0,
      });
    }
  }
  return lines;
}

export function buildYearEndBooks(input: {
  year: number;
  companyName?: string;
  jobs: JobDTO[];
  invoices: InvoiceDTO[];
  estimates?: EstimateDTO[];
  employees: EmployeeDTO[];
  now?: Date;
}): YearEndBooks {
  const now = input.now ?? new Date();
  const year = input.year;
  const jobs = input.jobs.filter((job) => liveJob(job.id));
  const invoices = input.invoices.filter(
    (invoice) => !isMockSeedId(invoice.id) && !isMockSeedId(invoice.jobId)
  );
  const employees = input.employees.filter((person) => !isMockSeedId(person.id));
  const jobRows = new Map<string, JobLedgerRow>();
  for (const job of jobs) jobRows.set(job.id, emptyJobRow(job));

  const materialLines: MaterialItem[] = [];
  const taxRecords: TaxRecord[] = [];
  let grossCollected = 0;
  let billedAccrual = 0;
  let laborBilled = 0;
  let materialBilled = 0;
  let otherBilled = 0;
  let materialTaxAccrued = 0;

  for (const invoice of invoices) {
    const cashYear = invoiceCashYear(invoice);
    const accrualYear = invoiceAccrualYear(invoice);
    const inCash = cashYear === year;
    const inAccrual = accrualYear === year;
    if (!inCash && !inAccrual) continue;

    const basis = contractorTaxBasis(invoice.lines, invoice.taxRate);
    const lumpSum = invoice.lines.length === 0;
    const meta = jobMeta(jobs, invoice.jobId);
    const rowKey = invoice.jobId && jobRows.has(invoice.jobId) ? invoice.jobId : "__unassigned";
    if (!jobRows.has(rowKey)) {
      jobRows.set(
        rowKey,
        emptyJobRow({
          id: rowKey,
          code: "",
          name: rowKey === "__unassigned" ? "Unassigned invoices" : meta.jobName,
          client: meta.client,
        })
      );
    }
    const row = jobRows.get(rowKey)!;

    if (inCash) {
      grossCollected = roundMoney(grossCollected + invoice.amount);
      row.grossCollected = roundMoney(row.grossCollected + invoice.amount);
    }
    if (inAccrual) {
      billedAccrual = roundMoney(billedAccrual + invoice.amount);
      row.billedAccrual = roundMoney(row.billedAccrual + invoice.amount);
      if (lumpSum) {
        row.lumpSumInvoices += 1;
      } else {
        laborBilled = roundMoney(laborBilled + basis.labor);
        materialBilled = roundMoney(materialBilled + basis.materials);
        otherBilled = roundMoney(otherBilled + basis.other);
        materialTaxAccrued = roundMoney(materialTaxAccrued + basis.materialTax);
        row.laborBilled = roundMoney(row.laborBilled + basis.labor);
        row.materialBilled = roundMoney(row.materialBilled + basis.materials);
        row.accruedMaterialTax = roundMoney(row.accruedMaterialTax + basis.materialTax);
        for (const line of invoice.lines) {
          if (line.kind !== "MATERIAL") continue;
          const amount = lineAmount(line);
          if (amount <= 0) continue;
          materialLines.push({
            source: "invoice",
            jobId: invoice.jobId,
            jobCode: meta.jobCode,
            jobName: meta.jobName,
            document: invoice.number,
            description: line.description || "Materials",
            quantity: line.quantity,
            unit: line.unit,
            rate: line.rate,
            amount,
            taxRate: invoice.taxRate,
            accruedTax: roundMoney(amount * ((Number(invoice.taxRate) || 0) / 100)),
          });
        }
      }
      taxRecords.push({
        invoiceNumber: invoice.number,
        jobName: meta.jobName,
        status: invoice.status,
        taxRate: invoice.taxRate,
        materials: basis.materials,
        laborNontaxable: basis.labor,
        otherNontaxable: basis.other,
        accruedMaterialTax: lumpSum ? 0 : basis.materialTax,
        lumpSum,
      });
    }
  }

  const reimbursed = materialReimbursementsForYear(employees, jobs, year, now);
  materialLines.push(...reimbursed);
  for (const line of reimbursed) {
    const key = line.jobId && jobRows.has(line.jobId) ? line.jobId : "__unassigned";
    if (!jobRows.has(key)) {
      jobRows.set(
        key,
        emptyJobRow({
          id: key,
          code: line.jobCode,
          name: line.jobName,
          client: "",
        })
      );
    }
    const row = jobRows.get(key)!;
    row.materialReimbursed = roundMoney(row.materialReimbursed + line.amount);
  }

  for (const row of jobRows.values()) {
    row.materialCost = roundMoney(row.materialBilled + row.materialReimbursed);
  }

  const payrollRows = employees
    .map((person) => payrollForEmployeeYear(person, year, now))
    .filter((row): row is EmployeePayrollRow => Boolean(row))
    .sort((a, b) => a.name.localeCompare(b.name));

  const payroll = payrollRows.reduce(
    (sum, row) => ({
      regularHours: roundHours(sum.regularHours + row.regularHours),
      overtimeHours: roundHours(sum.overtimeHours + row.overtimeHours),
      actualHours: roundHours(sum.actualHours + row.actualHours),
      grossWages: roundMoney(sum.grossWages + row.grossPay),
      federalWithheld: roundMoney(sum.federalWithheld + row.federalTax),
      stateWithheld: roundMoney(sum.stateWithheld + row.stateTax),
      reimbursements: roundMoney(sum.reimbursements + row.reimbursements),
      net: roundMoney(sum.net + row.netPay),
    }),
    {
      regularHours: 0,
      overtimeHours: 0,
      actualHours: 0,
      grossWages: 0,
      federalWithheld: 0,
      stateWithheld: 0,
      reimbursements: 0,
      net: 0,
    }
  );

  const materialReimbursed = roundMoney(reimbursed.reduce((sum, line) => sum + line.amount, 0));
  const throughDate = minIso([calendarYearRange(year).end, todayString(now)]);

  return {
    year,
    companyName: (input.companyName || "Job Command").trim() || "Job Command",
    generatedAt: now.toISOString(),
    throughDate,
    revenue: {
      grossCollected,
      billedAccrual,
      laborBilled,
      materialBilled,
      otherBilled,
    },
    materials: {
      billed: materialBilled,
      reimbursed: materialReimbursed,
      totalCost: roundMoney(materialBilled + materialReimbursed),
      lines: materialLines,
    },
    labor: {
      billedNontaxable: laborBilled,
      isolated: true,
    },
    tax: {
      materialTaxAccrued,
      laborTaxAccrued: 0,
      note: TAX_NOTE,
      records: taxRecords,
    },
    payroll: {
      ...payroll,
      employees: payrollRows,
    },
    jobs: Array.from(jobRows.values()).filter(
      (row) =>
        row.grossCollected ||
        row.billedAccrual ||
        row.materialCost ||
        row.laborBilled ||
        row.accruedMaterialTax
    ),
  };
}
