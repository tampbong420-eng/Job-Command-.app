/**
 * Lit pipeline stage per job, the same way the job card lights its stage button.
 * Shared by the Schedule screen (tagging untagged rows on read) and the kind backfill.
 */
import { customerForJob, filledThrough, highlightedStageId, readPipeFacts } from "@/lib/job-pipeline";
import type { CustomerDTO, EmployeeDTO, EstimateDTO, InvoiceDTO, JobDTO } from "@/lib/types";

export function jobStageMap(input: {
  jobs: JobDTO[];
  customers: CustomerDTO[];
  estimates: EstimateDTO[];
  invoices: InvoiceDTO[];
  employees: EmployeeDTO[];
  now: Date;
}): Map<string, number> {
  const map = new Map<string, number>();
  for (const job of input.jobs) {
    const estimate = input.estimates.find((item) => item.jobId === job.id) || null;
    const facts = readPipeFacts({
      job,
      customer: customerForJob(job, input.customers, estimate),
      estimate,
      invoices: input.invoices,
      employees: input.employees,
      now: input.now,
    });
    map.set(job.id, highlightedStageId(filledThrough(job.pipeline, facts)));
  }
  return map;
}
