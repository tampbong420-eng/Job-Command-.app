"use client";

import { clockLabel, formatLiveHours, initials, wrapIndex } from "@/lib/format";
import { scheduleOverview, WEEKDAY_SHORT } from "@/lib/schedule";
import type { CrewMember, Job } from "@/lib/types";
import { useLiveNow } from "@/lib/use-live-time";
import { useSwipe } from "@/lib/use-swipe";

export default function CrewRolodex({
  crew,
  index,
  property,
  onIndexChange,
  onEditHours,
  onGetDirections,
}: {
  crew: CrewMember[];
  index: number;
  property: Job | null;
  onIndexChange: (index: number) => void;
  onEditHours: () => void;
  onGetDirections: () => void;
}) {
  const member = crew[index];
  const now = useLiveNow();
  const swipe = useSwipe((delta) => {
    onIndexChange(wrapIndex(index, delta, crew.length));
  }, "x", 72);

  if (!member) return null;

  const onDuty = member.status !== "off";
  const liveHours = !onDuty
    ? `${member.weeklyHoursLogged}h logged`
    : now === 0
      ? "—"
      : formatLiveHours(member.startedAt, now);

  return (
    <section
      className={`rolodex-strip${swipe.dragging ? " is-dragging" : ""}`}
      aria-label="Crew rolodex"
      onPointerDown={swipe.onPointerDown}
      onPointerMove={swipe.onPointerMove}
      onPointerUp={swipe.onPointerUp}
      onPointerCancel={swipe.onPointerUp}
      style={{
        transform: swipe.dragging
          ? `translateX(${Math.max(-48, Math.min(48, swipe.drag * 0.28))}px)`
          : undefined,
      }}
    >
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
          <p>{member.id.toUpperCase()}</p>
        </div>
        <span className={`status-pill ${member.status}`} aria-live="polite">
          <span className="status-dot" />
          {clockLabel(member.status)}
        </span>
      </div>

      <div className="crew-card-meta">
        <div className={`live-chip ${onDuty ? "on" : "off"}`}>
          <p className="metric-label">Live hours</p>
          <b>{liveHours}</b>
        </div>
        <div className="schedule-overview">
          <p className="metric-label">Week</p>
          <div className="week-strip" aria-hidden="true">
            {member.weeklySchedule.map((day) => (
              <span
                key={day.day}
                className={day.off ? "off" : "on"}
                title={day.day}
              >
                {WEEKDAY_SHORT[day.day]}
              </span>
            ))}
          </div>
          <b>{scheduleOverview(member.weeklySchedule)}</b>
        </div>
      </div>

      <div className="rolodex-actions">
        <button
          type="button"
          className="ghost-action directions"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onGetDirections}
          disabled={!property}
        >
          Get Directions
        </button>
        <button
          type="button"
          className="ghost-action hours"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onEditHours}
        >
          Edit Hours
        </button>
      </div>

      <p className="swipe-hint">Swipe crew</p>
      <div className="rolodex-dots">
        {crew.map((row, i) => (
          <button
            key={row.id}
            type="button"
            className={i === index ? "on" : ""}
            aria-label={`Show ${row.name}`}
            aria-pressed={i === index}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onIndexChange(i)}
          />
        ))}
      </div>
    </section>
  );
}
