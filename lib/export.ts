import { computePay, type PayComputeResult } from "@/lib/payroll";
import { formatDay, formatRange, todayString } from "@/lib/dates";
import type { EmployeeDTO, PayPeriodDTO, TimeEntryDTO } from "@/lib/types";

function csvEscape(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function csvRow(values: Array<string | number | null | undefined>): string {
  return values.map(csvEscape).join(",");
}

export function payrollCsv(
  employee: EmployeeDTO,
  period: PayPeriodDTO,
  computed: PayComputeResult
): string {
  const header = [
    "Employee",
    "Title",
    "Pay Type",
    "Pay Period Start",
    "Pay Period End",
    "Frequency",
    "Regular Hours",
    "Overtime Hours",
    "Hourly Rate",
    "Overtime Rate",
    "Regular Pay",
    "Overtime Pay",
    "Reimbursements",
    "Gross Pay",
    "Deductions",
    "Federal Tax",
    "State Tax",
    "Net Pay",
    "YTD Gross",
    "YTD Federal",
    "YTD State",
    "YTD Net",
    "Approval Status",
    "Approved By",
    "Approved At",
  ];

  const otRate =
    employee.payType === "HOURLY"
      ? employee.hourlyRate * 1.5
      : (employee.hourlyRate || employee.salaryAnnual / 2080) * 1.5;

  const row = [
    `${employee.firstName} ${employee.lastName}`,
    employee.jobTitle,
    employee.payType,
    period.startDate,
    period.endDate,
    period.frequency,
    computed.regularHours.toFixed(1),
    computed.overtimeHours.toFixed(1),
    employee.hourlyRate.toFixed(2),
    otRate.toFixed(2),
    computed.regularPay.toFixed(2),
    computed.overtimePay.toFixed(2),
    computed.reimbursements.toFixed(2),
    computed.grossPay.toFixed(2),
    computed.deductions.toFixed(2),
    computed.federalTax.toFixed(2),
    computed.stateTax.toFixed(2),
    computed.netPay.toFixed(2),
    employee.ytdGross.toFixed(2),
    employee.ytdFederalTax.toFixed(2),
    employee.ytdStateTax.toFixed(2),
    employee.ytdNet.toFixed(2),
    period.status,
    period.approvedBy ?? "",
    period.approvedAt ?? "",
  ];

  return [csvRow(header), csvRow(row)].join("\n") + "\n";
}

export function timeActivityCsv(
  employee: EmployeeDTO,
  entries: TimeEntryDTO[]
): string {
  const header = [
    "Employee",
    "Date",
    "Job ID",
    "Job Name",
    "Service Code",
    "Service Class",
    "Scheduled Hours",
    "Actual Hours",
    "Overtime Eligible",
    "Clock In",
    "Clock Out",
    "Status",
    "Notes",
  ];
  const rows = entries.map((entry) =>
    csvRow([
      `${employee.firstName} ${employee.lastName}`,
      entry.date,
      entry.job?.code ?? "",
      entry.job?.name ?? "",
      entry.serviceCode?.code ?? "",
      entry.serviceCode?.className ?? "",
      entry.scheduledHours.toFixed(1),
      entry.actualHours.toFixed(1),
      entry.actualHours > 8 ? "Y" : "N",
      entry.clockIn ?? "",
      entry.clockOut ?? "",
      entry.status,
      entry.notes ?? "",
    ])
  );
  return [csvRow(header), ...rows].join("\n") + "\n";
}

export function iifPayroll(employee: EmployeeDTO, computed: PayComputeResult, period: PayPeriodDTO): string {
  const name = `${employee.lastName}, ${employee.firstName}`;
  const lines = [
    "!TIMERHDR\tVER\tREL\tCOMPANYNAME\tFROMDATE\tTODATE",
    `TIMERHDR\t8\t0\tJob Command\t${period.startDate}\t${period.endDate}`,
    "!TIMEACT\tDATE\tJOB\tEMP\tPITEM\tDURATION\tNOTE",
    `TIMEACT\t${period.startDate}\tPAYROLL\t${name}\tRegular\t${computed.regularHours.toFixed(1)}\tRegular hours`,
    `TIMEACT\t${period.startDate}\tPAYROLL\t${name}\tOvertime\t${computed.overtimeHours.toFixed(1)}\tOT 1.5x`,
    "",
  ];
  return lines.join("\n");
}

export function buildPayslipModel(
  employee: EmployeeDTO,
  period: PayPeriodDTO,
  computed: PayComputeResult,
  entries: TimeEntryDTO[]
) {
  return {
    company: "Job Command",
    employee: `${employee.firstName} ${employee.lastName}`,
    title: employee.jobTitle,
    period: formatRange(period.startDate, period.endDate),
    frequency: period.frequency,
    computed,
    entries,
    ytd: {
      gross: employee.ytdGross,
      federal: employee.ytdFederalTax,
      state: employee.ytdStateTax,
      net: employee.ytdNet,
    },
    approvedBy: period.approvedBy,
    status: period.status,
    generated: todayString(),
  };
}

export function yearEndCsv(books: import("@/lib/contractor-ledger").YearEndBooks): string {
  const money = (value: number) => value.toFixed(2);
  const hours = (value: number) => value.toFixed(1);
  const sections: string[] = [
    csvRow(["YEAR-END BOOKS", String(books.year)]),
    csvRow(["Company", books.companyName]),
    csvRow(["Through", books.throughDate]),
    csvRow(["Generated", books.generatedAt]),
    "",
    csvRow(["GROSS EARNINGS"]),
    csvRow(["Cash collected (PAID invoices)", money(books.revenue.grossCollected)]),
    csvRow(["Billed accrual (sent + paid)", money(books.revenue.billedAccrual)]),
    csvRow(["Labor billed (nontaxable)", money(books.revenue.laborBilled)]),
    csvRow(["Materials billed (tax basis)", money(books.revenue.materialBilled)]),
    csvRow(["Other billed (nontaxable)", money(books.revenue.otherBilled)]),
    "",
    csvRow(["MATERIAL TAX LEDGER"]),
    csvRow([books.tax.note]),
    csvRow(["Accrued tax on materials", money(books.tax.materialTaxAccrued)]),
    csvRow(["Accrued tax on labor", money(books.tax.laborTaxAccrued)]),
    csvRow([
      "Invoice",
      "Job",
      "Status",
      "Tax rate %",
      "Materials",
      "Labor (nontaxable)",
      "Other (nontaxable)",
      "Accrued material tax",
      "Lump sum (no lines)",
    ]),
    ...books.tax.records.map((record) =>
      csvRow([
        record.invoiceNumber,
        record.jobName,
        record.status,
        record.taxRate.toFixed(3),
        money(record.materials),
        money(record.laborNontaxable),
        money(record.otherNontaxable),
        money(record.accruedMaterialTax),
        record.lumpSum ? "Y" : "N",
      ])
    ),
    "",
    csvRow(["ITEMIZED MATERIAL COSTS"]),
    csvRow([
      "Source",
      "Document",
      "Job code",
      "Job",
      "Description",
      "Qty",
      "Unit",
      "Rate",
      "Amount",
      "Tax rate %",
      "Accrued tax",
    ]),
    ...books.materials.lines.map((line) =>
      csvRow([
        line.source,
        line.document,
        line.jobCode,
        line.jobName,
        line.description,
        line.quantity,
        line.unit,
        money(line.rate),
        money(line.amount),
        line.taxRate.toFixed(3),
        money(line.accruedTax),
      ])
    ),
    csvRow(["Materials billed total", money(books.materials.billed)]),
    csvRow(["Materials reimbursed total", money(books.materials.reimbursed)]),
    csvRow(["Materials cost total", money(books.materials.totalCost)]),
    "",
    csvRow(["JOB LEDGER"]),
    csvRow([
      "Code",
      "Job",
      "Client",
      "Cash collected",
      "Billed accrual",
      "Labor billed (nontaxable)",
      "Materials billed",
      "Materials reimbursed",
      "Material cost",
      "Accrued material tax",
    ]),
    ...books.jobs.map((job) =>
      csvRow([
        job.code,
        job.name,
        job.client,
        money(job.grossCollected),
        money(job.billedAccrual),
        money(job.laborBilled),
        money(job.materialBilled),
        money(job.materialReimbursed),
        money(job.materialCost),
        money(job.accruedMaterialTax),
      ])
    ),
    "",
    csvRow(["EMPLOYEE PAYROLL WAGES"]),
    csvRow([
      "Employee",
      "Title",
      "Status",
      "Hire date",
      "End date",
      "Pay type",
      "Hourly rate",
      "Regular hours",
      "Overtime hours",
      "Gross wages (box 1)",
      "Reimbursements",
      "Deductions",
      "Federal tax",
      "State tax",
      "Net",
    ]),
    ...books.payroll.employees.map((person) =>
      csvRow([
        person.name,
        person.title,
        person.statusLabel,
        person.hireDate,
        person.endDate,
        person.payType,
        money(person.hourlyRate),
        hours(person.regularHours),
        hours(person.overtimeHours),
        money(person.grossPay),
        money(person.reimbursements),
        money(person.deductions),
        money(person.federalTax),
        money(person.stateTax),
        money(person.netPay),
      ])
    ),
    csvRow(["Payroll gross wages (box 1)", money(books.payroll.grossWages)]),
    csvRow(["Payroll hours total", hours(books.payroll.actualHours)]),
    csvRow(["Federal withheld total", money(books.payroll.federalWithheld)]),
    csvRow(["State withheld total", money(books.payroll.stateWithheld)]),
    csvRow(["Payroll net total", money(books.payroll.net)]),
  ];
  return sections.join("\n") + "\n";
}

export { formatDay, computePay };
