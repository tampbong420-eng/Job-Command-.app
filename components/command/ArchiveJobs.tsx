"use client";

import type { JobDTO } from "@/lib/types";
import s from "./ProfileRecords.module.css";

/**
 * Roster › Archive Jobs (the gray folder): ONLY the finished/closed jobs — the houses.
 * Address first, then customer, then job name. Tap opens the job's archive stage.
 * Eric 2026-10-02: no Books/Payroll/Customers/Invoices/Receipts here (those live in Office and on profiles).
 */
export function ArchiveJobs({ jobs, onOpen }: { jobs: JobDTO[]; onOpen: (jobId: string) => void }) {
  const archived = jobs.filter((job) => job.pipeline >= 6);
  return (
    <section className="archive-jobs" aria-label="Archive jobs" data-archive-jobs-only="1">
      <div className="command-mast jobs-mast">
        <h1>Archive</h1>
      </div>
      <div className={s.wrap} style={{ marginTop: 0 }}>
        <p className={s.note}>
          Finished jobs · {archived.length} {archived.length === 1 ? "house" : "houses"}
        </p>
        {archived.length ? (
          <ul className={s.houses}>
            {archived.map((job) => (
              <li key={job.id}>
                <button type="button" className={s.house} onClick={() => onOpen(job.id)}>
                  <span className={s.houseAddr}>{job.address || "No address on file"}</span>
                  <span className={s.houseWho}>{job.client || "No customer"}</span>
                  <span className={s.houseJob}>{job.name}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={s.empty}>No closed jobs yet. A job lands here after it is paid and closed out.</p>
        )}
      </div>
    </section>
  );
}
