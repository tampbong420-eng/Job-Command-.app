"use client";

import { formatClockTime, greeting, longDate } from "@/lib/format";
import type { CrewMember, Job } from "@/lib/types";
import { useMemo, useState } from "react";

export default function EmployeeHome({
  member,
  jobs,
}: {
  member: CrewMember;
  jobs: Job[];
}) {
  const [onClock, setOnClock] = useState(member.status === "active");
  const firstStop = useMemo(() => {
    return (
      jobs.find((job) => job.id === member.currentJobId) ??
      jobs.find((job) => job.workerId === member.id && job.status === "in_progress") ??
      jobs.find((job) => job.status === "in_progress") ??
      null
    );
  }, [jobs, member]);

  return (
    <section className="page">
      <div className="greeting-row">
        <div>
          <p className="section-kicker">{longDate()}</p>
          <h1>
            {greeting()},
            <br />
            <strong>{(member.name.split(" ")[0] ?? "Crew").toUpperCase()}.</strong>
          </h1>
        </div>
        <div className={`status-pill ${onClock ? "active" : ""}`}>
          <span className="status-dot" />
          {onClock ? "ON THE CLOCK" : "OFF THE CLOCK"}
        </div>
      </div>

      <article className="plate shift-card">
        <div className="shift-card-top">
          <div className="shift-icon" aria-hidden="true">
            ◷
          </div>
          <div>
            <p className="card-label">Today&apos;s shift</p>
            <p className={`shift-time ${onClock ? "live" : ""}`}>
              {onClock
                ? `Active since ${formatClockTime(member.startedAt)}`
                : "Not started yet"}
            </p>
          </div>
          <span className="shift-tag">{onClock ? "ACTIVE" : "READY"}</span>
        </div>
        <div className="shift-line">
          <span />
          <span />
          <span />
        </div>
        <div className="shift-foot">
          <span>First stop</span>
          <strong>
            {firstStop
              ? `${firstStop.scheduledTime} · ${firstStop.customerName}`
              : "No jobs queued"}
          </strong>
        </div>
      </article>

      <article className="plate gps-card">
        <div className="gps-card-top">
          <div className="shift-icon" aria-hidden="true">
            ◎
          </div>
          <div>
            <p className="card-label">Live GPS</p>
            <p className={`gps-line ${onClock ? "live" : ""}`}>
              {onClock
                ? "Sharing live · stay on this job until clock out"
                : "Off the clock — location is not shared"}
            </p>
          </div>
        </div>
      </article>

      <button
        type="button"
        className={`command-button clock-button${onClock ? " clocked" : ""}`}
        onClick={() => setOnClock((value) => !value)}
      >
        <span className="button-icon" aria-hidden="true">
          ◷
        </span>
        <span className="button-copy">
          <small>{onClock ? "Shift active" : "Start your shift"}</small>
          <b>{onClock ? "Clock out" : "Clock in"}</b>
        </span>
        <span className="button-arrow">↗</span>
      </button>
    </section>
  );
}
