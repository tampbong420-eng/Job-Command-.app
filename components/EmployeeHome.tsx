"use client";

import { assignedJob, onClockCrew } from "@/lib/assign";
import { clockLabel, formatLiveHours } from "@/lib/format";
import { scheduleOverview } from "@/lib/schedule";
import type { CrewMember, Job } from "@/lib/types";
import { useLiveClockTime, useLiveDate, useLiveGreeting, useLiveNow } from "@/lib/use-live-time";
import { useMemo } from "react";

export default function EmployeeHome({
  member,
  crew,
  jobs,
  onToggleClock,
  onDirections,
}: {
  member: CrewMember;
  crew: CrewMember[];
  jobs: Job[];
  onToggleClock: () => void;
  onDirections: (job: Job) => void;
}) {
  const date = useLiveDate();
  const hello = useLiveGreeting();
  const since = useLiveClockTime(member.startedAt);
  const now = useLiveNow();
  const onClock = member.status !== "off";
  const job = assignedJob(jobs, member);
  const live = !onClock
    ? `${member.weeklyHoursLogged}h this week`
    : now === 0
      ? "—"
      : formatLiveHours(member.startedAt, now);
  const others = useMemo(
    () => onClockCrew(crew).filter((row) => row.id !== member.id),
    [crew, member.id],
  );

  return (
    <section className="page">
      <div className="greeting-row">
        <div>
          <p className="section-kicker">{date}</p>
          <h1>
            {hello},
            <br />
            <strong>{(member.name.split(" ")[0] ?? "Crew").toUpperCase()}.</strong>
          </h1>
        </div>
        <div className={`status-pill ${member.status}`}>
          <span className="status-dot" />
          {clockLabel(member.status)}
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
              {onClock ? `Active since ${since}` : "Not started yet"}
            </p>
          </div>
          <span className="shift-tag">{onClock ? "LIVE" : "READY"}</span>
        </div>
        <div className="shift-line">
          <span />
          <span />
          <span />
        </div>
        <div className="shift-foot">
          <span>Live hours</span>
          <strong>{live}</strong>
        </div>
        <div className="shift-foot">
          <span>Week</span>
          <strong>{scheduleOverview(member.weeklySchedule)}</strong>
        </div>
      </article>

      <article className="plate gps-card">
        <div className="gps-card-top">
          <div className="shift-icon" aria-hidden="true">
            ◎
          </div>
          <div>
            <p className="card-label">Assigned job</p>
            <p className={`gps-line ${job ? "live" : ""}`}>
              {job
                ? `${job.scheduledTime} · ${job.customerName}`
                : "No active job locked to you"}
            </p>
            {job && <p className="board-copy tight">{job.address}</p>}
          </div>
        </div>
        {job && (
          <button
            type="button"
            className="ghost-action directions job-go"
            onClick={() => onDirections(job)}
          >
            Get Directions
          </button>
        )}
      </article>

      {onClock && others.length > 0 && (
        <article className="plate crew-page">
          <p className="card-label">On-clock crew</p>
          {others.map((row) => (
            <div key={row.id} className="page-row">
              <span>
                {row.name}
                <small>{row.role}</small>
              </span>
              <a className="ghost-action" href={`tel:${row.phone}`}>
                Call
              </a>
            </div>
          ))}
        </article>
      )}

      <button
        type="button"
        className={`clock-tile ${onClock ? "in" : "out"}`}
        aria-pressed={onClock}
        onClick={onToggleClock}
      >
        {onClock ? "Clocked In" : "Clocked Out"}
      </button>
    </section>
  );
}
