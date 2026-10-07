"use client";

import { useMemo, useState } from "react";
import { buildYearEndBooks, listExportYears } from "@/lib/contractor-ledger";
import { canUseAccountantExport, formatAnnualPlanPrice, formatFlatPlanPrice, type BillingDTO } from "@/lib/billing";
import { money } from "@/lib/format";
import type { EmployeeDTO, EstimateDTO, InvoiceDTO, JobDTO } from "@/lib/types";

export function YearEndBooks({
  jobs,
  invoices,
  estimates,
  employees,
  companyName,
  billing,
}: {
  jobs: JobDTO[];
  invoices: InvoiceDTO[];
  estimates: EstimateDTO[];
  employees: EmployeeDTO[];
  companyName: string;
  billing: BillingDTO;
}) {
  const years = useMemo(() => listExportYears(), []);
  const [year, setYear] = useState(years[0]);
  const unlocked = canUseAccountantExport(billing);
  const books = useMemo(
    () =>
      buildYearEndBooks({
        year,
        companyName,
        jobs,
        invoices,
        estimates,
        employees,
      }),
    [year, companyName, jobs, invoices, estimates, employees]
  );
  const empty =
    books.revenue.billedAccrual === 0 &&
    books.revenue.grossCollected === 0 &&
    books.payroll.grossWages === 0 &&
    books.materials.totalCost === 0;
  const plan = `${formatFlatPlanPrice(billing.basePrice)} or ${formatAnnualPlanPrice(billing.basePriceAnnual)}`;

  return (
    <div className="company-block year-end-books" data-year-end-books="1">
      <p className="card-label">Year-end books</p>
      <div className="year-end-head">
        <b>{year} CPA export</b>
        <label>
          Year
          <select
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            data-year-end-year="1"
          >
            {years.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>
      <span data-year-end-plan="1">
        {billing.status === "active"
          ? `Plan ${plan} flat-rate · active`
          : billing.status === "trial"
            ? `Plan ${plan} flat-rate · trial`
            : `Plan ${plan} flat-rate · ${billing.status.replace("_", " ")}`}
      </span>
      {empty ? (
        <span>No billed work or payroll hours through {books.throughDate}.</span>
      ) : (
        <div className="year-end-totals">
          <span>
            Cash collected
            <b>{money(books.revenue.grossCollected)}</b>
          </span>
          <span>
            Materials
            <b>{money(books.materials.totalCost)}</b>
          </span>
          <span>
            Material tax
            <b>{money(books.tax.materialTaxAccrued)}</b>
          </span>
          <span>
            Payroll wages
            <b>{money(books.payroll.grossWages)}</b>
          </span>
        </div>
      )}
      <small>
        Materials are the tax basis. Labor stays nontaxable. Payroll wages are W-2 box 1 and exclude material
        reimbursements. Overlay sample jobs are left out.
      </small>
      {unlocked ? (
        <div className="year-end-actions">
          <a className="ghost-action slim" href={`/api/export/year-end?year=${year}&format=csv`}>
            Download CSV
          </a>
          <a className="ghost-action slim" href={`/api/export/year-end?year=${year}&format=pdf`}>
            Download PDF
          </a>
        </div>
      ) : (
        <small data-year-end-locked="1">
          Subscribe to the {plan} flat-rate plan to download CSV and PDF CPA packets. Crew clocks stay open.
        </small>
      )}
    </div>
  );
}
