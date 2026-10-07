"use client";

/**
 * Active on job — the live job page (Step 4 of 6).
 * One scroll: who's on site, paint window, tasks by area, paint & materials, budget (office only),
 * photos, notes & change orders, punch list, crew & schedule, then the single orange Finish job → Invoice.
 * Every write goes through the offline queue. Talking goes through the one floating mic (OneMic).
 */

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  Clock,
  CloudRain,
  Flag,
  Images,
  ListChecks,
  Mail,
  MapPin,
  Megaphone,
  MessageSquare,
  Minus,
  Navigation,
  PaintBucket,
  Phone,
  Plus,
  Receipt,
  Sun,
  Trash2,
  Users,
  Wallet,
  X,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { pageCrew, setJobPipeline } from "@/app/actions";
import { JobCrewSchedule } from "@/components/command/JobCrewSchedule";
import { useVoiceScope, type MicChip } from "@/components/command/OneMic";
import { SiteMap } from "@/components/command/SiteMap";
import { SiteWeather } from "@/components/command/SiteWeather";
import { StageFrame } from "@/components/command/StageFrame";
import { useCrewPings } from "@/hooks/use-crew-pings";
import { useJobPhotos } from "@/hooks/use-job-photos";
import { useOffline } from "@/hooks/use-offline";
import { useSiteWeather } from "@/hooks/use-site-weather";
import {
  TASK_AREAS,
  addMaterial,
  boardOf,
  dropRow,
  live,
  mergeBoards,
  newId,
  nextChangeNumber,
  photoBuckets,
  putBoard,
  starterTasks,
  swatchFor,
  taskStats,
  upsertRow,
  workDay,
  type ActiveBoard,
  type BoardChange,
  type BoardColor,
  type TaskArea,
} from "@/lib/active-board";
import { mailHref, smsHref, telHref } from "@/lib/clients";
import { todayString } from "@/lib/dates";
import { filledThrough, type PipeFacts } from "@/lib/job-pipeline";
import { classifyMaterial, parsePrep, stringifyPrep } from "@/lib/job-prep";
import { navigateUrl, shopAddress } from "@/lib/maps";
import { isLocalId } from "@/lib/offline/idb";
import { clockTodayOffline, updateJobOffline, upsertHoursOffline } from "@/lib/offline/actions";
import type { JobStageKey } from "@/lib/page-theme";
import { isInteriorJob, paintWindow } from "@/lib/paint-window";
import { useShopPlace } from "@/components/command/ShopPlace";
import { isPaintingTrade } from "@/lib/shop-place";
import { appendSitePage, buildSiteRoster, editSitePage, emptySiteFeed, setSiteNotes, type SiteFeed } from "@/lib/site-feed";
import { clockLabel, hoursUntil, parseVoiceActions, type VoiceAction } from "@/lib/voice-actions";
import type { CustomerDTO, EmployeeDTO, EstimateDTO, JobDTO, TimeEntryDTO } from "@/lib/types";

function dayOnJob(person: EmployeeDTO, jobId: string, iso: string): TimeEntryDTO | null {
  return person.timeEntries.find((entry) => entry.date === iso && entry.jobId === jobId) || null;
}

function money(value: number) {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function timeOf(iso: string | null | undefined) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function atToday(hhmm: string, base: Date) {
  const [h, m] = hhmm.split(":").map(Number);
  const date = new Date(base);
  date.setHours(h, m, 0, 0);
  return date.toISOString();
}

function initials(first: string, last: string) {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || "?";
}

const INI_COLORS = ["#b2ff00", "#ffb000", "#8fc7ff", "#ff8a65", "#d7b2ff", "#7cf0c8"];

function iniColor(id: string) {
  let n = 0;
  for (const ch of id) n = (n * 31 + ch.charCodeAt(0)) % 997;
  return INI_COLORS[n % INI_COLORS.length];
}

const FOLD_KEY = "tgp-active-fold";

/** Every extra section starts collapsed (Eric, 2026-10-03): the job page stays compact,
 *  each card's summary line still shows, one tap opens what you want. */
const SHUT_BY_DEFAULT: Record<string, boolean> = {
  site: true,
  weather: true,
  tasks: true,
  paint: true,
  budget: true,
  photos: true,
  notes: true,
  punch: true,
  crew: true,
};

function useFolds() {
  const [shut, setShut] = useState<Record<string, boolean>>(SHUT_BY_DEFAULT);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FOLD_KEY);
      if (raw) setShut({ ...SHUT_BY_DEFAULT, ...(JSON.parse(raw) as Record<string, boolean>) });
    } catch {
      /* first visit */
    }
  }, []);
  function toggle(id: string) {
    setShut((current) => {
      const next = { ...current, [id]: !current[id] };
      try {
        window.localStorage.setItem(FOLD_KEY, JSON.stringify(next));
      } catch {
        /* private mode */
      }
      return next;
    });
  }
  return { shut, toggle };
}

function Card({
  id,
  icon,
  title,
  sum,
  tone,
  folds,
  children,
  bare = false,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  sum?: ReactNode;
  tone?: "warn";
  folds?: ReturnType<typeof useFolds>;
  children: ReactNode;
  /** Bare: static section header + always-open body, no fold button (Eric, 2026-10-03). */
  bare?: boolean;
}) {
  const open = bare || !folds?.shut[id];
  if (bare) {
    return (
      <section className={`ja-card${tone ? ` ${tone}` : ""}`} data-card={id}>
        <div className="ja-card-head static" aria-hidden={false}>
          <h2>
            {icon}
            {title}
          </h2>
          {sum ? <span className="ja-sum">{sum}</span> : null}
        </div>
        <div className="ja-card-body">{children}</div>
      </section>
    );
  }
  return (
    <section className={`ja-card${tone ? ` ${tone}` : ""}${open ? "" : " shut"}`} data-card={id}>
      <button type="button" className="ja-card-head" aria-expanded={open} onClick={() => folds!.toggle(id)} data-no-swipe>
        <h2>
          {icon}
          {title}
        </h2>
        {sum ? <span className="ja-sum">{sum}</span> : null}
        <span className="ja-fold" aria-hidden>
          <ChevronDown />
        </span>
      </button>
      {open ? <div className="ja-card-body">{children}</div> : null}
    </section>
  );
}

/**
 * The Active top bar sits in the shell's top lane, on the same row as the alerts bubble
 * (approved mockup). The lane is outside the scrolling page, so the bar is portaled into
 * the app shell and stays put while the page scrolls — Back is always one thumb away.
 */
function LaneBar({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setHost(document.querySelector<HTMLElement>(".app-shell"));
  }, []);
  if (!host) {
    return <div className="ja-bar">{children}</div>;
  }
  return createPortal(
    <div className="ja-bar lane" data-ja-lane>
      {children}
    </div>,
    host
  );
}

