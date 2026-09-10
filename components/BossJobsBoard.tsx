import { jobStatusLabel, jobTone } from "@/lib/format";
import type { Job, JobStatus } from "@/lib/types";

const GROUPS: JobStatus[] = ["lead", "pending", "in_progress", "completed"];

export default function BossJobsBoard({ jobs }: { jobs: Job[] }) {
  return (
    <section className="page jobs-board">
      <p className="section-kicker">Jobs</p>
      <h1>
        Color
        <br />
        <strong>Board.</strong>
      </h1>
      <p className="board-copy">
        New leads in red, pending in orange, active work in light green, completed
        in charcoal. The Command tumbler only cycles active jobs.
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
                <article key={job.id} className="job-row">
                  <div>
                    <small>{job.scheduledTime}</small>
                    <b>{job.jobTitle}</b>
                    <span>
                      {job.customerName} · {job.address}
                    </span>
                  </div>
                  <em>{job.worker}</em>
                </article>
              ))
            )}
          </section>
        );
      })}
    </section>
  );
}
