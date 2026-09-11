"use client";

import { initials } from "@/lib/format";
import { scheduleOverview, scheduledHours, WEEKDAY_SHORT } from "@/lib/schedule";
import type { CrewMember, Estimate, Job, TimeCard } from "@/lib/types";

export default function ProfilePage({
  member,
  jobs,
  estimates,
  timeCards,
  crew,
  role,
  employeeId,
  onPickEmployee,
}: {
  member: CrewMember;
  jobs: Job[];
  estimates: Estimate[];
  timeCards: TimeCard[];
  crew: CrewMember[];
  role: "employee" | "boss";
  employeeId: string;
  onPickEmployee: (id: string) => void;
}) {
  const assigned = jobs.filter((job) => job.workerId === member.id && job.status === "in_progress");
  const hours = timeCards
    .filter((row) => row.employeeId === member.id)
    .reduce((sum, row) => sum + row.hours, 0);
  const quotes = estimates.length;

  return (
    <section className="page jobs-board">
      <p className="section-kicker">Profile</p>
      <h1>
        {member.name.split(" ")[0]}
        <br />
        <strong>Card.</strong>
      </h1>
      <article className="plate profile-card">
        <div className="rolodex-person">
          <div className={`crew-photo duty-${member.status}`}>
            {member.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={member.photoUrl} alt="" />
            ) : (
              <span className="initials">{initials(member.name)}</span>
            )}
          </div>
          <div className="rolodex-copy">
            <p className="card-label">{member.role}</p>
            <h2>{member.name}</h2>
            <p>{member.phone}</p>
          </div>
        </div>
        <div className="crew-card-meta">
          <div className="live-chip">
            <p className="metric-label">Logged</p>
            <b>
              {member.weeklyHoursLogged}h / {scheduledHours(member.weeklySchedule)}h
            </b>
          </div>
          <div className="schedule-overview">
            <p className="metric-label">Week</p>
            <div className="week-strip" aria-hidden="true">
              {member.weeklySchedule.map((day) => (
                <span key={day.day} className={day.off ? "off" : "on"}>
                  {WEEKDAY_SHORT[day.day]}
                </span>
              ))}
            </div>
            <b>{scheduleOverview(member.weeklySchedule)}</b>
          </div>
        </div>
        <p className="board-copy">
          {assigned.length} active job{assigned.length === 1 ? "" : "s"} · {hours}h on time
          cards · {quotes} shop estimates
        </p>
      </article>
      {role === "employee" && (
        <>
          <p className="card-label">Who is clocking in</p>
          <div className="identity-grid">
            {crew.map((row) => (
              <button
                key={row.id}
                type="button"
                className={`ghost-action${row.id === employeeId ? " hours" : ""}`}
                onClick={() => onPickEmployee(row.id)}
              >
                {row.name.split(" ")[0]}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