function InlineHours({
  value,
  label,
  disabled,
  display,
  onCommit,
}: {
  value: string;
  label: string;
  disabled?: boolean;
  /** What the closed button shows (e.g. "—" before anyone logs time). Defaults to the value. */
  display?: string;
  onCommit: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (open) box.current?.focus();
  }, [open]);
  function commit() {
    setOpen(false);
    const next = draft.trim();
    if (next === value.trim()) return;
    onCommit(next);
  }
  if (!open) {
    return (
      <button type="button" className="ja-hours" disabled={disabled} aria-label={`${label}: ${value} hours. Tap to fix`} onClick={() => setOpen(true)} data-no-swipe>
        {display ?? value}
        {display === "—" ? null : <small>hr</small>}
      </button>
    );
  }
  return (
    <input
      ref={box}
      className="ja-hours-input"
      type="text"
      inputMode="decimal"
      aria-label={label}
      data-voice-label={label}
      value={draft}
      data-no-swipe
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
        if (event.key === "Escape") {
          setDraft(value);
          setOpen(false);
        }
      }}
    />
  );
}

function AddLine({
  label,
  placeholder,
  voiceLabel,
  onAdd,
  children,
}: {
  label: string;
  placeholder: string;
  voiceLabel: string;
  onAdd: (text: string) => void;
  children?: ReactNode;
}) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="ja-addln" onClick={() => setOpen(true)} data-no-swipe>
        <i aria-hidden>
          <Plus />
        </i>
        {label}
      </button>
    );
  }
  return (
    <form
      className="ja-addform"
      onSubmit={(event) => {
        event.preventDefault();
        const text = draft.replace(/\s+/g, " ").trim();
        if (!text) return;
        onAdd(text);
        setDraft("");
      }}
    >
      {children}
      <input
        autoFocus
        value={draft}
        placeholder={placeholder}
        aria-label={voiceLabel}
        data-voice-label={voiceLabel}
        data-no-swipe
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className="ja-row">
        <button type="button" className="ja-btn" onClick={() => setOpen(false)}>
          Done
        </button>
        <button type="submit" className="ja-btn lime" disabled={!draft.trim()}>
          <Plus aria-hidden /> Add
        </button>
      </div>
    </form>
  );
}

