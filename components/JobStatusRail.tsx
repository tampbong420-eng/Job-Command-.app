import { jobStatusLabel, jobTone } from "@/lib/format";
import type { Job, JobStatus } from "@/lib/types";

const ORDER: JobStatus[] = ["lead", "pending", "in_progress", "completed"];

export default function JobStatusRail({ jobs }: { jobs: Job[] }) {
  return (
    <ul className="status-rail" aria-label="Job status colors">
      {ORDER.map((status) => {
        const count = jobs.filter((job) => job.status === status).length;
        return (
          <li key={status} className={`status-chip ${jobTone(status)}`}>
            <i />
            <span>
              {jobStatusLabel(status)}
              <b>{count}</b>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
