"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { toast } from "sonner";
import { upsertDayHours } from "@/app/actions";
import { CrewHoursList } from "@/components/command/CrewHoursList";
import { FreeNumberInput } from "@/components/command/FreeNumberInput";
import { ScheduleSheet } from "@/components/command/ScheduleSheet";
import { SwipeBlink } from "@/components/command/SwipeBlink";
import { useSwipeFlash } from "@/components/command/SwipeFlash";
import { holdHintDone, markHoldHintDone, nextHoldHint, swipeFlashLabel } from "@/lib/swipe-flash";
import { parseHoursTalk } from "@/lib/hours-talk";
import { upsertHoursOffline } from "@/lib/offline/actions";
import { addCalendarDays, formatDay, monthKey, startOfMonth, todayString } from "@/lib/dates";
import { deriveStatus, liveActualHours } from "@/lib/payroll";
import { useSwipeNav } from "@/hooks/use-swipe-nav";
import { DISPATCH_OUTLINE, dispatchOutline } from "@/lib/job-pipeline";
import { addHoursToTime, defaultShift, hoursBetween, inferShift } from "@/lib/schedule";
import {
  SCHEDULE_VIEW_KEY,
  clockLabel,
  clockShort,
  dateLine,
  dayMarks,
  entryKind,
  filterCounts,
  filterStops,
  isAbsence,
  bookableKind,
  monthDays,
  parseScheduleView,
  stepDay,
  stopHours,
  stopsForDay,
  streetLine,
  totalHours,
  weekDays,
  weekLabel,
  type EntryKind,
  type ScheduleFilter,
  type ScheduleView,
} from "@/lib/schedule-day";
import { jobStageMap } from "@/lib/schedule-stage";
import type { CustomerDTO, EmployeeDTO, EstimateDTO, InvoiceDTO, JobDTO, TimeEntryDTO } from "@/lib/types";

function entryFor(employee: EmployeeDTO, iso: string, now: Date): TimeEntryDTO {
  const rows = employee.timeEntries
    .filter((item) => item.date === iso)
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
  const found =
    rows.find((item) => item.scheduledHours > 0 || (item.scheduledStart && item.scheduledEnd)) || rows[0];
  if (found) {
    const actualHours = liveActualHours(found, now);
    const shift = inferShift(
      found.scheduledHours,
      found.scheduledStart,
      found.scheduledEnd
    );
    return {
      ...found,
      actualHours,
      scheduledStart: shift.start,
      scheduledEnd: shift.end,
      status: deriveStatus({ ...found, actualHours }, now),
    };
  }
  return {
    id: `draft-${iso}`,
    date: iso,
    scheduledHours: 0,
    actualHours: 0,
    clockIn: null,
    clockOut: null,
    scheduledStart: null,
    scheduledEnd: null,
    status: "SCHEDULED",
    jobId: null,
    serviceCodeId: null,
    notes: null,
    job: null,
    serviceCode: null,
  };
}

const ABSENCE_OPTIONS = [
  { id: "", label: "Working" },
  { id: "off", label: "Off" },
  { id: "leave", label: "Leave" },
  { id: "call-out", label: "Call out" },
  { id: "sick", label: "Sick" },
  { id: "vacation", label: "Vacation" },
  { id: "no-call", label: "No call" },
  { id: "personal", label: "Personal" },
] as const;

function absenceKind(entry: { notes: string | null; scheduledHours: number }) {
  const tagged = entry.notes?.match(/^absence:([a-z-]+)/);
  if (tagged) return tagged[1];
  if (entry.scheduledHours === 0) return "off";
  return "";
}

function saveError(error: unknown) {
  const message = error instanceof Error ? error.message : "Could not save.";
  if (/prisma|Unknown argument/i.test(message)) {
    return "Could not save that day.";
  }
  return message;
}

function StopHoursPicker({
  order,
  entry,
  followStart,
  locked,
  draft,
  onDraft,
  onSave,
}: {
  order: number;
  entry: TimeEntryDTO;
  followStart: string;
  locked: boolean;
  draft?: { start: string; end: string };
  onDraft: (id: string, next: { start: string; end: string }) => void;
  onSave: (
    entry: TimeEntryDTO,
    patch: { scheduledStart?: string | null; scheduledEnd?: string | null; scheduledHours?: number }
  ) => void;
}) {
  const start = draft?.start ?? entry.scheduledStart ?? followStart;
  const end = draft?.end ?? entry.scheduledEnd ?? "";
  const hours = start && end && start !== end ? hoursBetween(start, end) : 0;
  const name = entry.job ? `${entry.job.code} · ${entry.job.name}` : "Job";

  function commit(nextStart: string, nextEnd: string) {
    const open = nextStart || followStart;
    onSave(entry, {
      scheduledStart: open,
      scheduledEnd: nextEnd || null,
      scheduledHours: open && nextEnd && open !== nextEnd ? hoursBetween(open, nextEnd) : 0,
    });
  }

  return (
    <div className="stop-hours" data-stop-hours={String(order)}>
      <p className="card-label">
        <b className="stop-num">{order}</b>
        {name}
      </p>
      <div className="day-times">
        <label>
          Start
          <input
            type="time"
            aria-label={`Start for job ${order}`}
            value={start || ""}
            disabled={locked}
            onChange={(event) => onDraft(entry.id, { start: event.target.value, end })}
            onBlur={(event) => commit(event.target.value, end)}
          />
        </label>
        <label>
          End
          <input
            type="time"
            aria-label={`End for job ${order}`}
            value={end || ""}
            disabled={locked}
            onChange={(event) => onDraft(entry.id, { start, end: event.target.value })}
            onBlur={(event) => commit(start, event.target.value)}
          />
        </label>
        <label>
          Hours
          <FreeNumberInput
            min={0}
            ariaLabel={`Hours for job ${order}`}
            value={hours}
            disabled={locked}
            onCommit={(next) => {
              const nextStart = start || followStart;
              const nextEnd = next > 0 ? addHoursToTime(nextStart, next) : "";
              onDraft(entry.id, { start: nextStart, end: nextEnd });
              commit(nextStart, nextEnd);
            }}
          />
        </label>
      </div>
    </div>
  );
}

const KIND_WORD: Record<EntryKind, string> = { JOB: "Job", ESTIMATE: "Estimate" };
const FILTERS: Array<{ id: ScheduleFilter; label: string }> = [
  { id: "ALL", label: "All" },
  { id: "JOB", label: "Jobs" },
  { id: "ESTIMATE", label: "Estimates" },
];

