"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { setJobPipeline } from "@/app/actions";
import { StageFrame } from "@/components/command/StageFrame";
import { formatDay, todayString } from "@/lib/dates";
import type { PipeFacts } from "@/lib/job-pipeline";
import {
  applyYellowTalk,
  canCheckPrepItem,
  inferTrade,
  materialPrepItems,
  materialsReady,
  parsePrep,
  scheduleDays,
  stringifyPrep,
  yellowItemStates,
  yellowPrepComplete,
  type CrewSeat,
  type PrepState,
} from "@/lib/job-prep";
import { updateJobOffline, upsertHoursOffline } from "@/lib/offline/actions";
import { formatTimeLabel, hoursBetween, personBusyOnDates } from "@/lib/schedule";
import type { JobStageKey } from "@/lib/page-theme";
import type { CustomerDTO, EmployeeDTO, EstimateDTO, JobDTO } from "@/lib/types";

function seatsFromState(prep: PrepState, assigned: EmployeeDTO[], employees: EmployeeDTO[]): CrewSeat[] {
  if (prep.crew?.length) return prep.crew;
  if (assigned[0]) return [{ employeeId: assigned[0].id, trade: inferTrade(assigned[0].jobTitle) }];
  if (employees[0]) return [{ employeeId: employees[0].id, trade: inferTrade(employees[0].jobTitle) }];
  return [];
}

