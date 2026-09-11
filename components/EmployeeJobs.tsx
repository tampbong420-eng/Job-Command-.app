"use client";

import { employeeJobs } from "@/lib/assign";
import { jobStatusLabel, jobTone } from "@/lib/format";
import { mapsDirectionsUrl, originQuery } from "@/lib/maps";
import type { CrewMember, Job, JobStatus } from "@/lib/types";

export default function EmployeeJobs({
  member,
  jobs,
  onStatus,
  onDirections,
}: {
  member: CrewMember;
  jobs: Job[];
  onStatus: (jobId: string, status: JobStatus) => void;
  onDirections: (job: Job) => void;
}) {
  const mine = employeeJobs(jobs, member.id);

  return (
    <section className="page jobs-board">
      <p className="section-kicker">Field jobs</p>
      <h1>
        My
        <br />
        <strong>Stops.</strong>
      </h1>
      <p className="board-copy">
        Only jobs locked to you. Get directions or mark a stop finished when
        the work is done.
      </p>
      {mine.length === 0 ? (
        <p className="empty-group">No active jobs on your card yet.</p>
      ) : (
        mine.map((job) => (
          <article key={job.id} className={`customer-card ${jobTone(job.status)}`}>
            <div className="customer-card-top">
              <div>
                <small>{job.scheduledTime}</small>
                <b>{job.jobTitle}</b>
                <span>
                  {job.customerName} · {job.address}
                </span>
              </div>
              <span className={`job-chip ${jobTone(job.status)}`}>
                {jobStatusLabel(job.status)}
              </span>
            </div>
            <div className="rolodex-actions">
              <a
                className="ghost-action directions"
                href={mapsDirectionsUrl(job, originQuery(member))}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => {
                  event.preventDefault();
                  onDirections(job);
                }}
              >
                Get Directions
              </a>
              <button
                type="button"
                className="lane-button tone-done"
                onClick={() => onStatus(job.id, "completed")}
              >
                Finished
              </button>
            </div>
          </article>
        ))
      )}
    </section>
  );
}