export function ActiveStage({
  job,
  customer,
  employees,
  facts,
  actor,
  shop,
  now,
  field = false,
  selfId = null,
  estimate = null,
  onClose,
  onAdvance,
}: {
  job: JobDTO;
  customer: CustomerDTO | null;
  employees: EmployeeDTO[];
  facts: PipeFacts;
  actor: string;
  shop?: string;
  now: Date;
  /** Crew phone: no money, no change-order dollars, own clock only. */
  field?: boolean;
  selfId?: string | null;
  estimate?: EstimateDTO | null;
  onClose: () => void;
  onAdvance?: (key: JobStageKey) => void;
}) {
  const [, startTransition] = useTransition();
  const office = !field;
  const who = customer?.name || job.client;
  const folds = useFolds();
  // One "Work details" button for all the extra sections (Eric, 2026-10-03): most people
  // won't use them, so they hide behind a single tap instead of nine dropdowns.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const net = useOffline();
  const [tick, setTick] = useState(now);
  const prep = useMemo(() => parsePrep(job.prepChecklist), [job.prepChecklist]);
  const [feed, setFeed] = useState<SiteFeed>(() => prep.siteFeed || emptySiteFeed());
  const feedRef = useRef(feed);
  const [board, setBoardState] = useState<ActiveBoard>(() => boardOf(job.prepChecklist));
  const boardRef = useRef(board);
  const [hoursById, setHoursById] = useState<Record<string, number>>({});
  const [noteDraft, setNoteDraft] = useState(() => prep.siteFeed?.notes || "");
  const [pageOpen, setPageOpen] = useState(false);
  const [pageDraft, setPageDraft] = useState("");
  const [photoTab, setPhotoTab] = useState<"before" | "progress" | "after">("progress");
  const [editColors, setEditColors] = useState(false);
  const [askFinish, setAskFinish] = useState(false);
  const [changeDraft, setChangeDraft] = useState<{ title: string; amount: string } | null>(null);
  const [taskArea, setTaskArea] = useState<TaskArea>("prep");
  const photos = useJobPhotos(job, actor);
  const receiptRef = useRef<HTMLInputElement>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  // pageCrew raises one alert per call: a double submit must not page the crew twice.
  const pagingRef = useRef(false);

  useEffect(() => {
    const next = parsePrep(job.prepChecklist).siteFeed || emptySiteFeed();
    feedRef.current = next;
    setFeed(next);
    setNoteDraft(next.notes);
    const incoming = boardOf(job.prepChecklist);
    const merged = mergeBoards(incoming, boardRef.current, "ADMIN");
    boardRef.current = merged;
    setBoardState(merged);
  }, [job.id, job.prepChecklist]);

  useEffect(() => setTick(now), [now]);
  useEffect(() => {
    const id = window.setInterval(() => setTick(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, [job.id]);

  const today = todayString(tick);
  const siteAddress = (facts.property || job.address || "").trim();
  const look = useSiteWeather(siteAddress);
  // The shop's own name and trade (sign-up). Paint wording only for a painting shop.
  const shopInfo = useShopPlace();
  const painting = isPaintingTrade(shopInfo.trade);
  const pings = useCrewPings(job.id);
  const filled = filledThrough(job.pipeline, facts);
  const phone = customer?.phone || facts.phone || "";
  const email = customer?.email || facts.email || "";

  const assigned = useMemo(() => {
    const seats = (prep.crew || []).map((seat) => seat.employeeId);
    const booked = employees
      .filter((person) => person.timeEntries.some((entry) => entry.jobId === job.id && (entry.scheduledHours > 0 || entry.date === today)))
      .map((person) => person.id);
    return [...new Set([...seats, ...booked])];
  }, [employees, job.id, prep.crew, today]);

  const roster = useMemo(() => {
    const rows = buildSiteRoster(employees, job.id, assigned, today, tick);
    return rows.map((row) => ({ ...row, hours: hoursById[row.employeeId] ?? row.hours }));
  }, [assigned, employees, hoursById, job.id, tick, today]);
  const liveCount = roster.filter((row) => row.live).length;
  const hoursToday = Math.round(roster.reduce((sum, row) => sum + (row.hours || 0), 0) * 10) / 10;

  const jobDates = useMemo(
    () =>
      employees.flatMap((person) =>
        person.timeEntries.filter((entry) => entry.jobId === job.id && (entry.scheduledHours > 0 || entry.clockIn)).map((entry) => entry.date)
      ),
    [employees, job.id]
  );
  const day = workDay({ dates: jobDates, today, durationDays: prep.durationDays });
  const tasks = live(board.tasks);
  const stats = taskStats(board.tasks);
  const colors = live(board.colors);
  const punch = live(board.punch);
  const changes = live(board.changes).sort((a, b) => b.number - a.number);
  const punchOpen = punch.filter((row) => !row.done).length;
  const waiting = changes.filter((row) => row.status === "asked" || row.status === "sent");
  const workStart = useMemo(() => {
    const stamps = employees
      .flatMap((person) => person.timeEntries.filter((entry) => entry.jobId === job.id && entry.clockIn).map((entry) => entry.clockIn as string))
      .sort();
    return stamps[0] || null;
  }, [employees, job.id]);
  const buckets = photoBuckets(photos.photos, workStart, board.afterFrom);
  const shownPhotos = buckets[photoTab];
  const cost = office ? job.cost : undefined;
  const interior = isInteriorJob(`${job.name} ${job.notes}`);
  const window_ = useMemo(
    () =>
      paintWindow(
        (look.data?.hourly || []).map((row) => ({
          at: row.at,
          tempF: row.tempF,
          precipPct: interior ? 0 : row.precipPct,
          humidity: row.humidity,
          dewPointF: row.dewPointF,
        }))
      ),
    [interior, look.data]
  );

  const self = selfId ? employees.find((person) => person.id === selfId) || null : null;
  const selfEntry = self ? dayOnJob(self, job.id, today) : null;
  const selfLive = Boolean(selfEntry?.clockIn && !selfEntry.clockOut);

  // ---------- writes (all through the offline queue) ----------
  function packed(nextBoard: ActiveBoard, nextFeed: SiteFeed) {
    return putBoard(stringifyPrep({ ...prep, siteFeed: nextFeed }), nextBoard);
  }

  function save(nextBoard: ActiveBoard, nextFeed: SiteFeed = feedRef.current) {
    boardRef.current = nextBoard;
    feedRef.current = nextFeed;
    setBoardState(nextBoard);
    setFeed(nextFeed);
    const prepChecklist = packed(nextBoard, nextFeed);
    return updateJobOffline({ jobId: job.id, prepChecklist, actor }).catch((error) => {
      toast.error(error instanceof Error ? error.message : "Could not save the job board.");
    });
  }

  function saveBoard(change: (current: ActiveBoard) => ActiveBoard) {
    return save(change(boardRef.current));
  }

  function saveFeed(change: (current: SiteFeed) => SiteFeed) {
    return save(boardRef.current, change(feedRef.current));
  }

  function clockPerson(employeeId: string, action: "IN" | "OUT", name: string) {
    return clockTodayOffline({ employeeId, action, actor, jobId: job.id })
      .then(async () => {
        if (action === "IN") {
          await setJobPipeline({ jobId: job.id, pipeline: Math.max(job.pipeline, 4), actor }).catch(() => undefined);
          toast.success(`${name} is on site.`);
        } else toast.success(`${name} is clocked out.`);
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Clock update failed."));
  }

  function saveHours(person: EmployeeDTO, raw: string, times?: { clockIn?: string | null; clockOut?: string | null }) {
    const hours = Math.max(0, Math.min(24, Number(raw) || 0));
    const current = dayOnJob(person, job.id, today);
    const liveNow = Boolean(current?.clockIn && !current.clockOut);
    const clockIn =
      times?.clockIn !== undefined
        ? times.clockIn
        : liveNow && current?.clockIn && times?.clockOut === undefined
          ? new Date(tick.getTime() - hours * 3_600_000).toISOString()
          : undefined;
    setHoursById((map) => ({ ...map, [person.id]: hours }));
    return upsertHoursOffline({
      employeeId: person.id,
      date: today,
      scheduledHours: current?.scheduledHours || Math.max(hours, 0),
      actualHours: hours,
      jobId: job.id,
      serviceCodeId: current?.serviceCodeId || null,
      scheduledStart: current?.scheduledStart || null,
      scheduledEnd: current?.scheduledEnd || null,
      notes: current?.notes || null,
      actor,
      entryId: current && !current.id.startsWith("draft-") ? current.id : undefined,
      clockIn,
      ...(times?.clockOut !== undefined ? { clockOut: times.clockOut } : {}),
    }).catch((error) => {
      setHoursById((map) => {
        const next = { ...map };
        delete next[person.id];
        return next;
      });
      toast.error(error instanceof Error ? error.message : "Could not save hours.");
    });
  }

  function sendPage(text: string) {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean || pagingRef.current) return;
    pagingRef.current = true;
    saveFeed((current) => appendSitePage(current, "page", clean, new Date().toISOString()));
    setPageDraft("");
    startTransition(async () => {
      try {
        await pageCrew({ jobId: job.id, text: clean, actor });
        toast.success("Crew paged.");
      } catch {
        /* saved on the board; paging is best-effort with signal */
      } finally {
        pagingRef.current = false;
      }
    });
  }

  function saveNotes() {
    if (noteDraft.trim() === feedRef.current.notes.trim()) return;
    saveFeed((current) => setSiteNotes(current, noteDraft));
  }

  function toggleTask(id: string) {
    saveBoard((current) => {
      const row = current.tasks.find((task) => task.id === id);
      if (!row) return current;
      return { ...current, tasks: upsertRow(current.tasks, { ...row, done: !row.done, who: !row.done ? self?.firstName || row.who : row.who }) };
    });
  }

  function addTask(text: string, area: TaskArea) {
    const at = new Date();
    saveBoard((current) => ({
      ...current,
      tasks: upsertRow(current.tasks, { id: newId("task", at), at: at.toISOString(), area, text, done: false }),
    }));
  }

  function addPunch(text: string) {
    const at = new Date();
    saveBoard((current) => ({
      ...current,
      punch: upsertRow(current.punch, { id: newId("punch", at), at: at.toISOString(), text, done: false, where: self?.firstName }),
    }));
  }

  function togglePunch(id: string) {
    saveBoard((current) => {
      const row = current.punch.find((item) => item.id === id);
      return row ? { ...current, punch: upsertRow(current.punch, { ...row, done: !row.done }) } : current;
    });
  }

  function setColor(row: BoardColor) {
    saveBoard((current) => ({ ...current, colors: upsertRow(current.colors, row) }));
  }

  function colorsFromBid() {
    const lines = (estimate?.lines || []).filter((line) => classifyMaterial(line.description) === "paint");
    const at = new Date();
    const rows: BoardColor[] = (lines.length ? lines : [{ description: "Body color", quantity: 0 } as { description: string; quantity: number }]).map(
      (line, index) => ({
        id: `color-${at.getTime().toString(36)}-${index + 1}`,
        at: at.toISOString(),
        area: /prim/i.test(line.description) ? "Primer" : "Paint",
        code: "",
        name: line.description.replace(/\s+/g, " ").trim().slice(0, 60),
        product: "",
        sheen: "",
        have: 0,
        need: /gal/i.test(line.description) || line.quantity < 200 ? Math.round(Number(line.quantity) || 0) : 0,
      })
    );
    saveBoard((current) => ({ ...current, colors: [...current.colors, ...rows] }));
  }

  /** Boss only: the store receipt goes to Office → Archive → Receipts with today’s date. */
  async function fileReceipt(list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    setReceiptBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/receipts", { method: "POST", body });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Couldn’t save that receipt. Try again when you have signal.");
      toast.success("Receipt saved to Office → Receipts.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn’t save that receipt. Try again when you have signal.");
    } finally {
      setReceiptBusy(false);
      if (receiptRef.current) receiptRef.current.value = "";
    }
  }

  function addChange(title: string, amount: number, detail = "") {
    const at = new Date();
    saveBoard((current) => {
      const row: BoardChange = {
        id: newId("co", at),
        at: at.toISOString(),
        number: nextChangeNumber(current.changes),
        title,
        detail,
        amount,
        status: "asked",
        askedBy: who,
      };
      return { ...current, changes: upsertRow(current.changes, row) };
    });
  }

  function setChangeStatus(row: BoardChange, status: BoardChange["status"]) {
    saveBoard((current) => ({ ...current, changes: upsertRow(current.changes, { ...row, status }) }));
  }

  function changeText(row: BoardChange) {
    return `Hi ${who.split(" ")[0] || "there"}, this is ${actor} with ${shopInfo.name || "the crew"}. Change order CO-${row.number}: ${row.title}${row.detail ? ` (${row.detail})` : ""} — ${money(row.amount)}. Reply YES to approve.`;
  }

  function finishJob() {
    // No hard lock (Eric, 2026-10-03): the user can call the job finished whenever they want.
    startTransition(async () => {
      try {
        // Mark the work done so the Guide knows the invoice is the office's next move (lib/guide-next.ts).
        if (!boardRef.current.finishedAt) await saveBoard((current) => ({ ...current, finishedAt: new Date().toISOString() }));
        await setJobPipeline({ jobId: job.id, pipeline: Math.max(job.pipeline, 4), actor });
        onAdvance?.("invoice");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn’t move the job to invoice.");
      }
    });
  }

  // ---------- the one mic: what this page can do ----------
  function chipFor(action: VoiceAction): MicChip {
    const base = { id: action.id, label: action.label, dest: action.dest, blocked: action.blocked };
    switch (action.kind) {
      case "material":
        return {
          ...base,
          run: () => saveBoard((current) => ({ ...current, colors: addMaterial(current.colors, action) })),
        };
      case "clock-at": {
        const person = employees.find((row) => row.id === action.employeeId);
        const entry = person ? dayOnJob(person, job.id, today) : null;
        if (!person) return { ...base, blocked: "Not on this job’s crew." };
        if (action.action === "OUT") {
          if (!entry?.clockIn) return { ...base, blocked: `${person.firstName} has no clock-in on this job today.` };
          const hours = hoursUntil(entry.clockIn, action.at);
          if (hours === null) return { ...base, blocked: `${clockLabel(action.at)} is before ${person.firstName} clocked in.` };
          return {
            ...base,
            dest: `Hours · ${hours.toFixed(1)} hr today`,
            run: () => saveHours(person, String(hours), { clockIn: entry.clockIn, clockOut: atToday(action.at, new Date(entry.clockIn as string)) }),
          };
        }
        const start = atToday(action.at, tick);
        const end = entry?.clockOut ? Date.parse(entry.clockOut) : tick.getTime();
        const hours = Math.max(0, Math.round(((end - Date.parse(start)) / 3_600_000) * 10) / 10);
        return {
          ...base,
          dest: `Hours · ${hours.toFixed(1)} hr today`,
          run: () => saveHours(person, String(hours), { clockIn: start }),
        };
      }
      case "clock":
        return { ...base, run: () => clockPerson(action.employeeId, action.action, action.name) };
      case "hours": {
        const person = employees.find((row) => row.id === action.employeeId);
        return person ? { ...base, run: () => saveHours(person, String(action.hours)) } : { ...base, blocked: "Not on this job’s crew." };
      }
      case "task":
        return { ...base, run: () => addTask(action.text, action.area) };
      case "task-done":
        return { ...base, run: () => toggleTask(action.taskId) };
      case "punch":
        return { ...base, run: () => addPunch(action.text) };
      case "page":
        return { ...base, run: () => sendPage(action.text) };
      case "note":
        return {
          ...base,
          run: () => saveFeed((current) => appendSitePage(current, "note", action.text, new Date().toISOString())),
        };
      case "photo":
        return { ...base, run: () => photos.snap() };
      case "change":
        return office ? { ...base, run: () => addChange(action.title, action.amount) } : base;
    }
  }

  useVoiceScope({
    id: `active-${job.id}`,
    label: who,
    priority: 10,
    examples: office
      ? ["Add 2 gallons SW 7006 primer and Casey left at 3", "Punch list drip on the east sill", "Tell the crew lunch at noon"]
      : ["Clock me in", "We finished the east siding", "Punch list missed spot by the door"],
    propose: (text) =>
      parseVoiceActions(text, {
        crew: employees.map((person) => ({ id: person.id, firstName: person.firstName, lastName: person.lastName })),
        role: office ? "office" : "crew",
        selfId,
        tasks: live(boardRef.current.tasks).map((task) => ({ id: task.id, text: task.text, done: task.done })),
      }).map(chipFor),
  });

  const lastPages = feed.pages.filter((page) => page.kind === "page").slice(-2).reverse();
  const otherNotes = feed.pages.filter((page) => page.kind !== "page").slice(-3).reverse();
  const navHref = siteAddress ? navigateUrl(siteAddress, shopAddress(shop)) : "";
  const callHref = phone ? telHref(phone) : "";
  const textHref = phone ? smsHref(phone) : "";
  const mailLink = email ? `${mailHref(email)}?subject=${encodeURIComponent(`${job.name || "Your job"} — update`)}` : "";
  const segments = Math.max(1, Math.min(10, day?.of || 5));
  const filledSegs = (stats.pct / 100) * segments;
  const hoursRatio = cost && cost.laborHoursBudget > 0 ? cost.laborHoursActual / cost.laborHoursBudget : 0;
  const matRatio = cost && cost.materialBudget > 0 ? cost.materialActual / cost.materialBudget : 0;
  const matOver = cost ? Math.max(0, cost.materialActual - cost.materialBudget) : 0;
  const galHave = colors.reduce((sum, row) => sum + row.have, 0);
  const galNeed = colors.reduce((sum, row) => sum + row.need, 0);
  const wxStamp = look.data?.current?.at ? timeOf(look.data.current.at.length <= 16 ? `${look.data.current.at}:00` : look.data.current.at) : "";

  return (
    <StageFrame job={job} stage="active" facts={facts} kicker="Step 4 of 6 · Work" who={who} actor={actor} onClose={onClose} onAdvance={onAdvance} plain>
      <div className="ja" data-green-site="1" data-stage-form="active" data-field={field ? "1" : "0"}>
        <LaneBar>
          <div className="ja-barmid">
            <span className="ja-code">{job.code}</span>
          </div>
          <span className={`ja-sync ${net.status}`} role="status">
            <i aria-hidden />
            {net.status === "offline" ? `Offline${net.pending ? ` · ${net.pending}` : ""}` : net.pending ? `Syncing ${net.pending}` : "Synced"}
          </span>
        </LaneBar>

        <header className="ja-head">
          <h1 className="client-name">{who}</h1>
          {job.name && job.name !== who ? <p className="ja-job">{job.name}</p> : null}
          {siteAddress ? (
            <p className="ja-addr">
              <MapPin aria-hidden /> {siteAddress}
            </p>
          ) : null}
        </header>

        <div className="ja-prog">
          <div className="ja-prog-row">
            <span className="ja-day">
              {day && day.day ? `Day ${day.day}` : "Day 1"}
              <small>
                of {day?.of || prep.durationDays || "?"} · {tick.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).replace(",", "")}
              </small>
            </span>
            <span className="ja-pct">
              {stats.pct}%<small>done</small>
            </span>
          </div>
          <div className="ja-segs" aria-hidden>
            {Array.from({ length: segments }, (_, i) => {
              const fill = Math.max(0, Math.min(1, filledSegs - i));
              return <i key={i} style={{ ["--w" as string]: `${Math.round(fill * 100)}%` }} className={fill >= 1 ? "f" : fill > 0 ? "p" : ""} />;
            })}
          </div>
          <div className="ja-flags">
            {cost ? (
              <span className={`ja-flag ${cost.overLabor ? "warn" : "ok"}`}>
                <i aria-hidden /> {cost.overLabor ? "Hours over" : "Hours on pace"}
              </span>
            ) : null}
            {cost && cost.overMaterial ? (
              <span className="ja-flag warn">
                <i aria-hidden /> Materials +{money(matOver)}
              </span>
            ) : null}
            {waiting.length ? <span className="ja-flag plain">CO-{waiting[0].number} waiting</span> : null}
            {punchOpen ? <span className="ja-flag plain">{punchOpen} punch open</span> : null}
            {!cost && !waiting.length && !punchOpen ? (
              <span className="ja-flag ok">
                <i aria-hidden /> {liveCount ? `${liveCount} on site` : "Nobody on the clock"}
              </span>
            ) : null}
          </div>
        </div>

        <nav className="ja-qa" aria-label="Quick actions">
          <a className={`go${navHref ? "" : " off"}`} href={navHref || undefined} target="_blank" rel="noreferrer">
            <Navigation aria-hidden /> Navigate
          </a>
          <a className={callHref ? "" : "off"} href={callHref || undefined}>
            <Phone aria-hidden /> Call
          </a>
          <a className={textHref ? "" : "off"} href={textHref || undefined}>
            <MessageSquare aria-hidden /> Text
          </a>
          <a className={mailLink ? "" : "off"} href={mailLink || undefined}>
            <Mail aria-hidden /> Email
          </a>
        </nav>

        <button
          type="button"
          className={`ja-details-btn${detailsOpen ? " open" : ""}`}
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((open) => !open)}
          data-no-swipe
        >
          <ListChecks aria-hidden /> Work details
          <ChevronDown aria-hidden />
        </button>
        {detailsOpen ? (
          <>
        <Card
          id="site"
          bare
          icon={<Users aria-hidden />}
          title="Who’s on site"
          sum={
            <>
              <span className="ja-live">
                <i aria-hidden />
                {liveCount} live
              </span>
              · {hoursToday} hr today
            </>
          }
        >
          <SiteMap bare address={siteAddress} coords={look.data?.coords} origin={shopAddress(shop)} pings={pings} initialMode="top" />
          {roster.length ? (
            <ul className="ja-crew compact">
              {roster.map((row) => (
                <li key={row.employeeId} className={row.live ? "on" : "off"}>
                  <i aria-hidden />
                  <span>{`${row.firstName} ${row.lastName || ""}`.trim()}</span>
                  {row.live ? <small>on site</small> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="ja-empty">No crew on this job yet. Add people under Crew &amp; schedule below.</p>
          )}
          <div className="ja-row">
            {self ? (
              <button
                type="button"
                className={`ja-btn big ${selfLive ? "" : "lime"}`}
                data-guide-spot={selfLive ? "clock-out" : "clock-in"}
                onClick={() => void clockPerson(self.id, selfLive ? "OUT" : "IN", self.firstName)}
              >
                <Clock aria-hidden /> {selfLive ? "Clock out" : "Clock in on this job"}
              </button>
            ) : null}
            <button type="button" className="ja-btn big" onClick={() => setPageOpen((open) => !open)} aria-expanded={pageOpen}>
              <Megaphone aria-hidden /> Page crew
            </button>
          </div>
          {office ? <p className="ja-hint">Crew clock in on their own phone. Tap hours to fix a missed punch.</p> : null}
          {pageOpen ? (
            <form
              className="ja-addform"
              onSubmit={(event) => {
                event.preventDefault();
                sendPage(pageDraft);
              }}
            >
              <input
                autoFocus
                value={pageDraft}
                placeholder="Lunch at noon"
                aria-label="Message to the crew"
                data-voice-label="Crew page"
                data-no-swipe
                onChange={(event) => setPageDraft(event.target.value)}
              />
              <button type="submit" className="ja-btn lime" disabled={!pageDraft.trim()}>
                <Megaphone aria-hidden /> Send to crew
              </button>
            </form>
          ) : null}
          {lastPages.length ? (
            <ul className="ja-pages">
              {lastPages.map((page) => (
                <li key={page.id}>
                  <small>{timeOf(page.at)}</small> {page.text}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>

        <Card
          id="weather"
          bare
          icon={<Sun aria-hidden />}
          title={painting ? "Paint window" : "Work weather"}
          sum={look.data?.current ? `Open-Meteo${wxStamp ? ` · ${wxStamp}` : ""}` : look.status === "loading" ? "Loading…" : "No forecast"}
        >
          <div data-green-weather="1">
            <div className={`ja-pw ${window_.call}`} role="status">
              <span className="ja-pw-ic" aria-hidden>
                {window_.call === "go" ? <Check /> : window_.call === "unknown" ? <Sun /> : <CloudRain />}
              </span>
              <span>
                <b>{interior && window_.call !== "unknown" ? "Inside job — weather won’t stop you" : window_.headline}</b>
                <small>{interior ? "Rain doesn’t count. Cold and damp still matter for drying." : window_.detail}</small>
              </span>
            </div>
            {look.data?.current ? (
              <div className="ja-wxline">
                <span>
                  {look.data.current.tempF}°<small>now</small>
                </span>
                <span>
                  {look.data.current.humidity}%<small>humidity</small>
                </span>
                {look.data.current.dewPointF != null ? (
                  <span>
                    {look.data.current.dewPointF}°<small>dew pt</small>
                  </span>
                ) : null}
                <span>
                  {look.data.current.windMph}
                  <small>mph wind</small>
                </span>
              </div>
            ) : (
              <SiteWeather status={look.status} data={look.data} address={siteAddress} />
            )}
            {window_.hours.length ? (
              <>
                <ol className="ja-hrs">
                  {window_.hours.slice(0, 8).map((row, index) => (
                    <li key={row.at} className={`${row.call}${index === 0 ? " now" : ""}`} title={row.problems.join(" · ")}>
                      <small>{row.label.replace(" AM", "a").replace(" PM", "p")}</small>
                      <b>{row.tempF}°</b>
                      <em>{row.precipPct}%</em>
                      <i aria-hidden />
                    </li>
                  ))}
                </ol>
                <p className="ja-wleg">
                  <span>
                    <i className="go" /> {painting ? "Paint" : "Go"}
                  </span>
                  <span>
                    <i className="caution" /> Caution
                  </span>
                  <span>
                    <i className="stop" /> Stop
                  </span>
                  <span className="rain">% = rain</span>
                </p>
              </>
            ) : null}
          </div>
        </Card>

        <Card id="tasks" bare icon={<ListChecks aria-hidden />} title="Today’s tasks" sum={stats.total ? `${stats.done} of ${stats.total} done` : "No list yet"}>
          {stats.total ? (
            <>
              <ul className="ja-areas" aria-label="Tasks by area">
                {stats.byArea
                  .filter((area) => area.total)
                  .map((area) => (
                    <li key={area.id} className={area.done === area.total ? "done" : area.done ? "now" : ""}>
                      <small>{area.label}</small>
                      <b>
                        {area.done}/{area.total}
                      </b>
                    </li>
                  ))}
              </ul>
              {TASK_AREAS.map((area) => {
                const list = tasks.filter((task) => task.area === area.id);
                if (!list.length) return null;
                return (
                  <div className="ja-grp" key={area.id}>
                    <p className="ja-gh">
                      {area.label}
                      <span>
                        {list.filter((task) => task.done).length} of {list.length}
                      </span>
                    </p>
                    <ul>
                      {list.map((task) => (
                        <li key={task.id} className={`ja-tk${task.done ? " done" : ""}`}>
                          <button type="button" role="checkbox" aria-checked={task.done} onClick={() => toggleTask(task.id)} data-no-swipe>
                            <span className="ja-box" aria-hidden>
                              {task.done ? <Check /> : null}
                            </span>
                            <span className="ja-t">{task.text}</span>
                            {task.who ? (
                              <span className="ja-ini" style={{ background: iniColor(task.who) }}>
                                {task.who.slice(0, 2).toUpperCase()}
                              </span>
                            ) : null}
                          </button>
                          {office ? (
                            <button
                              type="button"
                              className="ja-x"
                              aria-label={`Remove ${task.text}`}
                              onClick={() => saveBoard((current) => ({ ...current, tasks: dropRow(current.tasks, task.id) }))}
                            >
                              <X />
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </>
          ) : (
            <button type="button" className="ja-btn big lime wide" onClick={() => saveBoard((current) => ({ ...current, tasks: [...current.tasks, ...starterTasks(interior)] }))}>
              <ListChecks aria-hidden /> Start with the usual {interior ? "inside" : "outside"} list
            </button>
          )}
          <AddLine label="Add task" placeholder="Caulk the north windows" voiceLabel="New task" onAdd={(text) => addTask(text, taskArea)}>
            <div className="ja-pick" role="radiogroup" aria-label="Area">
              {TASK_AREAS.map((area) => (
                <button key={area.id} type="button" role="radio" aria-checked={taskArea === area.id} className={taskArea === area.id ? "on" : ""} onClick={() => setTaskArea(area.id)}>
                  {area.label}
                </button>
              ))}
            </div>
          </AddLine>
        </Card>

        <Card
          id="paint"
          bare
          icon={<PaintBucket aria-hidden />}
          title={painting ? "Paint & materials" : "Materials"}
          sum={colors.length ? `${Math.round(galHave)} of ${Math.round(galNeed)} gal on hand` : "No colors yet"}
        >
          {colors.length ? (
            <ul className="ja-colors">
              {colors.map((row) => {
                const short = row.need > 0 && row.have < row.need;
                return (
                  <li key={row.id} className="ja-pc">
                    <span className="ja-sw" style={{ background: swatchFor(row.code) || "#3a3a3a" }} aria-hidden />
                    {editColors && office ? (
                      <span className="ja-pc-edit">
                        <input aria-label="Where it goes" data-voice-label="Where it goes" defaultValue={row.area} onBlur={(event) => event.target.value !== row.area && setColor({ ...row, area: event.target.value })} />
                        <input aria-label="Color code" data-voice-label="Color code" defaultValue={row.code} placeholder="SW 7006" onBlur={(event) => event.target.value !== row.code && setColor({ ...row, code: event.target.value })} />
                        <input aria-label="Color name" data-voice-label="Color name" defaultValue={row.name} onBlur={(event) => event.target.value !== row.name && setColor({ ...row, name: event.target.value })} />
                        <input aria-label="Gallons needed" inputMode="decimal" defaultValue={String(row.need)} onBlur={(event) => Number(event.target.value) !== row.need && setColor({ ...row, need: Math.max(0, Number(event.target.value) || 0) })} />
                      </span>
                    ) : (
                      <span className="ja-pc-txt">
                        <small>{row.area || "Paint"}</small>
                        <b>
                          {row.code ? <em>{row.code}</em> : null}
                          {row.name}
                        </b>
                        {row.product || row.sheen ? <span>{[row.product, row.sheen].filter(Boolean).join(" · ")}</span> : null}
                      </span>
                    )}
                    <span className="ja-gal">
                      <span className="ja-step">
                        <button type="button" aria-label={`One less gallon of ${row.name}`} onClick={() => setColor({ ...row, have: Math.max(0, row.have - 1) })}>
                          <Minus />
                        </button>
                        <b>
                          {row.have}
                          <small>/{row.need || "–"} gal</small>
                        </b>
                        <button type="button" aria-label={`One more gallon of ${row.name}`} onClick={() => setColor({ ...row, have: row.have + 1 })}>
                          <Plus />
                        </button>
                      </span>
                      <em className={short ? "need" : "ok"}>{short ? `Need ${Math.round((row.need - row.have) * 10) / 10} more` : row.need ? "On hand" : ""}</em>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <button type="button" className="ja-btn big lime wide" onClick={colorsFromBid}>
              <PaintBucket aria-hidden /> {estimate?.lines?.length ? "Load paint from the bid" : "Start a paint list"}
            </button>
          )}
          <div className="ja-row">
            <AddLine
              label="Add material"
              placeholder="2 gal SW 7006 primer"
              voiceLabel="New material"
              onAdd={(text) => {
                const qty = Number(/^(\d+(?:\.\d+)?)/.exec(text)?.[1] || 1);
                const name = text.replace(/^\d+(?:\.\d+)?\s*(?:gal(?:lons?)?|gals?)?\s*/i, "");
                saveBoard((current) => ({ ...current, colors: addMaterial(current.colors, { qty, code: name, name: name.replace(/\b(?:sw|bm|ppg)\s*-?\s*\d{3,4}\b/i, "").trim() }) }));
              }}
            />
            {office ? (
              <>
                <input
                  ref={receiptRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="photo-file"
                  data-no-swipe
                  onChange={(event) => void fileReceipt(event.target.files)}
                />
                <button type="button" className="ja-btn" disabled={receiptBusy} onClick={() => receiptRef.current?.click()}>
                  <Receipt aria-hidden /> {receiptBusy ? "Saving…" : "Receipt photo"}
                </button>
              </>
            ) : null}
          </div>
          {office && colors.length ? (
            <button type="button" className="ja-addln" onClick={() => setEditColors((on) => !on)} aria-pressed={editColors}>
              {editColors ? "Done editing colors" : "Edit colors"}
            </button>
          ) : null}
        </Card>

        {cost ? (
          <Card
            id="budget"
            bare
            tone={cost.overLabor || cost.overMaterial ? "warn" : undefined}
            icon={<Wallet aria-hidden />}
            title="Budget vs bid"
            sum={cost.overMaterial ? "Materials over" : cost.overLabor ? "Hours over" : "On budget"}
          >
            <div className="ja-bud">
              <p className="ja-bud-r">
                <b>Hours</b>
                <span>
                  {Math.round(cost.laborHoursActual * 10) / 10}
                  <small> of {Math.round(cost.laborHoursBudget)} hr</small>
                </span>
              </p>
              <div className={`ja-bb${cost.overLabor ? " over" : ""}`}>
                <i style={{ width: `${Math.min(100, Math.round(hoursRatio * 100))}%` }} />
                {stats.total ? <s style={{ left: `${stats.pct}%` }} aria-hidden /> : null}
              </div>
              <p className={`ja-bud-n${cost.overLabor ? " w" : ""}`}>
                {stats.total
                  ? `${stats.pct}% of the work done, ${Math.round(hoursRatio * 100)}% of hours used.`
                  : `${Math.round(hoursRatio * 100)}% of bid hours used.`}{" "}
                {cost.laborHoursBudget > cost.laborHoursActual ? `${Math.round(cost.laborHoursBudget - cost.laborHoursActual)} hr left.` : ""}
              </p>
              <p className="ja-bud-r">
                <b>Materials</b>
                <span className={cost.overMaterial ? "amb" : ""}>
                  {money(cost.materialActual)}
                  <small> of {money(cost.materialBudget)}</small>
                </span>
              </p>
              <div className={`ja-bb${cost.overMaterial ? " over" : ""}`}>
                <i style={{ width: `${Math.min(100, Math.round(matRatio * 100))}%` }} />
              </div>
              <p className={`ja-bud-n${cost.overMaterial ? " w" : ""}`}>
                {cost.overMaterial ? `Over by ${money(matOver)} (${Math.round(matRatio * 100)}%). Add a change order?` : `${money(Math.max(0, cost.materialBudget - cost.materialActual))} left for materials.`}
              </p>
            </div>
          </Card>
        ) : null}

        <Card id="photos" bare icon={<Camera aria-hidden />} title="Photos" sum={`${photos.photos.length} shots`}>
          <input ref={photos.camRef} type="file" accept="image/*" capture="environment" className="photo-file" data-no-swipe onChange={(event) => void photos.ingest(event.target.files).catch(() => toast.error("Couldn’t save that photo."))} />
          <input ref={photos.rollRef} type="file" accept="image/*" multiple className="photo-file" data-no-swipe onChange={(event) => void photos.ingest(event.target.files).catch(() => toast.error("Couldn’t save that photo."))} />
          <div className="ja-seg" role="tablist" aria-label="Photo set">
            {(["before", "progress", "after"] as const).map((tab) => (
              <button key={tab} type="button" role="tab" aria-selected={photoTab === tab} className={photoTab === tab ? "on" : ""} onClick={() => setPhotoTab(tab)}>
                {tab === "before" ? "Before" : tab === "progress" ? "Progress" : "After"}
                <em>{buckets[tab].length}</em>
              </button>
            ))}
          </div>
          <ul className="ja-thumbs">
            {shownPhotos.slice(-7).map((photo) => (
              <li key={photo.id} className={isLocalId(photo.id) ? "queued" : ""}>
                <img src={photo.url} alt={photo.caption || "Job photo"} />
              </li>
            ))}
            <li>
              <button type="button" className="ja-add" onClick={photos.snap} disabled={photos.busy} aria-label="Take a photo">
                <Camera aria-hidden />
                {photos.busy ? "Saving" : "Add"}
              </button>
            </li>
          </ul>
          <div className="ja-row">
            <button type="button" className="ja-btn" onClick={photos.roll}>
              <Images aria-hidden /> From the phone
            </button>
            {photoTab === "after" && !board.afterFrom ? (
              <button type="button" className="ja-btn lime" onClick={() => saveBoard((current) => ({ ...current, afterFrom: new Date().toISOString() }))}>
                <Camera aria-hidden /> Start After photos
              </button>
            ) : null}
          </div>
          {photos.pending ? (
            <p className="ja-queue">
              <i aria-hidden /> {photos.pending} saved on the phone — they upload when signal’s back.
            </p>
          ) : null}
        </Card>

        <Card id="notes" bare icon={<FileText aria-hidden />} title="Notes & client asks" sum={changes.length ? `${waiting.length} waiting` : undefined}>
          <label className="ja-notes">
            <span className="sr-only">Notes</span>
            <textarea
              value={noteDraft}
              rows={3}
              placeholder="Gate code, parking, what the client said…"
              aria-label="Notes"
              data-voice-label="Notes"
              data-no-swipe
              onChange={(event) => setNoteDraft(event.target.value)}
              onBlur={saveNotes}
            />
          </label>
          {otherNotes.length ? (
            <ul className="ja-pages notes">
              {otherNotes.map((page) => (
                <li key={page.id}>
                  <small>{timeOf(page.at)}</small>
                  <textarea
                    defaultValue={page.text}
                    rows={1}
                    aria-label={`Note from ${timeOf(page.at)}`}
                    data-voice-label="Note"
                    data-no-swipe
                    onBlur={(event) => event.target.value.trim() !== page.text && saveFeed((current) => editSitePage(current, page.id, event.target.value))}
                  />
                </li>
              ))}
            </ul>
          ) : null}
          <p className="ja-lbl">Client requests &amp; change orders</p>
          {changes.length ? (
            <ul className="ja-cos">
              {changes.map((row) => (
                <li key={row.id} className={`ja-co ${row.status}`}>
                  <p className="ja-co-top">
                    <span>
                      CO-{row.number}
                      {row.askedBy ? ` · asked by ${row.askedBy}` : ""}
                    </span>
                    <em className={`ja-st ${row.status}`}>
                      {row.status === "asked" ? "New" : row.status === "sent" ? "Awaiting OK" : row.status === "approved" ? "Approved" : "Declined"}
                    </em>
                  </p>
                  <p className="ja-co-main">
                    <b>{row.title}</b>
                    {office ? <span className="ja-amt">+{money(row.amount)}</span> : null}
                  </p>
                  {row.detail ? <p className="ja-co-ds">{row.detail}</p> : null}
                  {office && row.status !== "approved" && row.status !== "declined" ? (
                    <div className="ja-row">
                      <a
                        className={`ja-btn${phone ? "" : " off"}`}
                        href={phone ? `${smsHref(phone)}${smsHref(phone).includes("?") ? "&" : "?"}body=${encodeURIComponent(changeText(row))}` : undefined}
                        onClick={() => row.status === "asked" && setChangeStatus(row, "sent")}
                      >
                        <MessageSquare aria-hidden /> {row.status === "sent" ? "Resend to client" : "Text to client"}
                      </a>
                      <button type="button" className="ja-btn lime" onClick={() => setChangeStatus(row, "approved")}>
                        <Check aria-hidden /> Mark approved
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="ja-empty">No extra work asked for yet.</p>
          )}
          {office ? (
            changeDraft ? (
              <form
                className="ja-addform"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!changeDraft.title.trim()) return;
                  addChange(changeDraft.title.trim(), Math.max(0, Number(changeDraft.amount.replace(/[^\d.]/g, "")) || 0));
                  setChangeDraft(null);
                }}
              >
                <input
                  autoFocus
                  value={changeDraft.title}
                  placeholder="Pool gate & fence rail"
                  aria-label="What they asked for"
                  data-voice-label="Change order"
                  onChange={(event) => setChangeDraft({ ...changeDraft, title: event.target.value })}
                />
                <input
                  value={changeDraft.amount}
                  inputMode="decimal"
                  placeholder="Price, like 420"
                  aria-label="Price in dollars"
                  data-voice-label="Price"
                  onChange={(event) => setChangeDraft({ ...changeDraft, amount: event.target.value })}
                />
                <div className="ja-row">
                  <button type="button" className="ja-btn" onClick={() => setChangeDraft(null)}>
                    Cancel
                  </button>
                  <button type="submit" className="ja-btn lime" disabled={!changeDraft.title.trim()}>
                    <Plus aria-hidden /> Add change order
                  </button>
                </div>
              </form>
            ) : (
              <button type="button" className="ja-addln" onClick={() => setChangeDraft({ title: "", amount: "" })}>
                <i aria-hidden>
                  <Plus />
                </i>
                Add request or change order
              </button>
            )
          ) : (
            <AddLine
              label="Client asked for something"
              placeholder="Wants the pool gate painted too"
              voiceLabel="Client request"
              onAdd={(text) => saveFeed((current) => appendSitePage(current, "instruction", `Client asked: ${text}`, new Date().toISOString()))}
            />
          )}
        </Card>

        <Card id="punch" bare icon={<Flag aria-hidden />} title="Punch list" sum={punch.length ? `${punch.length - punchOpen} of ${punch.length} fixed` : "Nothing yet"}>
          {punch.length ? (
            <ul className="ja-list">
              {punch.map((row) => (
                <li key={row.id} className={`ja-tk${row.done ? " done" : ""}`}>
                  <button type="button" role="checkbox" aria-checked={row.done} onClick={() => togglePunch(row.id)} data-no-swipe>
                    <span className="ja-box" aria-hidden>
                      {row.done ? <Check /> : null}
                    </span>
                    <span className="ja-t">
                      {row.text}
                      {row.where ? <small>{row.where}</small> : null}
                    </span>
                  </button>
                  {office ? (
                    <button type="button" className="ja-x" aria-label={`Remove ${row.text}`} onClick={() => saveBoard((current) => ({ ...current, punch: dropRow(current.punch, row.id) }))}>
                      <Trash2 />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="ja-empty">Walk the job and add touch-ups here before you finish.</p>
          )}
          <AddLine label="Add punch item" placeholder="Drip on east window sill" voiceLabel="Punch item" onAdd={addPunch} />
        </Card>

        <Card
          id="crew"
          bare
          icon={<CalendarDays aria-hidden />}
          title="Crew & schedule"
          sum={`${assigned.length} crew`}
        >
          <JobCrewSchedule job={job} employees={employees} now={tick} actor={actor} locked={field} />
        </Card>
          </>
        ) : null}

        {office ? (
          <section className="ja-fin" aria-label="Finish job">
            <ul className="ja-ready">
              <li className={stats.total && stats.done === stats.total ? "y" : "n"}>
                <b>
                  {stats.done}/{stats.total}
                </b>
                <small>Tasks</small>
              </li>
              <li className={punchOpen ? "n" : "y"}>
                <b>{punchOpen}</b>
                <small>Punch open</small>
              </li>
              <li className={buckets.after.length ? "y" : "n"}>
                <b>{buckets.after.length}</b>
                <small>After photos</small>
              </li>
            </ul>
            {askFinish ? (
              <div className="ja-confirm" role="alertdialog" aria-label="Finish anyway?">
                <p>
                  Still open: {[stats.total - stats.done ? `${stats.total - stats.done} tasks` : "", punchOpen ? `${punchOpen} punch items` : "", buckets.after.length ? "" : "no After photos"]
                    .filter(Boolean)
                    .join(", ")}
                  . Finish anyway?
                </p>
                <div className="ja-row">
                  <button type="button" className="ja-btn big" onClick={() => setAskFinish(false)}>
                    Not yet
                  </button>
                  <button
                    type="button"
                    className="ja-btn big orange"
                    onClick={() => {
                      setAskFinish(false);
                      finishJob();
                    }}
                  >
                    Yes, finish
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="ja-finbtn"
                onClick={() => {
                  const open = stats.total - stats.done + punchOpen + (buckets.after.length ? 0 : 1);
                  if (open > 0) setAskFinish(true);
                  else finishJob();
                }}
              >
                Finish job → Invoice
              </button>
            )}
            <p>Builds the invoice from the bid, approved change orders, and extra materials.</p>
          </section>
        ) : (
          <section className="ja-fin crew" aria-label="Done for the job">
            <button type="button" className="ja-btn big wide" onClick={() => sendPage(`${self?.firstName || "Crew"} says ${job.name || who} is done — ready for the walk-through.`)}>
              <Megaphone aria-hidden /> Tell the office we’re done
            </button>
          </section>
        )}
      </div>
    </StageFrame>
  );
}
