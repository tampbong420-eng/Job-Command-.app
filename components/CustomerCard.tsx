"use client";

import StatusButtons from "@/components/StatusButtons";
import { jobStatusLabel, jobTone } from "@/lib/format";
import type { Estimate, Job, JobStatus, TimeCard } from "@/lib/types";

export default function CustomerCard({
  job,
  estimates,
  timeCards,
  onStatus,
  onDelete,
  onOpenEstimates,
  onOpenTimeCards,
}: {
  job: Job;
  estimates: Estimate[];
  timeCards: TimeCard[];
  onStatus: (status: JobStatus) => void;
  onDelete: () => void;
  onOpenEstimates: () => void;
  onOpenTimeCards: () => void;
}) {
  const quotes = estimates.filter((row) => row.jobId === job.id);
  const cards = timeCards.filter((row) => row.jobId === job.id);
  const quoteTotal = quotes.reduce((sum, row) => sum + row.amount, 0);

  return (
    <article className={`customer-card ${jobTone(job.status)}`}>
      <div className="customer-card-top">
        <div>
          <small>{job.scheduledTime}</small>
          <b>{job.jobTitle}</b>
          <span>
            {job.customerName} · {job.address}
          </span>
        </div>
        <em>{job.worker}</em>
      </div>
      <StatusButtons job={job} onStatus={onStatus} onDelete={onDelete} />
      <div className="customer-card-foot">
        <button type="button" className="text-back" onClick={onOpenEstimates}>
          Estimate {quotes.length ? `$${quoteTotal.toLocaleString()}` : "—"}
        </button>
        <button type="button" className="text-back" onClick={onOpenTimeCards}>
          Time cards {cards.length || 0}
        </button>
        <span className={`job-chip ${jobTone(job.status)}`}>
          {jobStatusLabel(job.status)}
        </span>
      </div>
    </article>
  );
}
