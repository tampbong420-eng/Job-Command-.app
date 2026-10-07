"use client";

import { Camera, Navigation } from "lucide-react";
import { formatTimeLabel } from "@/lib/schedule";
import { navigateUrl } from "@/lib/maps";
import type { CustomerDTO, EmployeeDTO, EstimateDTO, JobDTO } from "@/lib/types";

export function todaysStops(employee: EmployeeDTO, iso: string) {
  return employee.timeEntries
    .filter((entry) => entry.date === iso && entry.scheduledHours > 0 && entry.job)
    .sort((a, b) => (a.scheduledStart || "").localeCompare(b.scheduledStart || ""));
}

export function FieldRoute({
  employee,
  jobs,
  customers,
  estimates,
  shop,
  today,
  onOpenStop,
}: {
  employee: EmployeeDTO;
  jobs: JobDTO[];
  customers: CustomerDTO[];
  estimates: EstimateDTO[];
  shop: string;
  today: string;
  onOpenStop: (jobId: string) => void;
}) {
  const stops = todaysStops(employee, today);
  if (!stops.length) {
    return (
      <div className="field-empty">
        <h2>Today’s jobs</h2>
        <p>No stops on the board for {employee.firstName} today. When a visit is packed, it lands here with the address, the task, and Navigate.</p>
      </div>
    );
  }

  return (
    <section className="field-day">
      <p className="card-label">Today’s route · {stops.length} stop{stops.length === 1 ? "" : "s"}</p>
      <ol className="field-stops">
        {stops.map((entry, index) => {
          const job = jobs.find((item) => item.id === entry.jobId) || entry.job;
          if (!job) return null;
          const estimate = estimates.find((item) => item.jobId === job.id);
          const customer = customers.find((item) => item.name === job.client);
          const prev = index === 0 ? shop : jobs.find((item) => item.id === stops[index - 1].jobId)?.address || shop;
          const live = Boolean(entry.clockIn && !entry.clockOut);
          return (
            <li key={entry.id} className={`field-stop${live ? " live" : ""}`}>
              <button type="button" className="field-stop-hit" onClick={() => onOpenStop(job.id)}>
                <span className="field-stop-num">{index + 1}</span>
                <div>
                  <b className="client-name">{job.client}</b>
                  <span>{job.address || "No address on the card"}</span>
                  <small>
                    {formatTimeLabel(entry.scheduledStart)}–{formatTimeLabel(entry.scheduledEnd)}
                    {job.notes ? ` · ${job.notes}` : " · Shoot the property, build the number, send it"}
                    {estimate?.sentAt ? " · Estimate sent" : estimate?.lines.length ? " · Draft estimate" : ""}
                    {job.photos.length ? ` · ${job.photos.length} photo${job.photos.length === 1 ? "" : "s"}` : ""}
                  </small>
                </div>
              </button>
              <div className="field-stop-actions">
                <a
                  className="job-nav"
                  href={navigateUrl(job.address || "", prev)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Navigation className="size-5" />
                  Navigate
                </a>
                <button type="button" className="ghost-action hours" onClick={() => onOpenStop(job.id)}>
                  <Camera className="size-4" />
                  On site
                </button>
              </div>
              {customer?.phone ? (
                <a className="field-call" href={`tel:${customer.phone}`}>
                  Call {customer.name.split(" ")[0]}
                </a>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
