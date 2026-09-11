"use client";

import { jobTone } from "@/lib/format";
import type { Job, JobStatus } from "@/lib/types";

const BUTTONS: { status: JobStatus; label: string }[] = [
  { status: "lead", label: "New lead" },
  { status: "pending", label: "Pending" },
  { status: "in_progress", label: "Active" },
  { status: "completed", label: "Finished" },
];

export default function StatusButtons({
  job,
  onStatus,
  onDelete,
}: {
  job: Job;
  onStatus: (status: JobStatus) => void;
  onDelete: () => void;
}) {
  return (
    <div className="status-buttons" role="group" aria-label="Customer status">
      {BUTTONS.map((button) => (
        <button
          key={button.status}
          type="button"
          className={`lane-button ${jobTone(button.status)}${job.status === button.status ? " is-on" : ""}`}
          aria-pressed={job.status === button.status}
          onClick={() => onStatus(button.status)}
        >
          {button.label}
        </button>
      ))}
      <button type="button" className="lane-button tone-delete" onClick={onDelete}>
        Delete
      </button>
    </div>
  );
}
