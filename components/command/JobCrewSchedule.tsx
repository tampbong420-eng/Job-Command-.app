"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FreeNumberInput } from "@/components/command/FreeNumberInput";
import { upsertHoursOffline } from "@/lib/offline/actions";
import { todayString } from "@/lib/dates";
import {
  addHoursToTime,
  crewAvailability,
  defaultShift,
  formatRangeClock,
  hoursBetween,
  inferShift,
} from "@/lib/schedule";
import { isClosedForDispatch } from "@/lib/job-pipeline";
import type { EmployeeDTO, JobDTO } from "@/lib/types";

type Seat = {
  key: string;
  employeeId: string;
  date: string;
  start: string;
  end: string;
  hours: number;
  entryId?: string;
};

function seatsFromCrew(employees: EmployeeDTO[], jobId: string): Seat[] {
  const seats: Seat[] = [];
  for (const person of employees) {
    for (const entry of person.timeEntries) {
      if (entry.jobId !== jobId || entry.scheduledHours <= 0) continue;
      const shift = inferShift(entry.scheduledHours, entry.scheduledStart, entry.scheduledEnd);
      seats.push({
        key: entry.id,
        employeeId: person.id,
        date: entry.date,
        start: shift.start || "07:00",
        end: shift.end || "15:00",
        hours: entry.scheduledHours,
        entryId: entry.id,
      });
    }
  }
  return seats.sort((a, b) => a.date.localeCompare(b.date) || a.employeeId.localeCompare(b.employeeId));
}

function personName(employees: EmployeeDTO[], id: string) {
  const person = employees.find((row) => row.id === id);
  return person ? `${person.firstName} ${person.lastName}`.trim() : "Crew";
}

