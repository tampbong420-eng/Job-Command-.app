"use client";

import { etaFromMiles, formatMiles, milesBetween } from "@/lib/geo";
import { formatLiveHours } from "@/lib/format";
import type { CrewMember, Job } from "@/lib/types";
import { useLiveNow } from "@/lib/use-live-time";

export default function CrewMetrics({
  member,
  job,
  onToggleClock,
  onToggleGps,
}: {
  member: CrewMember;
  job: Job | null;
  onToggleClock: () => void;
  onToggleGps: () => void;
}) {
  const now = useLiveNow();
  const tracking = member.gpsLive;
  const miles =
    tracking &&
    member.lat != null &&
    member.lng != null &&
    job?.lat != null &&
    job?.lng != null
      ? milesBetween(
          { lat: member.lat, lng: member.lng },
          { lat: job.lat, lng: job.lng },
        )
      : null;
  const onDuty = member.status !== "off";

  return (
    <section className="plate metrics-grid" aria-label="Crew metrics">
      <div className={`metric ${onDuty ? "on" : "off"}`}>
        <p className="metric-label">Live hours</p>
        <b>
          {!onDuty
            ? `${member.weeklyHoursLogged}h`
            : now === 0
              ? "—"
              : formatLiveHours(member.startedAt, now)}
        </b>
      </div>
      <button
        type="button"
        className={`metric clock toggle ${onDuty ? "on" : "off"}`}
        onClick={onToggleClock}
        aria-pressed={onDuty}
      >
        <p className="metric-label">Clock</p>
        <b>{onDuty ? "LIVE" : "OFF"}</b>
        <span className="toggle-hint">{onDuty ? "Tap off" : "Tap on"}</span>
      </button>
      <button
        type="button"
        className={`metric distance toggle ${tracking ? "on" : "off"}`}
        onClick={onToggleGps}
        aria-pressed={tracking}
      >
        <p className="metric-label">Distance</p>
        <b>
          {!tracking
            ? "GPS off"
            : `${formatMiles(miles)}${miles != null ? ` · ${etaFromMiles(miles)}` : ""}`}
        </b>
        <span className="toggle-hint">{tracking ? "Tap mute" : "Tap live"}</span>
      </button>
    </section>
  );
}
