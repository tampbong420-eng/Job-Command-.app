"use client";

import CustomerCard from "@/components/CustomerCard";
import { jobStatusLabel, jobTone } from "@/lib/format";
import type { Estimate, Job, JobStatus, TimeCard } from "@/lib/types";

const GROUPS: JobStatus[] = ["lead", "pending", "in_progress", "completed"];

export default function BossJobsBoard({
  jobs,
  estimates,
  timeCards,
  onStatus,
  onDelete,
  onOpenEstimates,
  onOpenTimeCards,
}: {
  jobs: Job[];
  estimates: Estimate[];
  timeCards: TimeCard[];
  onStatus: (jobId: string, status: JobStatus) => void;
  onDelete: (jobId: string) => void;
  onOpenEstimates: (jobId: string) => void;
  onOpenTimeCards: (jobId: string) => void;
}) {
  return (
    <section className="page jobs-board">
      <p className="section-kicker">Jobs</p>
      <h1>
        Customer
        <br />
        <strong>Cards.</strong>
      </h1>
      <p className="board-copy">
        Tap New lead, Pending, Active, Finished, or Delete on a card. Talk can
        file estimates and time cards into the same customer.
      </p>
      {GROUPS.map((status) => {
        const rows = jobs.filter((job) => job.status === status);
        return (
          <section key={status} className={`job-group ${jobTone(status)}`}>
            <header>
              <span className={`job-chip ${jobTone(status)}`}>
                {jobStatusLabel(status)}
              </span>
              <b>{rows.length}</b>
            </header>
            {rows.length === 0 ? (
              <p className="empty-group">None in this lane.</p>
            ) : (
              rows.map((job) => (
                <CustomerCard
                  key={job.id}
                  job={job}
                  estimates={estimates}
                  timeCards={timeCards}
                  onStatus={(next) => onStatus(job.id, next)}
                  onDelete={() => onDelete(job.id)}
                  onOpenEstimates={() => onOpenEstimates(job.id)}
                  onOpenTimeCards={() => onOpenTimeCards(job.id)}
                />
              ))
            )}
          </section>
        );
      })}
    </section>
  );
}