export function JobCrewSchedule({
  job,
  employees,
  now,
  actor,
  locked = false,
}: {
  job: JobDTO;
  employees: EmployeeDTO[];
  now: Date;
  actor: string;
  locked?: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const today = todayString(now);
  const [date, setDate] = useState(job.dueDate || today);
  const [hours, setHours] = useState(8);
  const [open, setOpen] = useState(false);
  const [seats, setSeats] = useState(() => seatsFromCrew(employees, job.id));
  const focused = useRef(false);

  useEffect(() => {
    if (focused.current) return;
    setSeats(seatsFromCrew(employees, job.id));
  }, [employees, job.id]);

  const shift = useMemo(() => defaultShift(hours || 8), [hours]);
  const board = crewAvailability(employees, {
    date,
    start: shift.start,
    end: shift.end,
    jobId: job.id,
  });
  const pickable = board.filter((row) => row.state !== "onThisJob");
  const closed = isClosedForDispatch(job.pipeline);

  function write(next: {
    employeeId: string;
    date: string;
    start: string;
    end: string;
    hours: number;
    entryId?: string;
    clear?: boolean;
  }) {
    if (isClosedForDispatch(job.pipeline)) return;
    if (locked) {
      toast.error("Field phones can’t staff a job. Office assigns crew here.");
      return;
    }
    startTransition(async () => {
      try {
        await upsertHoursOffline({
          employeeId: next.employeeId,
          date: next.date,
          scheduledHours: next.clear ? 0 : next.hours,
          actualHours: 0,
          jobId: next.clear ? null : job.id,
          serviceCodeId: null,
          scheduledStart: next.clear ? null : next.start,
          scheduledEnd: next.clear ? null : next.end,
          actor,
          entryId: next.entryId,
        });
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save that crew slot.");
        setSeats(seatsFromCrew(employees, job.id));
      }
    });
  }

  function assign(employeeId: string) {
    const status = board.find((row) => row.employeeId === employeeId);
    if (status?.state === "busy") {
      toast.error(`${status.firstName} is ${status.label.toLowerCase()}.`);
      return;
    }
    const next: Seat = {
      key: `local-${employeeId}-${date}`,
      employeeId,
      date,
      start: shift.start,
      end: shift.end,
      hours: hours || 8,
    };
    focused.current = true;
    setSeats((current) => {
      const without = current.filter((seat) => !(seat.employeeId === employeeId && seat.date === date));
      return [...without, next].sort((a, b) => a.date.localeCompare(b.date) || a.employeeId.localeCompare(b.employeeId));
    });
    setOpen(false);
    write(next);
    toast.success(`${personName(employees, employeeId)} is on ${job.name} ${formatRangeClock(next.start, next.end)}.`);
    window.setTimeout(() => {
      focused.current = false;
    }, 800);
  }

  function patchSeat(seat: Seat, patch: Partial<Seat>) {
    const hoursNext = patch.hours ?? seat.hours;
    const startNext = patch.start ?? seat.start;
    const endNext = patch.end ?? (patch.hours != null ? addHoursToTime(startNext, hoursNext) : seat.end);
    const dateNext = patch.date ?? seat.date;
    const next: Seat = {
      ...seat,
      ...patch,
      hours: hoursNext,
      start: startNext,
      end: endNext,
      date: dateNext,
    };
    focused.current = true;
    setSeats((current) => current.map((row) => (row.key === seat.key ? next : row)));
    write(next);
    window.setTimeout(() => {
      focused.current = false;
    }, 800);
  }

  function removeSeat(seat: Seat) {
    focused.current = true;
    setSeats((current) => current.filter((row) => row.key !== seat.key));
    write({ ...seat, clear: true });
    window.setTimeout(() => {
      focused.current = false;
    }, 800);
  }

  return (
    <section className="crew-desk" data-job-crew-schedule="1">
      <p className="card-label">Crew &amp; schedule</p>
      <p className="pipe-copy">
        Assign people on this job. Busy names are locked if they’re already on another site for that window. Hours land on
        the calendar the moment you tap them.
      </p>
      <div className="choice-row crew-desk-meta">
        <label className="settings-field">
          Date
          <input
            type="date"
            value={date}
            disabled={locked}
            data-no-swipe
            onChange={(event) => setDate(event.target.value)}
            aria-label="Schedule date"
          />
        </label>
        <label className="settings-field">
          Hours
          <span className="hour-step">
            <button
              type="button"
              className="hour-step-btn"
              disabled={locked || hours <= 0}
              aria-label="Fewer hours"
              onClick={() => setHours((current) => Math.max(0, current - 1))}
            >
              −
            </button>
            <FreeNumberInput min={0} integer value={hours} disabled={locked} onValue={setHours} ariaLabel="Hours on site" />
            <button
              type="button"
              className="hour-step-btn"
              disabled={locked}
              aria-label="More hours"
              onClick={() => setHours((current) => Math.min(16, current + 1))}
            >
              +
            </button>
          </span>
        </label>
      </div>
      <p className="crew-desk-window">{formatRangeClock(shift.start, shift.end)} from the shop clock.</p>
      {seats.length ? (
        <ul className="crew-desk-seats">
          {seats.map((seat) => (
            <li key={seat.key}>
              <b>{personName(employees, seat.employeeId)}</b>
              <small>
                {seat.date} · {formatRangeClock(seat.start, seat.end)}
              </small>
              <label className="settings-field">
                Date
                <input
                  type="date"
                  value={seat.date}
                  disabled={locked || closed}
                  data-no-swipe
                  aria-label={`Date for ${personName(employees, seat.employeeId)}`}
                  onChange={(event) => patchSeat(seat, { date: event.target.value })}
                />
              </label>
              <label className="settings-field">
                Hours
                <span className="hour-step">
                  <button
                    type="button"
                    className="hour-step-btn"
                    disabled={locked || closed}
                    aria-label={`Fewer hours for ${personName(employees, seat.employeeId)}`}
                    onClick={() =>
                      patchSeat(seat, { hours: Math.max(0, hoursBetween(seat.start, seat.end) - 1) })
                    }
                  >
                    −
                  </button>
                  <FreeNumberInput
                    min={0}
                    integer
                    value={Math.round(seat.hours)}
                    disabled={locked || closed}
                    ariaLabel={`Hours for ${personName(employees, seat.employeeId)}`}
                    onCommit={(next) => patchSeat(seat, { hours: next })}
                  />
                  <button
                    type="button"
                    className="hour-step-btn"
                    disabled={locked || closed}
                    aria-label={`More hours for ${personName(employees, seat.employeeId)}`}
                    onClick={() => patchSeat(seat, { hours: Math.min(16, (seat.hours || 8) + 1) })}
                  >
                    +
                  </button>
                </span>
              </label>
              {locked || closed ? null : (
                <button type="button" className="ghost-action slim" onClick={() => removeSeat(seat)}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="command-empty">
          {closed ? `${job.code} is closed. Crew assignment stays off this file.` : `Nobody is on ${job.code} yet. Assign crew below.`}
        </p>
      )}
      {locked || closed ? null : (
        <div className="crew-assign">
          <button
            type="button"
            className="ghost-action hours"
            data-assign-crew="1"
            disabled={!employees.length}
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            + Assign crew
          </button>
          {open ? (
            <ul className="crew-pick" data-crew-pick="1" data-no-swipe>
              {employees.length ? (
                pickable.map((row) => {
                  const busy = row.state === "busy";
                  return (
                    <li key={row.employeeId} className={busy ? "busy" : ""}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => assign(row.employeeId)}
                      >
                        <b>
                          {row.firstName} {row.lastName}
                        </b>
                        <small>{busy ? row.label : row.jobTitle || "Available"}</small>
                      </button>
                    </li>
                  );
                })
              ) : (
                <li>Add crew on Company first</li>
              )}
            </ul>
          ) : null}
        </div>
      )}
    </section>
  );
}