type DaySheet = { type: "day"; entryId: string | null };
type AddSheet = {
  type: "add";
  step: "kind" | "job" | "time";
  kind: EntryKind | null;
  jobId: string | null;
  start: string;
  end: string;
};
type Sheet = DaySheet | AddSheet;

/** Day picked on the last schedule seen, so flipping to the next person keeps the same day. */
let lastPickedDay: string | null = null;

function defaultEnd(kind: EntryKind | null, start: string) {
  if (kind === "ESTIMATE") return addHoursToTime(start, 1);
  return start < "15:00" ? "15:00" : addHoursToTime(start, 2);
}

export function TimesheetBoard({
  employee,
  crew = [],
  jobs,
  customers = [],
  estimates = [],
  invoices = [],
  actor,
  locked,
  canEdit = !locked,
  now,
  periodStart,
  periodEnd,
  onOpenJob,
  addKind = null,
  children,
}: {
  employee: EmployeeDTO;
  crew?: EmployeeDTO[];
  jobs: JobDTO[];
  customers?: CustomerDTO[];
  estimates?: EstimateDTO[];
  invoices?: InvoiceDTO[];
  actor: string;
  /** Inputs disabled: crew, or an approved / paid pay period. */
  locked: boolean;
  /** Office can book; crew only looks. */
  canEdit?: boolean;
  now: Date;
  periodStart: string;
  periodEnd: string;
  onOpenJob?: (jobId: string) => void;
  /** Pre-picks Job or Estimate in "+ Add to schedule" when a stage's Schedule button opened this screen. */
  addKind?: EntryKind | null;
  /** No longer drawn: the approved Light v2 / jobs-logo mockups dropped the shop name from Schedule. */
  shopName?: string;
  onPrevEmployee?: () => void;
  onNextEmployee?: () => void;
  canFlipEmployee?: boolean;
  children?: ReactNode;
}) {
  const today = todayString(now);
  const [selected, setSelected] = useState(() => lastPickedDay ?? today);
  const [spanDays, setSpanDays] = useState<string[]>(() => [lastPickedDay ?? today]);
  const [view, setView] = useState<ScheduleView>("week");
  const [filter, setFilter] = useState<ScheduleFilter>("ALL");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const heldRef = useRef(false);
  const addingRef = useRef(false);
  // Booking writes one stop per day: a double tap must not create the same stop twice.
  const bookingRef = useRef(false);
  const swipeFlash = useSwipeFlash();
  // One-time "Press and hold to select multiple days" (per person on this phone).
  const [holdHint, setHoldHint] = useState({ done: true, showing: false });
  useEffect(() => {
    setHoldHint({ done: holdHintDone(typeof window === "undefined" ? null : window.localStorage, actor), showing: false });
  }, [actor]);
  useEffect(() => {
    setHoldHint((current) => {
      const next = nextHoldHint(current, { picked: spanDays.length });
      if (next.remember) markHoldHintDone(window.localStorage, actor);
      return next.done === current.done && next.showing === current.showing ? current : { done: next.done, showing: next.showing };
    });
  }, [spanDays.length, actor]);
  const holdTimer = useRef<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [hourPatches, setHourPatches] = useState<Record<string, number>>({});
  const month = monthKey(selected);
  // Schedule redesign (Eric 2026-10-07): inline styles only, no CSS classes.
  const isLightSkin =
    typeof document !== "undefined" &&
    ["light", "color"].includes(document.querySelector(".app-shell")?.getAttribute("data-shell") || "");
  const calAccent = isLightSkin ? "#2ee600" : "#b2ff00";
  const calBtn: CSSProperties = {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: calAccent,
  };
  const calArrow: CSSProperties = { ...calBtn, fontSize: 26, padding: "8px 14px", flexShrink: 0 };
  const calExpander: CSSProperties = {
    ...calBtn,
    fontSize: 13,
    fontWeight: "bold",
    padding: "10px 16px",
    color: "var(--wb-ink, #b2ff00)",
  };
  const roster = useMemo(() => (crew.length ? crew : [employee]), [crew, employee]);

  useEffect(() => {
    try {
      setView(parseScheduleView(window.localStorage.getItem(SCHEDULE_VIEW_KEY)));
    } catch {
      /* private mode: stay on week */
    }
  }, []);

  const stageMap = useMemo(
    () => jobStageMap({ jobs, customers, estimates, invoices, employees: roster, now }),
    [jobs, customers, estimates, invoices, roster, now]
  );
  const kindOf = useCallback(
    (entry: { kind?: string | null; jobId: string | null }) => entryKind(entry, (id) => stageMap.get(id)),
    [stageMap]
  );
  const dispatchJobs = jobs.filter((job) => bookableKind(stageMap.get(job.id)) !== null);
  const dayStops = employee.timeEntries
    .filter((entry) => entry.date === selected && entry.jobId && !isAbsence(entry))
    .sort((a, b) => a.id.localeCompare(b.id));
  const shownStops = stopsForDay(employee.timeEntries, selected);
  const counts = filterCounts(shownStops, kindOf);
  const visibleStops = filterStops(shownStops, view === "week" ? filter : "ALL", kindOf);
  const hoursRow = employee.timeEntries
    .filter(
      (entry) => entry.date === selected && (entry.scheduledHours > 0 || (entry.scheduledStart && entry.scheduledEnd))
    )
    .sort((a, b) => a.id.localeCompare(b.id))[0];

  const selectedEntry = entryFor(employee, selected, now);
  const shift = inferShift(
    selectedEntry.scheduledHours,
    selectedEntry.scheduledStart,
    selectedEntry.scheduledEnd
  );
  const [edit, setEdit] = useState<{
    start: string | null;
    end: string | null;
    off: boolean;
  } | null>(null);
  const [stopEdits, setStopEdits] = useState<Record<string, { start: string; end: string }>>({});

  const stopSig = dayStops
    .map((entry) => `${entry.id}:${entry.scheduledStart ?? ""}:${entry.scheduledEnd ?? ""}`)
    .join("|");

  useEffect(() => {
    setEdit(null);
    setHourPatches({});
  }, [
    employee.id,
    selected,
    selectedEntry.scheduledHours,
    selectedEntry.scheduledStart,
    selectedEntry.scheduledEnd,
  ]);

  useEffect(() => {
    setStopEdits({});
  }, [employee.id, selected, stopSig]);

  const start = edit?.start ?? shift.start;
  const end = edit?.end ?? shift.end;
  const off = edit?.off ?? selectedEntry.scheduledHours === 0;
  const shownHours = off || !start || !end ? 0 : hoursBetween(start, end);

  function focusDay(iso: string) {
    lastPickedDay = iso;
    setSelected(iso);
    setSpanDays([iso]);
    addingRef.current = false;
  }

  function save(iso: string, patch: Partial<TimeEntryDTO>, kind?: EntryKind) {
    const current = entryFor(employee, iso, now);
    const start =
      patch.scheduledStart !== undefined ? patch.scheduledStart : current.scheduledStart;
    const end =
      patch.scheduledEnd !== undefined ? patch.scheduledEnd : current.scheduledEnd;
    const scheduledHours =
      start && end
        ? hoursBetween(start, end)
        : (patch.scheduledHours ?? current.scheduledHours);
    startTransition(async () => {
      try {
        await upsertDayHours({
          employeeId: employee.id,
          date: iso,
          scheduledHours,
          actualHours: patch.actualHours ?? current.actualHours,
          scheduledStart: start,
          scheduledEnd: end,
          jobId: patch.jobId !== undefined ? patch.jobId : current.jobId,
          serviceCodeId: current.serviceCodeId,
          notes: patch.notes !== undefined ? patch.notes : current.notes,
          actor,
          entryId: current.id,
          ...(kind ? { kind } : {}),
        });
      } catch (error) {
        setEdit(null);
        toast.error(saveError(error));
      }
    });
  }

  function saveSpan(patch: Partial<TimeEntryDTO>) {
    const days = spanDays.length ? spanDays : [selected];
    startTransition(async () => {
      try {
        for (const iso of days) {
          const current = entryFor(employee, iso, now);
          const startAt = patch.scheduledStart !== undefined ? patch.scheduledStart : current.scheduledStart;
          const endAt = patch.scheduledEnd !== undefined ? patch.scheduledEnd : current.scheduledEnd;
          const scheduledHours =
            startAt && endAt ? hoursBetween(startAt, endAt) : (patch.scheduledHours ?? current.scheduledHours);
          await upsertDayHours({
            employeeId: employee.id,
            date: iso,
            scheduledHours,
            actualHours: patch.actualHours ?? current.actualHours,
            scheduledStart: startAt,
            scheduledEnd: endAt,
            jobId: patch.jobId !== undefined ? patch.jobId : current.jobId,
            serviceCodeId: current.serviceCodeId,
            notes: patch.notes !== undefined ? patch.notes : current.notes,
            actor,
            entryId: current.id.startsWith("draft-") ? undefined : current.id,
          });
        }
      } catch (error) {
        setEdit(null);
        toast.error(saveError(error));
      }
    });
  }

  function clearHold() {
    if (holdTimer.current != null) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  }

  function pressDay(iso: string, event: { clientX: number; clientY: number }) {
    heldRef.current = false;
    clearHold();
    const originX = event.clientX;
    const originY = event.clientY;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - originX;
      const dy = ev.clientY - originY;
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) clearHold();
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      clearHold();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    holdTimer.current = window.setTimeout(() => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      heldRef.current = true;
      setHoldHint((current) => {
        const next = nextHoldHint(current, "long-press");
        return next.showing === current.showing ? current : { done: next.done, showing: next.showing };
      });
      const adding = addingRef.current;
      addingRef.current = true;
      setSelected(iso);
      setSpanDays((current) => {
        const base = adding ? current : [];
        return base.includes(iso) ? base : [...base, iso].sort();
      });
    }, 450);
  }

  function releaseDay() {
    clearHold();
  }

  function pickDay(iso: string) {
    // Always select the tapped day (Eric 2026-10-07 fix: hold detection was blocking taps)
    lastPickedDay = iso;
    setSelected(iso);
    if (spanDays.length > 1) {
      // Multi-pick mode: add to span, tapped becomes big day
      addingRef.current = true;
      setSpanDays((current) => (current.includes(iso) ? current : [...current, iso].sort()));
    } else {
      setSpanDays([iso]);
    }
    addingRef.current = false;
  }

  function dropStop(entry: TimeEntryDTO) {
    return upsertDayHours({
      employeeId: employee.id,
      date: selected,
      scheduledHours: 0,
      actualHours: 0,
      scheduledStart: null,
      scheduledEnd: null,
      jobId: entry.jobId,
      serviceCodeId: null,
      actor,
      entryId: entry.id,
    });
  }

  function removeStop(entry: TimeEntryDTO) {
    startTransition(async () => {
      try {
        await dropStop(entry);
        setSheet(null);
        toast.success(`${entry.job?.client || "Stop"} is off ${formatDay(selected, "EEE MMM d")}.`);
      } catch (error) {
        toast.error(saveError(error));
      }
    });
  }

  function saveStop(
    entry: TimeEntryDTO,
    patch: { scheduledStart?: string | null; scheduledEnd?: string | null; scheduledHours?: number }
  ) {
    const start = patch.scheduledStart !== undefined ? patch.scheduledStart : entry.scheduledStart;
    const end = patch.scheduledEnd !== undefined ? patch.scheduledEnd : entry.scheduledEnd;
    const scheduledHours =
      start && end && start !== end ? hoursBetween(start, end) : (patch.scheduledHours ?? 0);
    startTransition(async () => {
      try {
        await upsertDayHours({
          employeeId: employee.id,
          date: selected,
          scheduledHours,
          actualHours: entry.actualHours,
          scheduledStart: start,
          scheduledEnd: end,
          jobId: entry.jobId,
          serviceCodeId: entry.serviceCodeId,
          notes: entry.notes,
          actor,
          entryId: entry.id,
        });
      } catch (error) {
        setStopEdits((current) => {
          const next = { ...current };
          delete next[entry.id];
          return next;
        });
        toast.error(saveError(error));
      }
    });
  }

  function priorEnd(index: number) {
    for (let i = index - 1; i >= 0; i -= 1) {
      const value = dayStops[i]?.scheduledEnd;
      if (value) return value;
    }
    return selectedEntry.scheduledEnd || end || "15:00";
  }

  /** "Jobs on this day" chips in the day sheet: tap to put a job on the day or take it off. */
  function sinkJob(job: JobDTO | null) {
    const kind = job ? bookableKind(stageMap.get(job.id)) ?? undefined : undefined;
    if (job && !kind) return;
    const picked = job ? dayStops.find((entry) => entry.jobId === job.id) : null;
    if (job && !picked && !hoursRow?.jobId) {
      const next = off ? defaultShift(8) : { start, end };
      if (off) setEdit({ start: next.start, end: next.end, off: false });
      save(
        selected,
        {
          jobId: job.id,
          scheduledHours: off ? 8 : shownHours,
          scheduledStart: next.start,
          scheduledEnd: next.end,
        },
        kind
      );
      return;
    }
    startTransition(async () => {
      try {
        if (!job) {
          for (const entry of dayStops) await dropStop(entry);
          return;
        }
        if (picked) {
          await dropStop(picked);
          return;
        }
        const opens = dayStops[dayStops.length - 1]?.scheduledEnd || hoursRow?.scheduledEnd || end || null;
        await upsertDayHours({
          employeeId: employee.id,
          date: selected,
          scheduledHours: 0,
          actualHours: 0,
          scheduledStart: opens,
          scheduledEnd: null,
          jobId: job.id,
          serviceCodeId: null,
          actor,
          kind,
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save that job.");
      }
    });
  }

  function goMonth(step: -1 | 1) {
    const next = monthKey(addCalendarDays(startOfMonth(`${month}-01`), step < 0 ? -1 : 32));
    focusDay(today.startsWith(next) ? today : `${next}-01`);
  }

  function goDays(days: number) {
    focusDay(stepDay(selected, days).day);
  }

  function toggleView() {
    const next: ScheduleView = view === "week" ? "month" : "week";
    setView(next);
    try {
      window.localStorage.setItem(SCHEDULE_VIEW_KEY, next);
    } catch {
      /* private mode */
    }
    // Folding the month back up leaves the page scrolled past the week strip; bring the calendar back.
    if (next === "week") {
      window.requestAnimationFrame(() =>
        document.querySelector("[data-sched-cal]")?.scrollIntoView({ block: "nearest", behavior: "smooth" })
      );
    }
  }

  function stepMonth(step: -1 | 1) {
    goMonth(step);
    swipeFlash.flash(swipeFlashLabel("month", step));
  }

  function stepWeek(step: -1 | 1) {
    goDays(step * 7);
    swipeFlash.flash(swipeFlashLabel("week", step));
  }

  const monthSwipe = useSwipeNav(
    () => stepMonth(-1),
    () => stepMonth(1),
    { keys: false, threshold: 22, through: "[data-day]", enabled: view === "month" }
  );
  // The week strip swipes too (left/right = previous/next week), same as the month grid.
  const weekSwipe = useSwipeNav(
    () => stepWeek(-1),
    () => stepWeek(1),
    { keys: false, threshold: 22, through: "[data-day]", enabled: view === "week" }
  );

  function hearHours(text: string) {
    const heard = text.trim();
    if (!heard) return;
    if (locked) {
      toast.error("Unlock pay to edit hours.");
      return;
    }
    const hits = parseHoursTalk(heard, roster);
    if (!hits.length) {
      toast.message("Say it like: change Casey's hours to 8.");
      return;
    }
    startTransition(async () => {
      try {
        for (const hit of hits) {
          const person = roster.find((row) => row.id === hit.employeeId);
          if (!person) continue;
          const current = entryFor(person, selected, now);
          const startAt = hit.hours > 0 ? current.scheduledStart || defaultShift(hit.hours).start : null;
          const endAt = hit.hours > 0 && startAt ? addHoursToTime(startAt, hit.hours) : null;
          await upsertHoursOffline({
            employeeId: person.id,
            date: selected,
            scheduledHours: hit.hours,
            actualHours: current.actualHours,
            jobId: hit.hours > 0 ? current.jobId : null,
            serviceCodeId: current.serviceCodeId,
            scheduledStart: startAt,
            scheduledEnd: endAt,
            notes: current.notes,
            actor,
            entryId: current.id.startsWith("draft-") ? undefined : current.id,
          });
        }
        toast.success(
          hits.length === 1
            ? `Got it — ${hits[0].name} is on ${hits[0].hours} hr.`
            : `Got it — updated ${hits.length} people.`
        );
        setHourPatches((current) => {
          const next = { ...current };
          for (const hit of hits) next[hit.employeeId] = hit.hours;
          return next;
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save hours.");
      }
    });
  }
  void hearHours;

  // ---------- Add to schedule ----------
  const pickedDays = spanDays.length ? spanDays : [selected];

  function openAdd() {
    if (locked || !canEdit) return;
    const lastEnd = shownStops
      .map((entry) => entry.scheduledEnd)
      .filter((value): value is string => Boolean(value))
      .sort()
      .pop();
    const startAt = lastEnd || "07:00";
    setSheet({
      type: "add",
      step: addKind ? "job" : "kind",
      kind: addKind,
      jobId: null,
      start: startAt,
      end: defaultEnd(addKind, startAt),
    });
  }

  function book(draft: AddSheet) {
    if (!draft.kind || !draft.jobId) return;
    if (bookingRef.current) return;
    const hours = draft.start && draft.end ? hoursBetween(draft.start, draft.end) : 0;
    if (hours <= 0) {
      toast.error("Pick a start and an end time.");
      return;
    }
    const job = jobs.find((row) => row.id === draft.jobId);
    const kind = draft.kind;
    bookingRef.current = true;
    startTransition(async () => {
      try {
        for (const iso of pickedDays) {
          const current = entryFor(employee, iso, now);
          const booked = employee.timeEntries.some(
            (entry) => entry.date === iso && entry.jobId && !isAbsence(entry)
          );
          // An empty day row (plain shift or "Off") becomes the visit; otherwise this is one more stop.
          const reuse = !booked && !current.id.startsWith("draft-") && !current.jobId;
          await upsertHoursOffline({
            employeeId: employee.id,
            date: iso,
            scheduledHours: hours,
            actualHours: reuse ? current.actualHours : 0,
            jobId: draft.jobId,
            serviceCodeId: reuse ? current.serviceCodeId : null,
            scheduledStart: draft.start,
            scheduledEnd: draft.end,
            notes: reuse ? (isAbsence(current) ? "" : current.notes) : null,
            actor,
            entryId: reuse ? current.id : undefined,
            kind,
          });
        }
        setSheet(null);
        toast.success(
          `${KIND_WORD[kind]} booked: ${job?.client || job?.name || "job"} · ${
            pickedDays.length > 1 ? `${pickedDays.length} days` : formatDay(selected, "EEE MMM d")
          }, ${clockLabel(draft.start)}–${clockLabel(draft.end)}.`
        );
      } catch (error) {
        toast.error(saveError(error));
      } finally {
        bookingRef.current = false;
      }
    });
  }

  // ---------- Pieces ----------
  // Day cell: inline styles only (Eric 2026-10-07 redesign).
  // Picked/multi days stay green, today gets a red outline, last tapped day is solid green.
  function dayTile(iso: string, variant: "week" | "month") {
    const marks = dayMarks(employee.timeEntries, iso, kindOf);
    const inMonth = variant === "week" || iso.startsWith(month);
    const isSelected = iso === selected;
    const isPicked = spanDays.includes(iso) && !isSelected;
    const isToday = iso === today;
    const said = [
      formatDay(iso, "EEE MMM d"),
      marks.job ? "job" : "",
      marks.estimate ? "estimate" : "",
      marks.shift ? "shift" : "",
    ]
      .filter(Boolean)
      .join(", ");
    const borderColor = isSelected ? (isToday ? "#ff0000" : calAccent) : isToday ? "#ff0000" : isPicked ? calAccent : "transparent";
    const background = isSelected ? calAccent : isPicked ? (isLightSkin ? "#e9f7d8" : "#16290a") : "transparent";
    const color = isSelected ? "#0a0a0a" : !inMonth ? "#5a5a5a" : isPicked ? calAccent : "#ffffff";
    return (
      <button
        key={iso}
        type="button"
        data-day={iso}
        aria-label={said}
        aria-pressed={isSelected || isPicked}
        onPointerDown={(event) => pressDay(iso, event)}
        onPointerUp={releaseDay}
        onPointerCancel={releaseDay}
        onContextMenu={(event) => event.preventDefault()}
        onClick={() => pickDay(iso)}
        style={{
          border: `2px solid ${borderColor}`,
          background,
          color,
          borderRadius: 10,
          padding: variant === "week" ? "8px 2px" : "10px 2px",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          minWidth: 0,
          opacity: !inMonth && variant === "month" ? 0.45 : 1,
        }}
      >
        {variant === "week" ? <small style={{ fontSize: 11, color: "#8a8a8a" }}>{formatDay(iso, "EEE")}</small> : null}
        <b style={{ fontSize: variant === "week" ? 18 : 16 }}>{formatDay(iso, "d")}</b>
        <span aria-hidden="true" style={{ display: "flex", gap: 2, width: "100%", padding: "0 8px" }}>
          {marks.job ? <i style={{ display: "block", flex: 1, height: 4, borderRadius: 2, background: "var(--sched-job, #4ade80)" }} /> : null}
          {marks.estimate ? <i style={{ display: "block", flex: 1, height: 4, borderRadius: 2, background: "var(--sched-est, #f97316)" }} /> : null}
          {marks.shift ? <i style={{ display: "block", flex: 1, height: 4, borderRadius: 2, background: "var(--sched-mute, #71717a)" }} /> : null}
        </span>
      </button>
    );
  }

  // Big day cluster: the big number is always the LAST tapped day; other picked
  // days flank it as small boxes that shrink as more are picked (Eric 2026-10-07).
  function renderDayCluster() {
    const otherPicked = spanDays.filter((d) => d !== selected);
    const n = otherPicked.length;
    const boxSize = n <= 1 ? 56 : n === 2 ? 48 : n === 3 ? 42 : n === 4 ? 36 : n === 5 ? 32 : 28;
    const half = Math.ceil(n / 2);
    const box = (iso: string) => (
      <button
        key={iso}
        type="button"
        onClick={() => pickDay(iso)}
        aria-label={`Show ${formatDay(iso, "EEE MMM d")}`}
        style={{
          width: boxSize,
          height: boxSize,
          borderRadius: 10,
          background: isLightSkin ? "#e9f7d8" : "#16290a",
          border: `2px solid ${calAccent}`,
          color: calAccent,
          fontWeight: 900,
          fontSize: Math.max(12, Math.round(boxSize * 0.42)),
          flexShrink: 0,
          cursor: "pointer",
        }}
      >
        {formatDay(iso, "d")}
      </button>
    );
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 116, padding: "8px 0" }}>
        {otherPicked.slice(0, half).map(box)}
        <div style={{ textAlign: "center", minWidth: 104 }}>
          <div style={{ fontSize: 76, fontWeight: 900, lineHeight: 1 }}>{formatDay(selected, "d")}</div>
          <div style={{ fontSize: 14, color: calAccent, marginTop: 4 }}>{formatDay(selected, "EEEE")}</div>
        </div>
        {otherPicked.slice(half).map(box)}
      </div>
    );
  }

  const daySheet = sheet?.type === "day" ? sheet : null;
  const addSheet = sheet?.type === "add" ? sheet : null;
  const focus = daySheet?.entryId ? employee.timeEntries.find((entry) => entry.id === daySheet.entryId) || null : null;
  const focusKind = focus ? kindOf(focus) : undefined;
  const focusPrimary = !focus || focus.id === selectedEntry.id;
  const focusIndex = focus ? dayStops.findIndex((entry) => entry.id === focus.id) : -1;
  const closeSheet = useCallback(() => setSheet(null), []);
  const spanLabel = pickedDays.map((iso) => `${formatDay(iso, "EEE MMM d")}${iso === today ? " · Today" : ""}`).join(" · ");

  const dayTimes = (
    <div className="day-times" id="day-times">
      <label>
        Start
        <input
          type="time"
          value={start ?? "07:00"}
          disabled={locked || pending || off}
          onChange={(event) =>
            setEdit({
              start: event.target.value,
              end: end ?? defaultShift(8).end,
              off: false,
            })
          }
          onBlur={(event) => {
            const nextStart = event.target.value;
            const nextEnd = end ?? defaultShift(8).end;
            if (nextStart !== shift.start) {
              saveSpan({
                scheduledStart: nextStart,
                scheduledEnd: nextEnd,
              });
            }
          }}
        />
      </label>
      <label>
        End
        <input
          type="time"
          value={end ?? "15:00"}
          disabled={locked || pending || off}
          onChange={(event) =>
            setEdit({
              start: start ?? defaultShift(8).start,
              end: event.target.value,
              off: false,
            })
          }
          onBlur={(event) => {
            const nextEnd = event.target.value;
            const nextStart = start ?? defaultShift(8).start;
            if (nextEnd !== shift.end) {
              saveSpan({
                scheduledStart: nextStart,
                scheduledEnd: nextEnd,
              });
            }
          }}
        />
      </label>
      <label>
        Worked
        <FreeNumberInput
          min={0}
          value={selectedEntry.actualHours}
          disabled={locked || pending || Boolean(selectedEntry.clockIn && !selectedEntry.clockOut)}
          onCommit={(next) => {
            if (next !== selectedEntry.actualHours) {
              save(selected, { actualHours: next });
            }
          }}
        />
      </label>
      <label>
        Hours
        <FreeNumberInput
          min={0}
          value={shownHours}
          disabled={locked || pending || off}
          onCommit={(next) => {
            const nextStart = start ?? "07:00";
            const nextEnd = addHoursToTime(nextStart, next);
            setEdit({ start: nextStart, end: nextEnd, off: false });
            saveSpan({
              scheduledStart: nextStart,
              scheduledEnd: nextEnd,
              scheduledHours: next,
            });
          }}
        />
      </label>
    </div>
  );

  const absenceField = (
    <div className="hours-actions">
      <div className="hours-slot">
        <label className="absence-field">
          Day
          <select
            aria-label="Absence"
            data-status={absenceKind(selectedEntry) ? "out" : "working"}
            value={absenceKind(selectedEntry)}
            disabled={locked || pending}
            onChange={(event) => {
              const kind = event.target.value;
              if (!kind) {
                const next = defaultShift(8);
                setEdit({ start: next.start, end: next.end, off: false });
                save(selected, {
                  scheduledHours: 8,
                  scheduledStart: next.start,
                  scheduledEnd: next.end,
                  notes: "",
                });
                return;
              }
              setEdit({ start: null, end: null, off: true });
              save(selected, {
                scheduledHours: 0,
                scheduledStart: null,
                scheduledEnd: null,
                jobId: null,
                notes: `absence:${kind}`,
              });
            }}
          >
            {ABSENCE_OPTIONS.map((option) => (
              <option key={option.id || "working"} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );

  const addChoices = addSheet?.kind
    ? jobs.filter((job) => bookableKind(stageMap.get(job.id)) === addSheet.kind)
    : [];
  const addJob = addSheet?.jobId ? jobs.find((job) => job.id === addSheet.jobId) || null : null;
  const addHours = addSheet && addSheet.start && addSheet.end ? hoursBetween(addSheet.start, addSheet.end) : 0;

  return (
    <section className="hours-desk sched-desk" data-sched-view={view}>
      <div className="command-mast jobs-mast schedule-banner sched-mast">
        {/* Approved Light v2 / jobs-logo mockups: Schedule header is just "Schedule" (no shield, no shop name). */}
        <div className="schedule-title sched-lock">
          <div>
            <h1>Schedule</h1>
          </div>
        </div>
      </div>
      {children}

      {/* Big day cluster: big number is the LAST tapped day; other picked days flank it (Eric 2026-10-07) */}
      {renderDayCluster()}
      {selected !== today ? (
        <div style={{ textAlign: "center", margin: "2px 0 8px" }}>
          <button
            type="button"
            onClick={() => focusDay(today)}
            style={{
              fontSize: 12,
              fontWeight: "bold",
              background: calAccent,
              color: "#0a0a0a",
              border: "none",
              borderRadius: 6,
              padding: "6px 12px",
              cursor: "pointer",
            }}
          >
            Today ↺
          </button>
        </div>
      ) : null}
      {holdHint.showing ? (
        <p role="status" aria-live="polite" data-hold-hint="1" style={{ textAlign: "center", fontSize: 12, color: "#8a8a8a", margin: "4px 0" }}>
          Press and hold to select multiple days
        </p>
      ) : null}
      {swipeFlash.node}
      {spanDays.length > 1 ? (
        <p style={{ textAlign: "center", fontSize: 13, color: "#999", margin: "4px 0" }}>
          {spanDays.length} days picked{" "}
          <button
            type="button"
            onClick={() => focusDay(selected)}
            style={{
              fontSize: 12,
              fontWeight: "bold",
              background: "none",
              border: `1px solid ${calAccent}`,
              color: calAccent,
              borderRadius: 6,
              padding: "4px 10px",
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        </p>
      ) : null}

      {view === "week" ? (
        <div data-sched-cal="1" style={{ margin: "8px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button type="button" onClick={() => stepWeek(-1)} aria-label="Previous week" style={calArrow}>
              ‹
            </button>
            <div data-swipe-local {...weekSwipe.bind} style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
              {weekDays(selected).map((iso) => dayTile(iso, "week"))}
            </div>
            <button type="button" onClick={() => stepWeek(1)} aria-label="Next week" style={calArrow}>
              ›
            </button>
          </div>
          <div style={{ textAlign: "center", marginTop: 6 }}>
            <button type="button" onClick={toggleView} aria-expanded={false} style={calExpander}>
              ▦ Show month ▾
            </button>
          </div>
        </div>
      ) : (
        <div data-sched-cal="1" style={{ margin: "8px 0" }}>
          <div data-swipe-local data-dragging={monthSwipe.dragging ? "1" : "0"} {...monthSwipe.bind}>
            <SwipeBlink storageKey="jc-month-swipe" />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: 4,
                ...(monthSwipe.dragging
                  ? { transform: `translate3d(${Math.max(-40, Math.min(40, monthSwipe.drag))}px,0,0)` }
                  : {}),
              }}
            >
              {["S", "M", "T", "W", "T", "F", "S"].map((label, index) => (
                <span key={`${label}-${index}`} style={{ textAlign: "center", fontSize: 11, color: "#777", padding: "4px 0" }}>
                  {label}
                </span>
              ))}
              {monthDays(month).map((iso) => dayTile(iso, "month"))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", margin: "10px 0 4px", fontSize: 13, color: "#999" }}>
            <span>
              <i style={{ display: "inline-block", width: 14, height: 5, borderRadius: 2, background: "var(--sched-job, #4ade80)", marginRight: 6, verticalAlign: "middle" }} />
              Job
            </span>
            <span>
              <i style={{ display: "inline-block", width: 14, height: 5, borderRadius: 2, background: "var(--sched-est, #f97316)", marginRight: 6, verticalAlign: "middle" }} />
              Estimate
            </span>
          </div>
          {/* Month arrows at the very bottom of the calendar (Eric 2026-10-07) */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 28,
              padding: "10px 0 4px",
              borderTop: "1px solid var(--wb-edge, #2a2a2a)",
            }}
          >
            <button type="button" onClick={() => stepMonth(-1)} aria-label="Previous month" style={calArrow}>
              ‹
            </button>
            <b style={{ fontSize: 16, letterSpacing: 3 }}>{formatDay(`${month}-01`, "MMM yy").toUpperCase()}</b>
            <button type="button" onClick={() => stepMonth(1)} aria-label="Next month" style={calArrow}>
              ›
            </button>
          </div>
          <div style={{ textAlign: "center" }}>
            <button type="button" onClick={toggleView} aria-expanded style={calExpander}>
              ▤ Show week ▴
            </button>
          </div>
        </div>
      )}

      {view === "week" ? (
      <div className="sched-filters" role="group" aria-label="Show on this day">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="sched-filter"
            data-filter={item.id}
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
          >
            {item.id === "JOB" ? <i className="sched-dot job" aria-hidden="true" /> : null}
            {item.id === "ESTIMATE" ? <i className="sched-dot est" aria-hidden="true" /> : null}
            {item.label}
            <em>{counts[item.id]}</em>
          </button>
        ))}
      </div>
      ) : null}

      <div className="sched-stops-head">
        {view === "week" ? (
          <>
            <h2>{formatDay(selected, "EEE MMM d")} · Stops</h2>
            <span>{totalHours(shownStops)} hr scheduled</span>
          </>
        ) : (
          <>
            <h2>{selected === today ? "Today’s stops" : `${formatDay(selected, "EEE MMM d")} · Stops`}</h2>
            <span>
              {shownStops.length} {shownStops.length === 1 ? "stop" : "stops"} · {totalHours(shownStops)} hr
            </span>
          </>
        )}
      </div>
      <div className="sched-stops">
        {visibleStops.map((entry) => {
          const kind = kindOf(entry);
          const hours = stopHours(entry);
          const job = entry.job;
          return (
            <button
              key={entry.id}
              type="button"
              className="sched-stop"
              data-kind={kind}
              onClick={() => setSheet({ type: "day", entryId: entry.id })}
              aria-label={`${KIND_WORD[kind]} ${job?.client || ""} ${clockLabel(entry.scheduledStart)}. Tap to edit.`}
            >
              <span className="sched-stop-time">
                <b>{clockShort(entry.scheduledStart)}</b>
                <small>{entry.scheduledEnd ? `to ${clockLabel(entry.scheduledEnd)}` : "open end"}</small>
              </span>
              <span className="sched-stop-what">
                <b>{job?.client || job?.name || "Job"}</b>
                <span>
                  {job?.name}
                  {job?.code ? ` · ${job.code}` : ""}
                </span>
                {job?.address ? <small>⌖ {streetLine(job.address)}</small> : null}
              </span>
              <span className="sched-stop-side">
                <span className="sched-chip" data-kind={kind}>
                  {KIND_WORD[kind]}
                </span>
                <span className="sched-stop-hrs">
                  {hours || "—"}
                  <small>hr</small>
                </span>
              </span>
            </button>
          );
        })}
        {!visibleStops.length ? (
          <p className="sched-empty">
            {shownStops.length
              ? `No ${filter === "JOB" ? "jobs" : "estimates"} on this day.`
              : ""}
          </p>
        ) : null}
      </div>

      {locked && canEdit ? <p className="locked-note">Unlock pay to edit the schedule</p> : null}
      {!canEdit ? <p className="sched-viewonly">View only. The office books the schedule.</p> : null}
      {canEdit ? (
        <button type="button" className="sched-add" onClick={openAdd} disabled={locked || pending}>
          <b>＋ Add to schedule</b>
          <small>job or estimate</small>
        </button>
      ) : null}

      <div className="sched-stops sched-stops-foot">
        <button type="button" className="sched-dayedit" onClick={() => setSheet({ type: "day", entryId: null })}>
          Day hours &amp; status
          <span>
            {absenceKind(selectedEntry)
              ? ABSENCE_OPTIONS.find((option) => option.id === absenceKind(selectedEntry))?.label
              : shownHours
                ? `${clockLabel(start)}–${clockLabel(end)}`
                : "Off"}{" "}
            ›
          </span>
        </button>
      </div>

      <p className="card-label crew-hours-title">Crew hours · {formatDay(selected, "EEE MMM d")}</p>
      <div data-crew-hours="1">
        <CrewHoursList
          crew={roster}
          date={selected}
          actor={actor}
          locked={locked || pending}
          now={now}
          patches={hourPatches}
        />
      </div>

      <ScheduleSheet
        open={Boolean(daySheet)}
        onClose={closeSheet}
        kicker={spanLabel}
        tone={focusKind}
        title={focus ? focus.job?.client || focus.job?.name || "Stop" : "Day hours & status"}
      >
        {focus?.job ? (
          <div className="sched-sheet-stop" data-kind={focusKind}>
            <span className="sched-chip" data-kind={focusKind}>
              {focusKind ? KIND_WORD[focusKind] : ""}
            </span>
            <p className="sched-sheet-job">
              <b>{focus.job.code}</b> · {focus.job.name}
            </p>
            {focus.job.address ? <p className="sched-sheet-addr">⌖ {focus.job.address}</p> : null}
            <p className="sched-sheet-when">
              {clockLabel(focus.scheduledStart)} – {focus.scheduledEnd ? clockLabel(focus.scheduledEnd) : "open"} ·{" "}
              {stopHours(focus) || 0} hr
            </p>
            <button
              type="button"
              className="sched-open"
              onClick={() => {
                setSheet(null);
                onOpenJob?.(focus.job!.id);
              }}
            >
              Open job folder <span aria-hidden="true">›</span>
            </button>
          </div>
        ) : null}

        {focusPrimary ? (
          <>
            {focus && dayStops.length > 1 && dayStops[0]?.id === selectedEntry.id && dayStops[0].job ? (
              <p className="card-label stop-hours-title">
                <b className="stop-num">1</b>
                {dayStops[0].job.code} · {dayStops[0].job.name}
              </p>
            ) : (
              <p className="card-label">{focus ? "Time on this stop" : "Day hours"}</p>
            )}
            {dayTimes}
          </>
        ) : focus ? (
          <StopHoursPicker
            order={focusIndex + 1}
            entry={focus}
            followStart={priorEnd(focusIndex)}
            locked={locked || pending}
            draft={stopEdits[focus.id]}
            onDraft={(id, next) => setStopEdits((current) => ({ ...current, [id]: next }))}
            onSave={saveStop}
          />
        ) : null}

        {!focus ? (
          <>
            <p className="card-label">Jobs on this day</p>
            <div className="job-sink">
              <button
                type="button"
                className={dayStops.length ? "" : "on"}
                disabled={locked || pending}
                onClick={() => sinkJob(null)}
              >
                None
              </button>
              {dispatchJobs.map((job) => {
                const outline = dispatchOutline(job.pipeline);
                const order = dayStops.findIndex((entry) => entry.jobId === job.id) + 1;
                const kind = bookableKind(stageMap.get(job.id)) || "JOB";
                return (
                  <button
                    key={job.id}
                    type="button"
                    className={order ? "on" : ""}
                    data-dispatch={outline || undefined}
                    data-kind={kind}
                    style={outline ? { outlineColor: DISPATCH_OUTLINE[outline] } : undefined}
                    disabled={locked || pending}
                    onClick={() => sinkJob(job)}
                  >
                    <small>
                      {order ? <b className="stop-num">{order}</b> : null}
                      {job.code} · {KIND_WORD[kind]}
                    </small>
                    {job.name}
                  </button>
                );
              })}
            </div>
            {absenceField}
          </>
        ) : null}

        {focus && canEdit && !locked ? (
          <button type="button" className="sched-remove" disabled={pending} onClick={() => removeStop(focus)}>
            Take off this day
          </button>
        ) : null}
        {locked ? (
          <p className="locked-note">{canEdit ? "Unlock pay to edit the schedule" : "View only. The office edits the schedule."}</p>
        ) : null}
      </ScheduleSheet>

      <ScheduleSheet
        open={Boolean(addSheet)}
        onClose={closeSheet}
        kicker={spanLabel}
        tone={addSheet?.kind || undefined}
        title={
          addSheet?.step === "kind"
            ? "Add to schedule"
            : addSheet?.step === "job"
              ? addSheet.kind === "ESTIMATE"
                ? "Pick a lead to estimate"
                : "Pick a job for the crew"
              : "Set the time"
        }
        footer={
          addSheet?.step === "time" ? (
            <button
              type="button"
              className="sched-add sched-book"
              disabled={pending || addHours <= 0}
              onClick={() => addSheet && book(addSheet)}
            >
              <b>Book {addSheet.kind ? KIND_WORD[addSheet.kind].toLowerCase() : ""}</b>
              <small>{addHours ? `${addHours} hr` : "pick a time"}</small>
            </button>
          ) : null
        }
      >
        {addSheet?.step === "kind" ? (
          <div className="sched-kinds">
            <p className="sched-sheet-ask">What are you booking for {employee.firstName}?</p>
            {(["JOB", "ESTIMATE"] as EntryKind[]).map((kind) => (
              <button
                key={kind}
                type="button"
                className="sched-kind"
                data-kind={kind}
                onClick={() =>
                  setSheet({ ...addSheet, step: "job", kind, jobId: null, end: defaultEnd(kind, addSheet.start) })
                }
              >
                <span className="sched-chip" data-kind={kind}>
                  {KIND_WORD[kind]}
                </span>
                <b>{kind === "JOB" ? "Crew work day" : "Estimate visit"}</b>
                <small>
                  {kind === "JOB"
                    ? "Put them on an approved or active job."
                    : "Walk a lead's property to price it (orange stage)."}
                </small>
              </button>
            ))}
          </div>
        ) : null}

        {addSheet?.step === "job" ? (
          <div className="sched-picks">
            {addChoices.map((job) => (
              <button
                key={job.id}
                type="button"
                className="sched-pick"
                data-kind={addSheet.kind || undefined}
                onClick={() => setSheet({ ...addSheet, step: "time", jobId: job.id })}
              >
                <b>{job.client || job.name}</b>
                <span>
                  {job.name} · {job.code}
                </span>
                {job.address ? <small>⌖ {streetLine(job.address)}</small> : null}
              </button>
            ))}
            {!addChoices.length ? (
              <p className="sched-empty">
                {addSheet.kind === "ESTIMATE"
                  ? "No leads are waiting on an estimate visit. A job shows here on the orange stage."
                  : "No jobs are ready for a crew. A job shows here once its estimate is approved (yellow stage) or while it is active."}
              </p>
            ) : null}
            {!addKind ? (
              <button type="button" className="sched-back" onClick={() => setSheet({ ...addSheet, step: "kind", jobId: null })}>
                ‹ Job or estimate
              </button>
            ) : null}
          </div>
        ) : null}

        {addSheet?.step === "time" && addJob ? (
          <div className="sched-when">
            <div className="sched-pick" data-kind={addSheet.kind || undefined} aria-current="true">
              <b>{addJob.client || addJob.name}</b>
              <span>
                {addJob.name} · {addJob.code}
              </span>
            </div>
            <p className="card-label">
              {pickedDays.length > 1 ? `${pickedDays.length} days` : formatDay(selected, "EEEE, MMM d")}
            </p>
            <div className="day-times sched-add-times">
              <label>
                Start
                <input
                  type="time"
                  value={addSheet.start}
                  onChange={(event) => setSheet({ ...addSheet, start: event.target.value })}
                />
              </label>
              <label>
                End
                <input
                  type="time"
                  value={addSheet.end}
                  onChange={(event) => setSheet({ ...addSheet, end: event.target.value })}
                />
              </label>
              <label>
                Hours
                <FreeNumberInput
                  min={0}
                  value={addHours}
                  onCommit={(next) =>
                    setSheet({ ...addSheet, end: next > 0 ? addHoursToTime(addSheet.start || "07:00", next) : addSheet.start })
                  }
                />
              </label>
            </div>
            <p className="sched-hint">Hold more days on the calendar first to book several at once. A clash with another stop is refused.</p>
            <button type="button" className="sched-back" onClick={() => setSheet({ ...addSheet, step: "job", jobId: null })}>
              ‹ Pick another
            </button>
          </div>
        ) : null}
      </ScheduleSheet>
    </section>
  );
}
