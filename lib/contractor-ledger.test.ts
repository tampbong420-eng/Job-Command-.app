import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  box1GrossWages,
  buildYearEndBooks,
  contractorTaxBasis,
  parseExportYear,
  payrollForEmployeeYear,
} from "./contractor-ledger";
import { documentTotals } from "./documents";
import { yearEndCsv } from "./export";
import { writeYearEndPdf } from "./year-end-pdf";
import { isMockSeedId } from "./initial-data";
import { computePay } from "./payroll";
import type { EmployeeDTO, InvoiceDTO, JobDTO } from "./types";

const pdf = readFileSync(new URL("./year-end-pdf.ts", import.meta.url), "utf8");
const billingUi = readFileSync(new URL("../components/command/BillingDesk.tsx", import.meta.url), "utf8");
const exportApi = readFileSync(new URL("../app/api/export/year-end/route.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const desk = readFileSync(new URL("../components/command/EmployeeWorkspace.tsx", import.meta.url), "utf8");
const booksUi = readFileSync(new URL("../components/command/YearEndBooks.tsx", import.meta.url), "utf8");
const lead = readFileSync(new URL("../components/command/LeadStage.tsx", import.meta.url), "utf8");
const estimate = readFileSync(new URL("../components/command/EstimateStage.tsx", import.meta.url), "utf8");
const yellow = readFileSync(new URL("../components/command/YellowPrepStage.tsx", import.meta.url), "utf8");
const overlay = readFileSync(new URL("../hooks/use-workspace-overlay.ts", import.meta.url), "utf8");
const ledger = readFileSync(new URL("./contractor-ledger.ts", import.meta.url), "utf8");
const setup = readFileSync(new URL("../components/command/CompanySetup.tsx", import.meta.url), "utf8");

function job(partial: Partial<JobDTO> & Pick<JobDTO, "id" | "code" | "name">): JobDTO {
  return {
    client: "Cedar Park HOA",
    customerId: "cust_1",
    address: "100 Maple Demo Rd, Millford, ST 00000",
    notes: "",
    timeline: "",
    dueDate: "2026-06-01",
    pipeline: 5,
    leadCalledAt: null,
    photos: [],
    ...partial,
  };
}

function invoice(
  partial: Partial<InvoiceDTO> & Pick<InvoiceDTO, "id" | "number" | "amount" | "status">
): InvoiceDTO {
  return {
    customerId: "cust_1",
    jobId: "job_live",
    dueDate: "2026-06-15",
    notes: "",
    terms: "",
    taxRate: 8,
    sentAt: "2026-06-01T12:00:00.000Z",
    paidAt: partial.status === "PAID" ? "2026-06-20T12:00:00.000Z" : null,
    customerName: "Cedar Park HOA",
    jobName: "Exterior",
    lines: [],
    ...partial,
  };
}

function employee(partial: Partial<EmployeeDTO> & Pick<EmployeeDTO, "id" | "firstName" | "lastName">): EmployeeDTO {
  return {
    jobTitle: "Painter",
    photoUrl: null,
    email: "pat.lee@example.com",
    phone: "5550100100",
    payType: "HOURLY",
    hourlyRate: 40,
    salaryAnnual: 0,
    baselineStartDate: "2026-01-05",
    payFrequency: "WEEKLY",
    federalWithholdPct: 10,
    stateWithholdPct: 5,
    employmentStatus: "ACTIVE",
    employmentEndDate: null,
    ytdGross: 0,
    ytdFederalTax: 0,
    ytdStateTax: 0,
    ytdNet: 0,
    ytdOvertime: 0,
    timeEntries: [],
    payPeriods: [],
    adjustments: [],
    auditLogs: [],
    ...partial,
  };
}

test("contractor tax basis is materials only; labor stays isolated", () => {
  const lines = [
    { kind: "LABOR" as const, description: "Brush work", quantity: 1, unit: "lot", rate: 2000 },
    { kind: "MATERIAL" as const, description: "Paint", quantity: 10, unit: "gal", rate: 100 },
  ];
  const basis = contractorTaxBasis(lines, 8);
  assert.equal(basis.materials, 1000);
  assert.equal(basis.labor, 2000);
  assert.equal(basis.materialTax, 80);
  assert.equal(basis.laborTax, 0);
  assert.equal(basis.taxableBasis, 1000);
  assert.equal(basis.nontaxable, 2000);
  assert.equal(documentTotals(lines, 8).tax, 240);
});

test("hourly payroll uses weekly overtime at 1.5x, not a placeholder", () => {
  const tenHours = payrollForEmployeeYear(
    employee({
      id: "emp_hours",
      firstName: "Pat",
      lastName: "Lee",
      hourlyRate: 40,
      timeEntries: [
        {
          id: "t1",
          date: "2026-01-05",
          scheduledHours: 10,
          actualHours: 10,
          clockIn: null,
          clockOut: null,
          scheduledStart: null,
          scheduledEnd: null,
          status: "COMPLETE",
          jobId: "job_live",
          serviceCodeId: null,
          notes: null,
          job: null,
          serviceCode: null,
        },
      ],
    }),
    2026,
    new Date("2026-01-12T12:00:00.000Z")
  );
  assert.equal(tenHours?.actualHours, 10);
  assert.equal(tenHours?.grossPay, 400);

  const days = ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09"].map(
    (date, index) => ({
      id: `ot-${index}`,
      date,
      scheduledHours: 9,
      actualHours: 9,
      clockIn: null,
      clockOut: null,
      scheduledStart: null,
      scheduledEnd: null,
      status: "COMPLETE" as const,
      jobId: "job_live",
      serviceCodeId: null,
      notes: null,
      job: null,
      serviceCode: null,
    })
  );
  const ot = payrollForEmployeeYear(
    employee({
      id: "emp_ot",
      firstName: "Pat",
      lastName: "Lee",
      hourlyRate: 20,
      timeEntries: days,
    }),
    2026,
    new Date("2026-01-12T12:00:00.000Z")
  );
  const expected = computePay({
    payType: "HOURLY",
    hourlyRate: 20,
    salaryAnnual: 0,
    frequency: "WEEKLY",
    federalWithholdPct: 10,
    stateWithholdPct: 5,
    baselineStartDate: "2026-01-05",
    periodStart: "2026-01-05",
    periodEnd: "2026-01-11",
    days: days.map((day) => ({
      date: day.date,
      scheduledHours: 9,
      actualHours: 9,
    })),
    adjustments: [],
  });
  assert.equal(ot?.actualHours, 45);
  assert.equal(ot?.overtimeHours, 5);
  assert.equal(ot?.grossPay, 950);
  assert.equal(ot?.grossPay, expected.grossPay);
  assert.equal(ot?.federalTax, expected.federalTax);
});

test("year-end books split cash, materials, tax, and payroll from live rows only", () => {
  const liveJob = job({ id: "job_live", code: "JC-1104", name: "Cedar exterior" });
  const mockJob = job({
    id: "mock-job-cedar-exterior",
    code: "MOCK-1104",
    name: "Sample job",
  });
  const books = buildYearEndBooks({
    year: 2026,
    companyName: "Summit Coatings",
    now: new Date("2026-09-24T12:00:00.000Z"),
    jobs: [liveJob, mockJob],
    invoices: [
      invoice({
        id: "inv_paid",
        number: "INV-2001",
        amount: 3240,
        status: "PAID",
        lines: [
          {
            id: "l1",
            kind: "LABOR",
            description: "Labor",
            quantity: 1,
            unit: "lot",
            rate: 2000,
            amount: 2000,
          },
          {
            id: "l2",
            kind: "MATERIAL",
            description: "Paint",
            quantity: 10,
            unit: "gal",
            rate: 100,
            amount: 1000,
          },
        ],
      }),
      invoice({
        id: "mock-inv-sample",
        number: "INV-MOCK",
        jobId: "mock-job-cedar-exterior",
        amount: 99999,
        status: "PAID",
        lines: [
          {
            id: "lm",
            kind: "MATERIAL",
            description: "Fake",
            quantity: 1,
            unit: "lot",
            rate: 99999,
            amount: 99999,
          },
        ],
      }),
    ],
    employees: [
      employee({
        id: "emp_live",
        firstName: "Pat",
        lastName: "Lee",
        hourlyRate: 40,
        timeEntries: [
          {
            id: "t1",
            date: "2026-01-05",
            scheduledHours: 10,
            actualHours: 10,
            clockIn: null,
            clockOut: null,
            scheduledStart: null,
            scheduledEnd: null,
            status: "COMPLETE",
            jobId: "job_live",
            serviceCodeId: null,
            notes: null,
            job: null,
            serviceCode: null,
          },
        ],
        adjustments: [
          {
            id: "adj1",
            payPeriodId: null,
            jobId: "job_live",
            type: "REIMBURSEMENT",
            category: "MATERIALS",
            description: "Drop cloths",
            amount: 42.5,
          },
        ],
      }),
      employee({
        id: "mock-crew-vale",
        firstName: "Jordan",
        lastName: "Vale",
        hourlyRate: 38,
        timeEntries: [
          {
            id: "tm",
            date: "2026-01-05",
            scheduledHours: 8,
            actualHours: 8,
            clockIn: null,
            clockOut: null,
            scheduledStart: null,
            scheduledEnd: null,
            status: "COMPLETE",
            jobId: "mock-job-cedar-exterior",
            serviceCodeId: null,
            notes: null,
            job: null,
            serviceCode: null,
          },
        ],
      }),
    ],
  });

  assert.equal(isMockSeedId("mock-job-cedar-exterior"), true);
  assert.equal(books.revenue.grossCollected, 3240);
  assert.equal(books.revenue.laborBilled, 2000);
  assert.equal(books.materials.billed, 1000);
  assert.equal(books.materials.reimbursed, 42.5);
  assert.equal(books.materials.totalCost, 1042.5);
  assert.equal(books.tax.materialTaxAccrued, 80);
  assert.equal(books.tax.laborTaxAccrued, 0);
  assert.equal(books.labor.billedNontaxable, 2000);
  assert.equal(books.payroll.grossWages, 400);
  assert.equal(books.payroll.reimbursements, 42.5);
  assert.equal(books.payroll.employees.length, 1);
  assert.equal(books.payroll.employees[0].status, "ACTIVE");
  assert.equal(books.payroll.employees[0].hireDate, "2026-01-05");
  assert.equal(books.jobs.some((row) => isMockSeedId(row.jobId)), false);
  const csv = yearEndCsv(books);
  assert.match(csv, /Cash collected \(PAID invoices\),3240\.00/);
  assert.match(csv, /Accrued tax on materials,80\.00/);
  assert.match(csv, /Payroll gross wages \(box 1\),400\.00/);
  assert.match(csv, /Drop cloths/);
  const pdfText = Buffer.from(writeYearEndPdf(books))
    .toString("latin1")
    .replace(/\\([()\\])/g, "$1");
  assert.match(pdfText, /Gross wages \(box 1\)/);
  assert.match(pdfText, /Drop cloths/);
  assert.match(pdfText, /INV-2001/);
  assert.match(pdfText, /Hire date/);
  assert.match(pdfText, /Labor billed \(nontaxable\)/);
  assert.match(pdfText, /Reimbursements \(not box 1\)/);
});

test("accrual stays on sent or due date, not the payment year", () => {
  const liveJob = job({ id: "job_live", code: "JC-1104", name: "Cedar exterior" });
  const latePay = invoice({
    id: "inv_cross",
    number: "INV-2008",
    amount: 1080,
    status: "PAID",
    taxRate: 8,
    sentAt: "2026-06-01T12:00:00.000Z",
    paidAt: "2027-01-15T12:00:00.000Z",
    dueDate: "2026-06-15",
    lines: [
      {
        id: "m1",
        kind: "MATERIAL",
        description: "Paint",
        quantity: 10,
        unit: "gal",
        rate: 100,
        amount: 1000,
      },
    ],
  });
  const y2026 = buildYearEndBooks({
    year: 2026,
    companyName: "Summit Coatings",
    now: new Date("2027-02-01T12:00:00.000Z"),
    jobs: [liveJob],
    invoices: [latePay],
    employees: [],
  });
  const y2027 = buildYearEndBooks({
    year: 2027,
    companyName: "Summit Coatings",
    now: new Date("2027-02-01T12:00:00.000Z"),
    jobs: [liveJob],
    invoices: [latePay],
    employees: [],
  });
  assert.equal(y2026.revenue.grossCollected, 0);
  assert.equal(y2026.revenue.billedAccrual, 1080);
  assert.equal(y2026.materials.billed, 1000);
  assert.equal(y2026.tax.materialTaxAccrued, 80);
  assert.equal(y2027.revenue.grossCollected, 1080);
  assert.equal(y2027.revenue.billedAccrual, 0);
  assert.equal(y2027.tax.materialTaxAccrued, 0);
});

test("year-boundary weeks keep December and January days on their own calendar years", () => {
  const punch = (id: string, date: string, hours: number) => ({
    id,
    date,
    scheduledHours: hours,
    actualHours: hours,
    clockIn: null,
    clockOut: null,
    scheduledStart: null,
    scheduledEnd: null,
    status: "COMPLETE" as const,
    jobId: "job_live",
    serviceCodeId: null,
    notes: null,
    job: null,
    serviceCode: null,
  });
  const crew = employee({
    id: "emp_bound",
    firstName: "Pat",
    lastName: "Lee",
    hourlyRate: 40,
    baselineStartDate: "2025-12-01",
    timeEntries: [punch("dec", "2025-12-30", 8), punch("jan", "2026-01-02", 8)],
  });
  const now = new Date("2026-09-24T12:00:00.000Z");
  const y2025 = payrollForEmployeeYear(crew, 2025, now);
  const y2026 = payrollForEmployeeYear(crew, 2026, now);
  assert.equal(y2025?.actualHours, 8);
  assert.equal(y2025?.grossPay, 320);
  assert.equal(y2026?.actualHours, 8);
  assert.equal(y2026?.grossPay, 320);
});

test("box 1 gross wages exclude material reimbursements", () => {
  assert.equal(box1GrossWages(400, 0), 400);
  assert.equal(box1GrossWages(800, 150), 950);
  const crew = employee({
    id: "emp_box1",
    firstName: "Pat",
    lastName: "Lee",
    hourlyRate: 40,
    timeEntries: [
      {
        id: "t1",
        date: "2026-01-05",
        scheduledHours: 10,
        actualHours: 10,
        clockIn: null,
        clockOut: null,
        scheduledStart: null,
        scheduledEnd: null,
        status: "COMPLETE",
        jobId: "job_live",
        serviceCodeId: null,
        notes: null,
        job: null,
        serviceCode: null,
      },
    ],
    adjustments: [
      {
        id: "adj1",
        payPeriodId: null,
        jobId: "job_live",
        type: "REIMBURSEMENT",
        category: "MATERIALS",
        description: "Drop cloths",
        amount: 42.5,
      },
    ],
  });
  const row = payrollForEmployeeYear(crew, 2026, new Date("2026-01-12T12:00:00.000Z"));
  assert.equal(row?.regularPay, 400);
  assert.equal(row?.grossPay, 400);
  assert.equal(row?.reimbursements, 42.5);
  assert.notEqual(row?.grossPay, 442.5);
});

test("year-end export lives on Company, not daily bidding forms", () => {
  assert.match(desk, /<YearEndBooks/);
  assert.match(desk, /ThemePicker/);
  assert.match(desk, /billing=\{settings\.billing/);
  assert.match(booksUi, /data-year-end-books="1"/);
  assert.match(booksUi, /data-year-end-plan="1"/);
  assert.match(booksUi, /canUseAccountantExport/);
  assert.match(booksUi, /data-year-end-locked="1"/);
  assert.match(billingUi, /data-flat-plan="1"/);
  assert.match(billingUi, /flat-rate/);
  assert.match(exportApi, /canUseAccountantExport/);
  assert.match(exportApi, /writeYearEndPdf/);
  assert.match(exportApi, /status: 402/);
  assert.match(pdf, /Job ledger/);
  assert.match(pdf, /Gross wages \(box 1\)/);
  assert.match(pdf, /Accrued tax on materials/);
  assert.match(pdf, /Qty \| Unit \| Rate/);
  assert.match(pdf, /Hire date/);
  assert.match(pdf, /Labor billed \(nontaxable\)/);
  assert.match(pdf, /Reimbursements \(not box 1\)/);
  assert.doesNotMatch(lead, /data-year-end-books/);
  assert.doesNotMatch(estimate, /data-year-end-books/);
  assert.doesNotMatch(yellow, /data-year-end-books/);
  assert.doesNotMatch(lead, /data-flat-plan/);
  assert.doesNotMatch(estimate, /data-flat-plan/);
  assert.doesNotMatch(lead, /contractorTaxBasis/);
  assert.doesNotMatch(estimate, /contractorTaxBasis/);
  assert.doesNotMatch(yellow, /buildYearEndBooks/);
  assert.doesNotMatch(overlay, /prisma/);
  assert.doesNotMatch(ledger, /prisma/);
  assert.doesNotMatch(setup, /buildYearEndBooks/);
  assert.equal(parseExportYear("2024"), 2024);
  const pulseHits = [...css.matchAll(/animation:\s*taskPulse 4s infinite ease-in-out/g)];
  assert.equal(pulseHits.length, 3);
  assert.match(css, /\.btn-next-action,\s*\.next-action-button \{[^}]*background-color:\s*#c9a227/);
});
