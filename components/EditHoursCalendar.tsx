"use client";

import {
  WEEKDAY_LABEL,
  WEEKDAY_SHORT,
  formatHourLabel,
  patchDay,
  scheduledHours,
} from "@/lib/schedule";
import { clockLabel, formatLiveHours } from "@/lib/format";
import type { CrewMember, DaySchedule } from "@/lib/types";
import { useLiveNow } from "@/lib/use-live-time";
import { useState } from "react";

export default function EditHoursCalendar({
  member,
  onSave,
  onCancel,
}: {
  member: CrewMember;
  onSave: (schedule: DaySchedule[]) => void;
  onCancel: () => void;
}) {
  const [schedule, setSchedule] = useState<DaySchedule[]>(member.weeklySchedule);
  const now = useLiveNow();
  const onDuty = member.status !== "off";
  const hours = scheduledHours(schedule);

  return (
    <section className="page hours-desk">
      <div className="hours-head">
        <button type="button" className="text-back" onClick={onCancel}>
          ← Crew
        </button>
        <p className="section-kicker">Weekly schedule</p>
        <h1>Edit hours</h1>
        <p className="hours-person">{member.name}</p>
      </div>

      <div className="hours-status-row">
        <div className={`live-chip ${onDuty ? "on" : "off"}`}>
          <p className="metric-label">Live hours</p>
          <b>
            {!onDuty
              ? `${member.weeklyHoursLogged}h`
              : now === 0
                ? "—"
                : formatLiveHours(member.startedAt, now)}
          </b>
        </div>
        <span className={`status-pill ${member.status}`}>
          <span className="status-dot" />
          {clockLabel(member.status)}
        </span>
        <div className="live-chip">
          <p className="metric-label">Planned</p>
          <b>{hours}h</b>
        </div>
      </div>

      <ol className="week-calendar">
        {schedule.map((day) => (
          <li key={day.day} className={`day-card${day.off ? " is-off" : ""}`}>
            <div className="day-card-top">
              <b>
                <span aria-hidden="true">{WEEKDAY_SHORT[day.day]}</span>
                {WEEKDAY_LABEL[day.day]}
              </b>
              <label className="off-toggle">
                <input
                  type="checkbox"
                  checked={!day.off}
                  onChange={(event) =>
                    setSchedule((current) =>
                      patchDay(current, day.day, { off: !event.target.checked }),
                    )
                  }
                />
                {day.off ? "Off" : "On"}
              </label>
            </div>
            <div className="day-times">
              <label>
                Start
                <input
                  type="time"
                  value={day.start}
                  disabled={day.off}
                  onChange={(event) =>
                    setSchedule((current) =>
                      patchDay(current, day.day, { start: event.target.value }),
                    )
                  }
                />
              </label>
              <label>
                End
                <input
                  type="time"
                  value={day.end}
                  disabled={day.off}
                  onChange={(event) =>
                    setSchedule((current) =>
                      patchDay(current, day.day, { end: event.target.value }),
                    )
                  }
                />
              </label>
            </div>
            <p className="day-summary">
              {day.off
                ? "Not scheduled"
                : `${formatHourLabel(day.start)}–${formatHourLabel(day.end)}`}
            </p>
          </li>
        ))}
      </ol>

      <div className="hours-actions">
        <button type="button" className="ghost-action" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="lock-button locked"
          onClick={() => onSave(schedule)}
        >
          <span className="button-icon" aria-hidden="true">
            ◷
          </span>
          <span>
            <small>{hours} hours this week</small>
            <b>Save hours</b>
          </span>
        </button>
      </div>
    </section>
  );
}