export function YellowPrepStage({
  job,
  customer,
  employees,
  estimate,
  facts,
  actor,
  now,
  shop: _shop,
  onClose,
  onAdvance,
  onScheduleTime,
}: {
  job: JobDTO;
  customer: CustomerDTO | null;
  employees: EmployeeDTO[];
  estimate: EstimateDTO | null;
  facts: PipeFacts;
  actor: string;
  now: Date;
  shop?: string;
  onClose: () => void;
  onAdvance?: (key: JobStageKey) => void;
  onScheduleTime?: () => void;
}) {
  const [, startTransition] = useTransition();
  const today = todayString(now);
  const who = customer?.name || job.client;
  const items = useMemo(() => materialPrepItems(estimate), [estimate]);
  const assigned = useMemo(
    () =>
      employees.filter((person) =>
        person.timeEntries.some((entry) => entry.jobId === job.id && entry.scheduledHours > 0)
      ),
    [employees, job.id]
  );
  const bookedWhen = useMemo(() => {
    const seen = new Map<string, { date: string; start: string; end: string | null }>();
    for (const employee of employees) {
      for (const entry of employee.timeEntries) {
        if (entry.jobId !== job.id || !entry.scheduledStart || entry.scheduledHours <= 0) continue;
        const key = `${entry.date}|${entry.scheduledStart}|${entry.scheduledEnd || ""}`;
        if (!seen.has(key)) seen.set(key, { date: entry.date, start: entry.scheduledStart, end: entry.scheduledEnd });
      }
    }
    const slots = [...seen.values()].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
    return slots.find((slot) => slot.date >= today) || slots[slots.length - 1] || null;
  }, [employees, job.id, today]);
  const initial = parsePrep(job.prepChecklist);
  const [prep, setPrep] = useState<PrepState>(initial);
  const [startDate, setStartDate] = useState(job.dueDate || bookedWhen?.date || today);
  const [seats, setSeats] = useState<CrewSeat[]>(() => seatsFromState(initial, assigned, employees));
  const [shiftStart, setShiftStart] = useState(bookedWhen?.start || "07:00");
  const [shiftEnd, setShiftEnd] = useState(bookedWhen?.end || "15:00");
  const [durationDays, setDurationDays] = useState(initial.durationDays ?? 0);
  const [daysDirty, setDaysDirty] = useState(false);
  const [dispatchNotes, setDispatchNotes] = useState(initial.dispatchNotes || "");
  const [localStartLock, setLocalStartLock] = useState(Boolean(job.dueDate) || facts.startDate || Boolean(bookedWhen));
  const [localCrewLock, setLocalCrewLock] = useState(
    (Boolean(job.dueDate) || facts.startDate || Boolean(bookedWhen)) && (assigned.length > 0 || facts.crewAssigned)
  );
  const stampedStart = useRef<string | null>(job.dueDate);

  const startLocked = Boolean(job.dueDate) || facts.startDate || localStartLock || Boolean(bookedWhen);
  const crewLocked = startLocked && (assigned.length > 0 || facts.crewAssigned || localCrewLock);
  const matsReady = materialsReady(items, prep);
  const yellowMarks = yellowItemStates(startLocked, crewLocked, items, prep);
  const yellowReady =
    startLocked === true &&
    crewLocked === true &&
    items.length > 0 &&
    items.every((item) => prep.materials[item.id] === true) &&
    yellowPrepComplete(startLocked, crewLocked, items, prep);
  const liveFacts: PipeFacts = {
    ...facts,
    startDate: startLocked,
    crewAssigned: crewLocked,
    materialsReady: matsReady,
  };
  const nextOpenIndex = items.findIndex(
    (item, index) => canCheckPrepItem(index, items, prep, startLocked, crewLocked) && prep.materials[item.id] !== true
  );
  const shownDate = job.dueDate || bookedWhen?.date || (startLocked ? startDate : "");

  useEffect(() => {
    const next = parsePrep(job.prepChecklist);
    setPrep(next);
    if (!daysDirty) setDurationDays(next.durationDays ?? 0);
    if (next.dispatchNotes) setDispatchNotes(next.dispatchNotes);
    if (next.crew?.length) setSeats(next.crew);
  }, [job.prepChecklist, daysDirty]);

  useEffect(() => {
    if (job.dueDate) {
      setStartDate(job.dueDate);
      setLocalStartLock(true);
      stampedStart.current = job.dueDate;
    }
  }, [job.dueDate]);

  const bookedKey = bookedWhen ? `${bookedWhen.date}|${bookedWhen.start}|${bookedWhen.end || ""}` : "";

  useEffect(() => {
    if (!bookedWhen) return;
    setStartDate(bookedWhen.date);
    setShiftStart(bookedWhen.start);
    if (bookedWhen.end) setShiftEnd(bookedWhen.end);
    setLocalStartLock(true);
    if (assigned.length) setLocalCrewLock(true);
  }, [bookedKey, assigned.length, bookedWhen]);

  useEffect(() => {
    if (job.dueDate || !bookedWhen || stampedStart.current === bookedWhen.date) return;
    const date = bookedWhen.date;
    stampedStart.current = date;
    startTransition(async () => {
      try {
        await updateJobOffline({ jobId: job.id, dueDate: date, actor });
      } catch (error) {
        stampedStart.current = job.dueDate;
        toast.error(error instanceof Error ? error.message : "Could not lock the start day.");
      }
    });
  }, [job.dueDate, job.id, bookedKey, bookedWhen, actor]);

  useEffect(() => {
    if (assigned.length && !seats.length) {
      setSeats(assigned.map((person) => ({ employeeId: person.id, trade: inferTrade(person.jobTitle) })));
      setLocalCrewLock(true);
    }
  }, [assigned, seats.length]);

  function packPrep(next: PrepState): PrepState {
    return {
      ...next,
      durationDays,
      dispatchNotes,
      crew: seats,
    };
  }

  function persistPrep(next: PrepState) {
    const packed = packPrep(next);
    setPrep(packed);
    startTransition(async () => {
      try {
        await updateJobOffline({ jobId: job.id, prepChecklist: stringifyPrep(packed), actor });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save the checklist.");
      }
    });
  }

  async function writeSchedule(
    nextStart: string,
    nextSeats: CrewSeat[],
    days: number,
    notes: string,
    start: string,
    end: string,
    materials?: Record<string, boolean>
  ) {
    const dates = scheduleDays(nextStart, days);
    const span = dates.length ? dates : [nextStart];
    const blocked = nextSeats.find((seat) =>
      personBusyOnDates(employees, {
        employeeId: seat.employeeId,
        dates: span,
        start,
        end,
        jobId: job.id,
      })
    );
    if (blocked) {
      const hit = personBusyOnDates(employees, {
        employeeId: blocked.employeeId,
        dates: span,
        start,
        end,
        jobId: job.id,
      });
      const name = employees.find((row) => row.id === blocked.employeeId)?.firstName || "That crew";
      throw new Error(`${name} is already on ${hit?.jobName || "another job"} ${formatTimeLabel(hit?.start || null)}.`);
    }
    const hours = hoursBetween(start, end);
    const pack: PrepState = {
      ...prep,
      materials: materials || prep.materials,
      durationDays: days,
      dispatchNotes: notes,
      crew: nextSeats,
    };
    await updateJobOffline({ jobId: job.id, dueDate: nextStart, prepChecklist: stringifyPrep(pack), actor });
    setPrep(pack);
    // Write every seat/day, collecting failures instead of aborting on the first one:
    // a mid-loop throw used to leave a silent partial booking. Upserts are idempotent,
    // so a retry completes whatever is listed in the error.
    const failures: string[] = [];
    for (const date of dates) {
      for (const seat of nextSeats) {
        try {
          await upsertHoursOffline({
            employeeId: seat.employeeId,
            date,
            scheduledHours: hours,
            actualHours: 0,
            jobId: job.id,
            serviceCodeId: null,
            notes: notes || `${seat.trade} · ${days} day job`,
            scheduledStart: start,
            scheduledEnd: end,
            actor,
          });
        } catch (error) {
          const who = employees.find((row) => row.id === seat.employeeId)?.firstName || "crew";
          failures.push(`${formatDay(date)} · ${who}`);
        }
      }
    }
    if (failures.length) {
      throw new Error(`Couldn't save ${failures.join(", ")}. Tap again to finish booking.`);
    }
    setLocalStartLock(true);
    setLocalCrewLock(true);
    setDaysDirty(false);
  }

  function toggleMaterial(index: number) {
    const item = items[index];
    if (!item) return;
    const checked = prep.materials[item.id] === true;
    if (checked) {
      const materials = { ...prep.materials };
      for (let i = index; i < items.length; i += 1) materials[items[i].id] = false;
      persistPrep({ ...prep, materials });
      return;
    }
    persistPrep({ ...prep, materials: { ...prep.materials, [item.id]: true } });
  }

  function hearPrep(text: string) {
    const heard = text.trim();
    if (!heard) return;
    const hit = applyYellowTalk(heard, items, prep, startLocked, crewLocked, employees, startDate || today);
    const nextStart = hit.startDate || startDate;
    const nextSeats = hit.crew?.length ? hit.crew : seats;
    const nextShiftStart = hit.shiftStart || shiftStart;
    const nextShiftEnd = hit.shiftEnd || shiftEnd;
    const nextDays = hit.durationDays ?? durationDays;
    const nextNotes = hit.dispatchNotes || dispatchNotes;
    if (hit.startDate) setStartDate(hit.startDate);
    if (hit.crew?.length) setSeats(hit.crew);
    if (hit.shiftStart) setShiftStart(hit.shiftStart);
    if (hit.shiftEnd) setShiftEnd(hit.shiftEnd);
    if (hit.durationDays != null) {
      setDurationDays(hit.durationDays);
      setDaysDirty(true);
    }
    if (hit.dispatchNotes) setDispatchNotes(hit.dispatchNotes);

    const shouldSave = Boolean((hit.startDate || hit.crewId || hit.durationDays != null || hit.dispatchNotes) && nextSeats.length && nextStart);
    if (shouldSave) {
      startTransition(async () => {
        try {
          await writeSchedule(
            nextStart,
            nextSeats,
            nextDays,
            nextNotes,
            nextShiftStart,
            nextShiftEnd,
            hit.prep.materials
          );
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not save crew dates.");
        }
      });
    }

    const startOk = startLocked || Boolean(hit.startDate) || shouldSave;
    const crewOk = crewLocked || Boolean(hit.crewId) || shouldSave;
    if (!startOk || !crewOk) {
      toast.message("Who's heading up the crew, and what day are we rolling out?");
      return;
    }
    const marked = items.filter((item) => hit.prep.materials[item.id] === true && prep.materials[item.id] !== true);
    if (shouldSave) {
      if (marked.length) toast.success(`Checked off ${marked.map((item) => item.label).join(", ")}.`);
      else toast.success("Got it — the time is on the Jobs schedule.");
      return;
    }
    if (!marked.length) {
      if (nextOpenIndex >= 0) {
        toast.message(`Next up: ${items[nextOpenIndex].label}. Say it’s bought.`);
        return;
      }
      toast.message("I didn’t catch a material. Say paint, wood, or supplies are bought.");
      return;
    }
    persistPrep({
      ...hit.prep,
      durationDays: nextDays,
      dispatchNotes: nextNotes,
      crew: nextSeats,
    });
    toast.success(`Checked off ${marked.map((item) => item.label).join(", ")}.`);
  }

  function signOffPrep() {
    const everyYellowTrue = yellowMarks.every((row) => row.done === true);
    if (!yellowReady || !everyYellowTrue) {
      toast.error("Finish every pre-job check on this yellow screen first.");
      return;
    }
    startTransition(async () => {
      try {
        await setJobPipeline({ jobId: job.id, pipeline: Math.max(job.pipeline, 3), actor });
        toast.success("Prep is locked. Active / On job is a different color on Command.");
        onAdvance?.("active");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not lock prep.");
      }
    });
  }

  const crewName =
    assigned.map((person) => `${person.firstName} ${person.lastName}`).join(", ") ||
    seats
      .map((seat) => {
        const person = employees.find((row) => row.id === seat.employeeId);
        return person ? `${person.firstName} · ${seat.trade}` : seat.trade;
      })
      .join(", ") ||
    "Nobody on this job yet";

  return (
    <StageFrame
      job={job}
      stage="schedule"
      facts={liveFacts}
      kicker="Step 3 of 6 · Crew"
      who={who}
      actor={actor}
      onClose={onClose}
      onAdvance={onAdvance}
      onHeard={hearPrep}
    >
      <p className="pipe-copy">
        The visit is done. Schedule the work day on the Jobs board. Materials and dispatch notes stay here. Clock-in is
        the next step.
      </p>
      <div data-yellow-prep="1">
        <button
          type="button"
          className={`est-schedule-go${bookedWhen ? " btn-settled" : ""}`}
          onClick={() => onScheduleTime?.()}
        >
          Schedule Time
        </button>
        {bookedWhen ? (
          <p className="visit-when">
            {formatDay(bookedWhen.date)} · {formatTimeLabel(bookedWhen.start)}
            {bookedWhen.end ? `–${formatTimeLabel(bookedWhen.end)}` : ""}
          </p>
        ) : null}
        <ol className="prep-list" data-stage-form="schedule-prep">
          <li className={startLocked ? "on" : ""}>
            <span>1</span>
            <div>
              <b>Start date confirmed</b>
              <small>{shownDate ? formatDay(shownDate, "EEE MMM d") : "Not saved yet"}</small>
            </div>
          </li>
          <li className={crewLocked ? "on" : ""}>
            <span>2</span>
            <div>
              <b>Crew assigned</b>
              <small>{crewName}</small>
            </div>
          </li>
          {items.map((item, index) => {
            const checked = prep.materials[item.id] === true;
            return (
              <li key={item.id} className={checked ? "on" : ""}>
                <span>{index + 3}</span>
                <label>
                  <input type="checkbox" checked={checked} onChange={() => toggleMaterial(index)} />
                  <b>{item.label}</b>
                  <small>
                    {item.kind === "paint" ? "Paint" : item.kind === "wood" ? "Wood" : "Supplies"}
                    {item.id.startsWith("line:") ? " · from the estimate" : " · load-out"}
                  </small>
                </label>
              </li>
            );
          })}
        </ol>
        <label className="settings-field" data-yellow-dispatch="1">
          Dispatch notes
          <textarea
            value={dispatchNotes}
            rows={2}
            onChange={(event) => setDispatchNotes(event.target.value)}
            onBlur={() => persistPrep({ ...prep, dispatchNotes })}
          />
        </label>
        <button
          type="button"
          className={`lead-advance schedule${yellowReady ? " btn-settled" : " btn-next-action"}`}
          data-stage-complete="schedule"
          data-yellow-ready={yellowReady ? "true" : "false"}
          disabled={!yellowReady}
          onClick={signOffPrep}
        >
          {yellowReady ? "Prep complete" : "Finish every yellow box first"}
        </button>
        <p className="lead-swipe-hint">Finish every yellow box. Swipe up for the job site. Swipe down to go back.</p>
      </div>
    </StageFrame>
  );
}
