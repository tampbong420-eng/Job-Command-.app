"use client";

import { etaFromMiles, formatMiles, milesBetween } from "@/lib/geo";
import { clockLabel, formatLiveHours } from "@/lib/format";
import type { CrewMember, Job } from "@/lib/types";
import { useLiveNow } from "@/lib/use-live-time";

export default function CrewMetrics({
  member,
  job,
}: {
  member: CrewMember;
  job: Job | null;
}) {
  const now = useLiveNow();
  const miles =
    member.lat != null &&
    member.lng != null &&
    job?.lat != null &&
    job?.lng != null
      ? milesBetween(
          { lat: member.lat, lng: member.lng },
          { lat: job.lat, lng: job.lng },
        )
      : null;

  return (
    <section className="plate metrics-grid" aria-label="Crew metrics">
      <div className="metric">
        <p className="metric-label">Live hours</p>
        <b>
          {member.status === "off"
            ? `${member.weeklyHoursLogged}h`
            : now === 0
              ? "—"
              : formatLiveHours(member.startedAt, now)}
        </b>
      </div>
      <div className={`metric clock ${member.status === "off" ? "off" : "on"}`}>
        <p className="metric-label">Clock</p>
        <b>{clockLabel(member.status)}</b>
      </div>
      <div className="metric distance">
        <p className="metric-label">Distance</p>
        <b>
          {member.status === "off"
            ? "GPS off"
            : `${formatMiles(miles)}${miles != null ? ` · ${etaFromMiles(miles)}` : ""}`}
        </b>
      </div>
    </section>
  );
}
