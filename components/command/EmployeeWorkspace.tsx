"use client";

import { realAnsweringLine } from "@/lib/answering-line";
import { formatPhoneNumber } from "@/lib/phone-format";
import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { Archive, Building2, CalendarDays, Camera, Check, Clock, Compass, Crown, Moon, Settings, Sun, Users, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TimesheetBoard } from "@/components/command/TimesheetBoard";
import { ProfilePay } from "@/components/command/ProfilePay";
import { ArchiveJobs } from "@/components/command/ArchiveJobs";
import { PayrollSetup } from "@/components/command/PayrollSetup";
import { CompanySetup } from "@/components/command/CompanySetup";
import { CommandCenter } from "@/components/command/CommandCenter";
import { JobFolder } from "@/components/command/JobFolder";
import { LeadStage } from "@/components/command/LeadStage";
import { EstimateStage } from "@/components/command/EstimateStage";
import { FieldJob } from "@/components/command/FieldJob";
import { ActiveStage } from "@/components/command/ActiveStage";
import { InvoiceStage } from "@/components/command/InvoiceStage";
import { CompleteStage } from "@/components/command/CompleteStage";
import { YellowPrepStage } from "@/components/command/YellowPrepStage";
import { EmployeeHome } from "@/components/command/EmployeeHome";
import { EmployeeOnboard } from "@/components/command/EmployeeOnboard";
import { CrewInviteLink } from "@/components/command/CrewInviteDesk";
import { BillingDesk } from "@/components/command/BillingDesk";
import { YearEndBooks } from "@/components/command/YearEndBooks";
import { OfficeRecords } from "@/components/command/OfficeRecords";
import { ThemePicker } from "@/components/command/ThemePicker";
import { PaymentPrefsForm } from "@/components/command/PaymentPrefs";
import { DeckPane } from "@/components/command/DeckPane";
import { sortJobDeck } from "@/components/command/JobCard";
import { useSwipeNav } from "@/hooks/use-swipe-nav";
import { useWorkspaceOverlay } from "@/hooks/use-workspace-overlay";
import { useAutofocusFirstInput } from "@/hooks/use-autofocus";
import { speakText } from "@/hooks/use-voice";
import { OfflineDot } from "@/components/command/OfflineDot";
import { AlertCenter } from "@/components/command/AlertCenter";
import { AccessGate, PinBypass } from "@/components/command/AccessGate";
import { PersonSwipe } from "@/components/command/PersonSwipe";
import { crewSpot, type EntryKind } from "@/lib/schedule-day";
import { usePinGateStatus } from "@/components/command/usePinGate";
import {
  createEmployee,
  deleteEmployee,
  refreshPeriod,
  savePayPrefs,
  saveShellTheme,
  updateIdentity,
} from "@/app/actions";
import { browserOnline } from "@/lib/offline/net";
import { periodForCrew } from "@/lib/payroll";
import { todayString } from "@/lib/dates";
import { type FolderTab, customerForJob, filledThrough, readPipeFacts } from "@/lib/job-pipeline";
import { crewClockToday, guideQueue, guideWaits, jobWorkState, pickGuideStep, type GuideJob } from "@/lib/guide-next";
import { landOnGuideSpot } from "@/lib/guide-land";
import { parseBoard } from "@/lib/active-board";
import { parsePrep } from "@/lib/job-prep";
import { shopAddress } from "@/lib/maps";
import { fieldDock } from "@/lib/access";
import { pagePathFor, type JobStageKey, type PagePath } from "@/lib/page-theme";
import { shellThemeById, workflowStepForPath } from "@/lib/shell-theme";
import { formatShellInk, typeInkColor } from "@/lib/shell-ink";
import { ShellThemeProvider, useShellTheme } from "@/hooks/use-shell-theme";
import { ThemeSwitch } from "@/components/command/ThemeSwitch";
import { useDeviceLook } from "@/components/command/DeviceLook";
import { startingShellChoice, writeDeviceLook } from "@/lib/device-look";
import { usePageEdge } from "@/hooks/use-page-edge";
import { useCrewBeacon } from "@/hooks/use-crew-beacon";
import { emptyBillingDTO } from "@/lib/billing";
import { TrialEndingBanner } from "@/components/command/TrialEndingBanner";
import { parsePayPrefs } from "@/lib/pay-prefs";
import { isMockSeedId } from "@/lib/initial-data";
import { BrandLockup } from "@/components/command/BrandLockup";
import { AppTour, ReplayAppTutorial } from "@/components/command/AppTour";
import { HelpModeHost, HelpModeToggle } from "@/components/command/HelpMode";
import { VoiceChoice } from "@/components/command/VoiceChoice";
import { AiPrivacySettings } from "@/components/command/AiConsent";
import { DeleteShopAccount } from "@/components/command/DeleteAccount";
import { ChangePin } from "@/components/command/ChangePin";
import { type CustomerDTO, type EmployeeDTO, type EstimateDTO, type GatePerson, type InvoiceDTO, type JobDTO, type PayType, type PayrollSettingsDTO, type SessionDTO } from "@/lib/types";

/** Audit name when no signed-in person is at hand. Never a real or demo owner's name. */
const ACTOR = "Office";

type AppTab = "command" | "crew" | "schedule" | "pay" | "company";
type CrewFolder = "schedule" | "profiles" | "archive";

function parseTab(value: string | null | undefined, role?: SessionDTO["role"]): AppTab {
  const allowed = fieldDock(role);
  if (value && (allowed as readonly string[]).includes(value)) return value as AppTab;
  return role === "CREW" ? "crew" : "command";
}

const SIZE_LABEL: Record<string, string> = {
  JUST_ME: "Just me",
  "2_3": "2–3 people",
  "4_10": "4–10 people",
  "10_PLUS": "10+ people",
};

const BOOKS_LABEL: Record<PayrollSettingsDTO["accountingSoftware"], string> = {
  QUICKBOOKS: "QuickBooks Online",
  XERO: "Xero",
  OTHER: "Other",
  NONE: "None",
};

export function EmployeeWorkspace({
  employees: serverEmployees,
  jobs: serverJobs,
  customers: serverCustomers,
  invoices,
  estimates: serverEstimates,
  settings,
  session,
  people = [],
  initialId,
  initialJob,
  initialTab,
  forceSetup,
  initialStage,
}: {
  employees: EmployeeDTO[];
  jobs: JobDTO[];
  customers: CustomerDTO[];
  invoices: InvoiceDTO[];
  estimates: EstimateDTO[];
  settings: PayrollSettingsDTO;
  session: SessionDTO | null;
  people?: GatePerson[];
  initialId?: string;
  initialJob?: string;
  initialTab?: string;
  forceSetup?: boolean;
  initialStage?: string;
}) {
  const router = useRouter();
  const { employees, jobs, customers, estimates } = useWorkspaceOverlay({
    employees: serverEmployees,
    jobs: serverJobs,
    customers: serverCustomers,
    invoices,
    estimates: serverEstimates,
    settings,
  });
  const [now, setNow] = useState(() => new Date());
  const [tab, setTab] = useState<AppTab>(() =>
    initialTab === "schedule" || initialTab === "pay" ? "crew" : parseTab(initialTab, session?.role)
  );
  // Auto-focus first input on tab change (Eric, 2026-10-03): no tapping needed.
  useAutofocusFirstInput(true, tab);
  const [folderJobId, setFolderJobId] = useState<string | null>(initialJob || null);
  const [folderTab, setFolderTab] = useState<FolderTab>("estimate");
  const [pinSkipFailed, setPinSkipFailed] = useState(false);
  const { enabled: pinGateEnabled } = usePinGateStatus();
  const [jobStage, setJobStage] = useState<{ jobId: string; key: JobStageKey } | null>(null);
  const [setupOpen, setSetupOpen] = useState(!settings.setupComplete || Boolean(forceSetup));
  const [payrollOnly, setPayrollOnly] = useState(false);
  const [periodOffset, setPeriodOffset] = useState(0);
  const [crewFolder, setCrewFolder] = useState<CrewFolder | null>(() => {
    if (initialTab === "schedule") return "schedule";
    // Old Pay links land on the person's profile (pay lives there now).
    if (initialTab === "pay" && session?.role !== "CREW") return "profiles";
    return null;
  });
  // Unified Schedule: no Jobs/Estimates switch. A stage's "Schedule time" only pre-picks the add flow.
  const [scheduleAdd, setScheduleAdd] = useState<EntryKind | null>(null);
  const [guideId, setGuideId] = useState<string | null>(null);
  const [guideLine, setGuideLine] = useState<string | null>(null);
  /** Guide found nothing to do anywhere: show a big “All caught up”. */
  const [guideCaught, setGuideCaught] = useState(false);
  const guideLanding = useRef<(() => void) | null>(null);
  const [deckJobId, setDeckJobId] = useState<string | null>(null);
  const refreshedId = useRef<string | null>(null);
  const openedSignupStage = useRef(false);
  const field = session?.role === "CREW";
  const index = Math.max(
    0,
    employees.findIndex((employee) => employee.id === (field ? session?.employeeId : initialId))
  );
  const safeIndex = employees.length ? (index === -1 ? 0 : index) : 0;
  const employee = employees[safeIndex];

  const hrefFor = (opts?: { employeeId?: string; jobId?: string | null; tab?: AppTab }) => {
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const person = opts?.employeeId ?? employee?.id;
    if (person) params.set("id", person);
    else params.delete("id");
    if (opts?.jobId) params.set("job", opts.jobId);
    else if (opts && "jobId" in opts) params.delete("job");
    const nextTab = opts?.tab ?? tab;
    if (nextTab && nextTab !== "command") params.set("tab", nextTab);
    else params.delete("tab");
    params.delete("setup");
    const query = params.toString();
    return query ? `/?${query}` : "/";
  };

  const writeWorkspaceUrl = (opts?: { employeeId?: string; jobId?: string | null; tab?: AppTab }) => {
    const url = hrefFor(opts);
    if (typeof window !== "undefined") {
      window.history.replaceState(window.history.state, "", url);
    }
    router.replace(url, { scroll: false });
  };

  const openCrewFolder = (folder: CrewFolder, employeeId?: string) => {
    setTab("crew");
    setCrewFolder(folder);
    writeWorkspaceUrl({ employeeId, jobId: null, tab: "crew" });
  };

  const go = (next: number) => {
    if (!employees.length) return;
    const wrapped = (next + employees.length) % employees.length;
    writeWorkspaceUrl({ employeeId: employees[wrapped].id, jobId: null });
  };

  const swipe = useSwipeNav(
    () => go(safeIndex - 1),
    () => go(safeIndex + 1),
    { enabled: false, yieldToLocal: true, shell: true }
  );

  useEffect(() => {
    if (initialTab === "schedule" || initialTab === "pay") writeWorkspaceUrl({ tab: "crew" });
    // Land old Schedule/Pay links inside the Crew folders once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (setupOpen) return;
    const typing = () => {
      const el = document.activeElement;
      if (!el || !(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    };
    const refresh = () => {
      if (!browserOnline()) return;
      if (typing()) return;
      router.refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("job-command-synced", refresh);
    document.addEventListener("visibilitychange", onVisible);
    const waiting = estimates.some(
      (item) => item.status === "SENT" || item.status === "VIEWED" || item.status === "CHANGES"
    );
    const timer = waiting && browserOnline() ? window.setInterval(refresh, 8000) : 0;
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("job-command-synced", refresh);
      document.removeEventListener("visibilitychange", onVisible);
      if (timer) window.clearInterval(timer);
    };
  }, [estimates, router, setupOpen]);

  useEffect(() => {
    if (!employee || setupOpen || field) return;
    if (isMockSeedId(employee.id)) return;
    const current = periodForCrew(settings, employee, now, 0);
    const exists = employee.payPeriods.some(
      (period) => period.startDate === current.start && period.endDate === current.end
    );
    if (!exists && refreshedId.current !== employee.id) {
      refreshedId.current = employee.id;
      void refreshPeriod(employee.id);
    }
  }, [employee, now, settings, setupOpen, field]);

  useEffect(() => {
    if (openedSignupStage.current || setupOpen || field) return;
    if (initialStage !== "estimate") return;
    const first = jobs[0];
    if (!first) return;
    openedSignupStage.current = true;
    setFolderJobId(null);
    setJobStage({ jobId: first.id, key: "estimate" });
  }, [field, initialStage, jobs, setupOpen]);

  // Guide: board order, one step per job that needs the office (or the crew member's own clock).
  const guideJobs = useMemo<GuideJob[]>(() => {
    const deck = sortJobDeck(jobs, customers, estimates, invoices, employees, now);
    const today = todayString(now);
    return deck.map((job) => {
      const estimate = estimates.find((item) => item.jobId === job.id) || null;
      const board = parseBoard(parsePrep(job.prepChecklist).active);
      return {
        id: job.id,
        client: job.client,
        pipeline: job.pipeline,
        facts: readPipeFacts({
          job,
          customer: customerForJob(job, customers, estimate),
          estimate,
          invoices,
          employees,
          now,
        }),
        ...jobWorkState(job.id, employees, today, board.finishedAt),
      };
    });
  }, [jobs, customers, estimates, invoices, employees, now]);
  const guideSelf = field ? employees.find((person) => person.id === session?.employeeId) || null : null;
  const guideSteps = useMemo(
    () =>
      field
        ? guideQueue(guideJobs, "field", guideSelf ? crewClockToday(guideSelf.timeEntries, todayString(now)) : undefined)
        : guideQueue(guideJobs, "office"),
    [field, guideJobs, guideSelf, now]
  );
  const guideOrder = useMemo(() => guideJobs.map((job) => job.id), [guideJobs]);

  useEffect(() => {
    // The step got done (or went away): drop its line. “All caught up” stays until they tap or change tabs.
    if (guideId && !guideSteps.some((step) => step.id === guideId)) {
      setGuideId(null);
      setGuideLine(null);
    }
  }, [guideSteps, guideId]);

  useEffect(() => () => guideLanding.current?.(), []);

  if (!session && !forceSetup) {
    // Eric 2026-10-05: ALWAYS try bypass first — the DB check for pinGateEnabled hangs
    // from serverless, so we can't rely on it. PinBypass POSTs to /api/bypass which is
    // hardcoded (no DB). Only show the PIN form if bypass fails.
    // Also: always show the gate when signed out (don't check setupComplete — the DB
    // may not report it correctly, and a signed-out user needs login, not setup).
    if (!pinSkipFailed) {
      return (
        <AppShell path="gate" look={settings.shellTheme} ink={settings.shellInk}>
          <PinBypass onFail={() => setPinSkipFailed(true)} />
        </AppShell>
      );
    }
    return (
      <AppShell path="gate" look={settings.shellTheme} ink={settings.shellInk}>
        <section className="page">
          <AccessGate people={people} shop={settings.businessName} />
        </section>
      </AppShell>
    );
  }

  if (setupOpen) {
    return (
      <AppShell path="setup" look={settings.shellTheme} ink={settings.shellInk}>
        <CommandHeader settings={settings} />
        <section className="page">
          {payrollOnly ? (
            <PayrollSetup
              settings={settings}
              onDone={() => {
                setSetupOpen(false);
                setPayrollOnly(false);
                setTab("crew");
                setCrewFolder("profiles");
                router.replace("/?tab=crew");
                router.refresh();
              }}
            />
          ) : (
            <CompanySetup
              settings={settings}
              onDone={(result) => {
                setSetupOpen(false);
                if (result?.route === "billing") {
                  setTab("company");
                  router.replace(result.href || "/?tab=company&billing=verify");
                } else {
                  setTab("command");
                  router.replace(result?.href || "/?stage=estimate");
                }
                router.refresh();
              }}
            />
          )}
        </section>
      </AppShell>
    );
  }

  if (field && employee && !employee.onboardedAt) {
    return (
      <AppShell path="gate" look={settings.shellTheme} ink={settings.shellInk}>
        <CommandHeader settings={settings} />
        <section className="page">
          <EmployeeOnboard firstName={employee.firstName} shop={settings.businessName} />
        </section>
      </AppShell>
    );
  }

  const actor = session?.name || `${settings.ownerFirstName} ${settings.ownerLastName}`.trim() || ACTOR;
  const folderJobIndex = Math.max(0, jobs.findIndex((job) => job.id === folderJobId));
  const folderJob = jobStage ? null : jobs.find((job) => job.id === folderJobId) || null;
  const stageJob = jobStage ? jobs.find((job) => job.id === jobStage.jobId) || null : null;
  const stageKey = stageJob && jobStage ? jobStage.key : null;
  const stageCustomer = stageJob
    ? customerForJob(stageJob, customers, estimates.find((item) => item.jobId === stageJob.id) || null)
    : null;
  const stageEstimate = stageJob ? estimates.find((item) => item.jobId === stageJob.id) || null : null;
  const stageFacts = stageJob
    ? readPipeFacts({
        job: stageJob,
        customer: stageCustomer,
        estimate: stageEstimate,
        invoices,
        employees,
        now,
      })
    : null;
  const path = pagePathFor({
    jobStage: stageKey,
    folder: Boolean(folderJob),
    folderTab,
    tab,
  });

  function openJob(jobId: string, nextTab: FolderTab = "estimate") {
    setJobStage(null);
    setFolderTab(nextTab);
    setFolderJobId(jobId);
    writeWorkspaceUrl({ jobId });
  }

  function showJob(jobId: string) {
    setFolderJobId(jobId);
    writeWorkspaceUrl({ jobId });
  }

  function closeFolder() {
    setFolderJobId(null);
    writeWorkspaceUrl({ jobId: null });
  }

  function openStage(jobId: string, key: JobStageKey) {
    setFolderJobId(null);
    setJobStage({ jobId, key });
    writeWorkspaceUrl({ jobId: null });
  }

  // No hard locks (Eric, 2026-10-03): the user can open any stage, skip ahead, or finish
  // whenever they want. The Guide still points at the next logical step so nobody gets
  // lost — it just never blocks.
  function openGatedStage(jobId: string, key: JobStageKey) {
    openStage(jobId, key);
  }

  function closeStage() {
    setJobStage(null);
  }

  /**
   * BigActionButton state: what should the tech do RIGHT NOW?
   * Priority: complete live job → send unsent invoice → start next job → caught up.
   * This is the soul of the mobile field experience — one button, zero confusion.
   */

  /**
   * Guide tap. On a job → that job's next step, landed on the exact control. Job caught up or waiting on
   * the customer → the next customer that needs you. Nothing anywhere → “All caught up”, no navigation.
   * The board's arrow passes its own job id so it can never open a different job's step.
   */
  function runGuide(target?: unknown) {
    const pinned = typeof target === "string" ? target : null;
    const currentJobId = pinned || stageJob?.id || folderJob?.id || (tab === "command" ? deckJobId : null) || null;
    const openStep = guideId ? guideSteps.find((step) => step.id === guideId) : null;
    const repeatOf = !pinned && openStep && stageJob?.id === openStep.jobId && stageKey === openStep.stage ? openStep.id : null;
    const step = pickGuideStep(guideSteps, { order: guideOrder, currentJobId, repeatOf });
    guideLanding.current?.();
    guideLanding.current = null;
    if (!step) {
      setGuideId(null);
      setGuideCaught(true);
      setGuideLine("All caught up");
      // Eric 2026-10-05: Guide speaks its suggestion out loud.
      speakText("All caught up. Nothing needs you right now.").catch(() => {});
      return;
    }
    const waiting = !field && currentJobId && step.jobId !== currentJobId ? guideWaits(guideJobs).find((wait) => wait.jobId === currentJobId) : null;
    setGuideCaught(false);
    setGuideId(step.id);
    const line = waiting ? `${waiting.line} Next: ${step.line}` : step.line;
    setGuideLine(line);
    // Eric 2026-10-05: Guide speaks its suggestion out loud.
    speakText(line).catch(() => {});
    setTab("command");
    setCrewFolder(null);
    openStage(step.jobId, step.stage);
    guideLanding.current = landOnGuideSpot(step.spot, {
      root: () => document.querySelector(".page.docked"),
      // Tap the highlighted target once to skip to the next task (Eric, 2026-10-03).
      onTap: () => {
        window.setTimeout(() => runGuide(), 50);
      },
    });
  }

  const overlayOpen = Boolean(stageKey || folderJob);
  const noticeJob =
    stageJob ||
    folderJob ||
    (tab === "command" ? jobs.find((job) => job.id === deckJobId) || null : null);
  const noticeEstimate = noticeJob ? estimates.find((item) => item.jobId === noticeJob.id) || null : null;

  return (
    <AppShell path={path} look={settings.shellTheme} ink={settings.shellInk} className="wide has-dock" swipe={swipe.bind} neon={contentNeon(tab, crewFolder, stageKey)}>
      {field && employee ? <CrewBeacon employee={employee} now={now} /> : null}
      <PhoneCorner role={session?.role} jobId={noticeJob?.id} estimate={noticeEstimate} jobs={jobs} employees={employees} businessName={settings.businessName} />
      <section className="page docked">
        {session?.role === "ADMIN" ? <TrialEndingBanner billing={settings.billing} /> : null}
        {guideLine ? (
          <button
            type="button"
            className={`guide-line${guideCaught ? " caught" : ""}`}
            role="status"
            aria-live="polite"
            data-guide-line="1"
            onClick={() => {
              if (!guideCaught) return runGuide();
              setGuideCaught(false);
              setGuideLine(null);
            }}
          >
            {guideCaught ? (
              <>
                <span className="guide-caught-check" aria-hidden>
                  ✓
                </span>
                <span className="guide-caught-word">All caught up</span>
                <span className="guide-caught-sub">Nothing needs you right now.</span>
              </>
            ) : (
              guideLine
            )}
          </button>
        ) : null}
        {!employees.length && tab !== "company" && tab !== "command" && tab !== "crew" && !overlayOpen ? (
          <div className="empty-state">
            <h1>Roster</h1>
            <p>Tap + to add the first person.</p>
          </div>
        ) : null}

        {stageJob && stageKey === "field" && employee ? (
          <FieldJob
            job={stageJob}
            employee={employee}
            customer={stageCustomer}
            estimate={stageEstimate}
            settings={settings}
            actor={actor}
            onClose={closeStage}
          />
        ) : null}

        {stageJob && stageKey === "lead" && stageFacts ? (
          <LeadStage
            job={stageJob}
            customer={stageCustomer}
            employees={employees}
            now={now}
            actor={actor}
            settings={settings}
            facts={stageFacts}
            onClose={closeStage}
            onAdvance={(key) => openStage(stageJob.id, key)}
          />
        ) : null}

        {stageJob && stageKey === "estimate" && stageFacts ? (
          <EstimateStage
            job={stageJob}
            customer={stageCustomer}
            estimate={stageEstimate}
            employees={employees}
            settings={settings}
            now={now}
            actor={actor}
            facts={stageFacts}
            onClose={closeStage}
            onAdvance={(key) => openStage(stageJob.id, key)}
            onScheduleTime={() => {
              setScheduleAdd("ESTIMATE");
              closeStage();
              openCrewFolder("schedule");
            }}
          />
        ) : null}

        {stageJob && stageKey === "schedule" && stageFacts ? (
          <YellowPrepStage
            job={stageJob}
            customer={stageCustomer}
            employees={employees}
            estimate={stageEstimate}
            facts={stageFacts}
            actor={actor}
            now={now}
            shop={settings.businessAddress}
            onClose={closeStage}
            onAdvance={(key) => openStage(stageJob.id, key)}
            onScheduleTime={() => {
              setScheduleAdd("JOB");
              closeStage();
              openCrewFolder("schedule");
            }}
          />
        ) : null}

        {stageJob && stageKey === "active" && stageFacts ? (
          <ActiveStage
            job={stageJob}
            customer={stageCustomer}
            employees={employees}
            facts={stageFacts}
            actor={actor}
            shop={settings.businessAddress}
            now={now}
            field={field}
            selfId={session?.employeeId || null}
            estimate={stageEstimate}
            onClose={closeStage}
            onAdvance={(key) => openStage(stageJob.id, key)}
          />
        ) : null}

        {stageJob && stageKey === "invoice" && stageFacts ? (
          <InvoiceStage
            job={stageJob}
            customer={stageCustomer}
            customers={customers}
            estimate={stageEstimate}
            invoices={invoices}
            employees={employees}
            facts={stageFacts}
            actor={actor}
            onClose={closeStage}
            onAdvance={(key) => openStage(stageJob.id, key)}
          />
        ) : null}

        {stageJob && stageKey === "archive" && stageFacts ? (
          <CompleteStage
            job={stageJob}
            customer={stageCustomer}
            facts={stageFacts}
            actor={actor}
            onClose={closeStage}
            onAdvance={(key) => openStage(stageJob.id, key)}
          />
        ) : null}

        {!stageKey && folderJob ? (
          <JobFolder
            job={folderJob}
            jobs={jobs}
            jobIndex={folderJobIndex}
            onPrevJob={() => {
              if (!jobs.length) return;
              const next = (folderJobIndex - 1 + jobs.length) % jobs.length;
              showJob(jobs[next].id);
            }}
            onNextJob={() => {
              if (!jobs.length) return;
              const next = (folderJobIndex + 1) % jobs.length;
              showJob(jobs[next].id);
            }}
            onChangeJob={showJob}
            employees={employees}
            customers={customers}
            invoices={invoices}
            estimates={estimates}
            estimate={estimates.find((item) => item.jobId === folderJob.id) || null}
            settings={settings}
            now={now}
            actor={actor}
            initialTab={folderTab}
            fieldMode={field}
            onClose={closeFolder}
            onTabChange={setFolderTab}
          />
        ) : null}

        {!overlayOpen && tab === "command" ? (
          <CommandCenter
            employees={employees}
            jobs={jobs}
            customers={customers}
            invoices={invoices}
            estimates={estimates}
            settings={settings}
            selected={employee}
            now={now}
            actor={actor}
            canCreateJob={!field}
            onOpenStage={openGatedStage}
            guideReady={guideSteps.some((step) => step.jobId === deckJobId)}
            guideOn={Boolean(guideLine) && !guideCaught}
            onGuide={runGuide}
            onDeckJob={setDeckJobId}
            onOpenSchedule={(employeeId) => openCrewFolder("schedule", employeeId)}
            onOpenPay={(employeeId) => {
              if (field) return;
              openCrewFolder("profiles", employeeId);
            }}
          />
        ) : null}

        {!overlayOpen && tab === "crew" && !crewFolder ? (
          <CrewFolders
            onOpen={(folder) => {
              if (folder === "schedule") setScheduleAdd(null);
              setCrewFolder(folder);
            }}
          />
        ) : null}

        {!overlayOpen && tab === "crew" && crewFolder === "profiles" && !employees.length ? (
          <div className="crew-folder-view">
            <CrewFolderBack onBack={() => setCrewFolder(null)} />
            <div className="empty-state">
              <h1>Profiles</h1>
              <p>Tap + to add the first person.</p>
              <NewEmployeeDialog />
            </div>
          </div>
        ) : null}

        {!overlayOpen && tab === "crew" && crewFolder === "profiles" && employee ? (
          <div className="crew-folder-view">
            <CrewFolderBack onBack={() => setCrewFolder(null)} />
            <DeckPane key={employee.id}>
              <CrewPane
                employee={employee}
                jobs={jobs}
                customers={customers}
                estimates={estimates}
                settings={settings}
                now={now}
                shop={shopAddress(settings.businessAddress)}
                onPrev={() => go(safeIndex - 1)}
                onNext={() => go(safeIndex + 1)}
                canFlip={employees.length > 1}
                solo={field}
                actor={actor}
                onOpenStop={(jobId) => openStage(jobId, "field")}
                periodOffset={periodOffset}
                onPeriodOffset={setPeriodOffset}
                onChangePeriod={() => {
                  setPayrollOnly(true);
                  setSetupOpen(true);
                }}
              />
            </DeckPane>
          </div>
        ) : null}

        {!overlayOpen && tab === "crew" && crewFolder === "schedule" && employee ? (
          <div className="crew-folder-view">
            <DeckPane key={employee.id}>
              <SchedulePane
                employee={employee}
                employees={employees}
                jobs={jobs}
                customers={customers}
                estimates={estimates}
                invoices={invoices}
                settings={settings}
                now={now}
                periodOffset={periodOffset}
                onPrev={() => go(safeIndex - 1)}
                onNext={() => go(safeIndex + 1)}
                solo={field}
                canEdit={!field}
                actor={actor}
                addKind={scheduleAdd}
                onOpenJob={(jobId) => openJob(jobId, "work")}
              />
            </DeckPane>
          </div>
        ) : null}

        {!overlayOpen && tab === "crew" && crewFolder === "archive" ? (
          <div className="crew-folder-view">
            <CrewFolderBack onBack={() => setCrewFolder(null)} />
            <ArchiveJobs jobs={jobs} onOpen={(jobId) => openStage(jobId, "archive")} />
          </div>
        ) : null}

        {!overlayOpen && employees.length && tab === "schedule" && employee ? (
          <DeckPane key={employee.id}>
          <SchedulePane
            employee={employee}
            employees={employees}
            jobs={jobs}
            customers={customers}
            estimates={estimates}
            invoices={invoices}
            settings={settings}
            now={now}
            periodOffset={periodOffset}
            onPrev={() => go(safeIndex - 1)}
            onNext={() => go(safeIndex + 1)}
            solo={field}
            canEdit={!field}
            actor={actor}
            addKind={scheduleAdd}
            onOpenJob={(jobId) => openJob(jobId, "work")}
          />
          </DeckPane>
        ) : null}

        {!field && !overlayOpen && tab === "company" ? (
          <CompanyDesk
            settings={settings}
            employees={employees}
            jobs={jobs}
            customers={customers}
            invoices={invoices}
            estimates={estimates}
            onEditPayroll={() => {
              setPayrollOnly(true);
              setSetupOpen(true);
            }}
            onRerunSetup={() => {
              setPayrollOnly(false);
              setSetupOpen(true);
            }}
          />
        ) : null}
      </section>
      <AppTour
        field={field}
        onTab={(next) => {
          closeFolder();
          closeStage();
          setGuideLine(null);
          setGuideCaught(false);
          if (next === "crew") setCrewFolder(null);
          setTab(next);
          writeWorkspaceUrl({ tab: next, jobId: null });
        }}
      />
      <HelpModeHost />
      <Dock
        tab={tab}
        role={session?.role}
        onTab={(next) => {
          closeFolder();
          closeStage();
          setGuideLine(null);
          setGuideCaught(false);
          if (next === "crew") setCrewFolder(null);
          setTab(next);
          writeWorkspaceUrl({ tab: next, jobId: null });
        }}
        onCommand={() => runGuide()}
        guideActive={guideSteps.length > 0}
      />
    </AppShell>
  );
}

function CrewBeacon({ employee, now }: { employee: EmployeeDTO; now: Date }) {
  const today = todayString(now);
  const live = employee.timeEntries.find((entry) => entry.date === today && entry.clockIn && !entry.clockOut);
  useCrewBeacon(Boolean(live), live?.jobId);
  return null;
}

function contentNeon(tab: AppTab, folder: CrewFolder | null, stage: JobStageKey | null) {
  if (stage === "lead") return "pink";
  if (stage === "estimate") return "orange";
  if (stage === "schedule" || stage === "active" || stage === "field") return "lime";
  if (stage === "invoice") return "cyan";
  if (stage === "archive") return "purple";
  if (tab === "crew" && folder === "schedule") return "lime";
  if (tab === "crew" && folder === "archive") return "purple";
  if (tab === "crew") return "orange";
  if (tab === "company") return "blue";
  if (tab === "schedule") return "lime";
  if (tab === "pay") return "cyan";
  return "pink";
}

function AppShell({
  path,
  look,
  ink,
  className = "",
  swipe,
  neon,
  children,
}: {
  path: PagePath;
  look?: string | null;
  ink?: string | null;
  className?: string;
  swipe?: { ref?: (node: HTMLElement | null) => void; style?: CSSProperties };
  neon?: string;
  children: ReactNode;
}) {
  const device = useDeviceLook();
  return (
    <ShellThemeProvider initial={startingShellChoice(device.choice, look)} initialInk={ink}>
      <AppShellPaint path={path} className={className} swipe={swipe} neon={neon}>
        {children}
      </AppShellPaint>
    </ShellThemeProvider>
  );
}

const SKIP_INK_TYPE = new Set(["checkbox", "radio", "range", "file", "color", "button", "submit", "reset", "hidden"]);

function isTypedField(node: EventTarget | null): node is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement)) return false;
  if (node.closest(".client-quote")) return false;
  if (node.closest(".absence-field")) return false;
  return !SKIP_INK_TYPE.has((node.getAttribute("type") || "").toLowerCase());
}

function rememberField(field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
  if (field.dataset.loaded == null) field.dataset.loaded = field.value;
}

function paintTypedField(field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
  const locked = field.disabled || ("readOnly" in field && field.readOnly);
  if (locked) {
    delete field.dataset.userInk;
    return;
  }
  rememberField(field);
  if (field.value !== field.dataset.loaded) field.dataset.userInk = "1";
  else delete field.dataset.userInk;
}

function AppShellPaint({
  path,
  className = "",
  swipe,
  neon,
  children,
}: {
  path: PagePath;
  className?: string;
  swipe?: { ref?: (node: HTMLElement | null) => void; style?: CSSProperties };
  neon?: string;
  children: ReactNode;
}) {
  const edge = usePageEdge(path);
  // `look` is what paints (Auto resolves to Lime Industrial or Light); `id` is what the shop picked.
  const { id, look, ink } = useShellTheme();
  const theme = shellThemeById(look);
  const typeInk = typeInkColor(ink, theme.canvas);
  const step = workflowStepForPath(path);
  useEffect(() => {
    const scan = (root: ParentNode) => {
      root.querySelectorAll("input, textarea, select").forEach((node) => {
        if (isTypedField(node)) rememberField(node);
      });
    };
    const onEdit = (event: Event) => {
      if (isTypedField(event.target)) paintTypedField(event.target);
    };
    scan(document);
    const observer = new MutationObserver((records) => {
      records.forEach((record) => {
        record.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (isTypedField(node)) rememberField(node);
          scan(node);
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("input", onEdit, true);
    document.addEventListener("change", onEdit, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("input", onEdit, true);
      document.removeEventListener("change", onEdit, true);
    };
  }, []);
  return (
    <main
      className={`app-shell clean-app-container theme-boss${className ? ` ${className}` : ""}`}
      data-path={path}
      data-step={step}
      data-shell={look}
      data-shell-choice={id}
      data-canvas={theme.canvas}
      data-wash={theme.wash ? "on" : "off"}
      data-buttons={theme.invertedButtons ? "inverted" : "standard"}
      data-palette={theme.palette ? "1" : undefined}
      data-type-ink={typeInk ? "1" : undefined}
      data-neon={neon || undefined}
      style={{
        ...(edge.vars as CSSProperties),
        ...swipe?.style,
        ...(typeInk ? ({ "--type-ink": typeInk } as CSSProperties) : {}),
        ...(theme.palette
          ? ({
              "--layout-bg": theme.palette.bg,
              "--layout-card": theme.palette.card,
              "--layout-ink": theme.palette.ink,
              "--layout-muted": theme.palette.muted,
              "--layout-accent": theme.palette.accent,
              "--layout-accent-ink": theme.palette.accentInk,
              "--layout-line": theme.palette.line,
            } as CSSProperties)
          : {}),
      }}
      ref={swipe?.ref}
    >
      {/* Eric's real JC shield, very faint, behind every screen (see .jc-watermark in globals.css). */}
      <div className="jc-watermark" aria-hidden="true" />
      <div className="grain" />
      {children}
    </main>
  );
}

function CommandHeader({
  role,
}: {
  settings?: PayrollSettingsDTO;
  role?: SessionDTO["role"];
}) {
  return (
    // Top bar (Eric, 2026-10-02): alerts bell LEFT, DARK|LIGHT CENTER, the one mic RIGHT. The JC shield lives on Jobs only.
    <header className="topbar topbar-notify top-trio" data-top-trio="1">
      <div className="top-trio-left topbar-notify-area">
        <AlertCenter role={role === "CREW" ? "crew" : "office"} />
      </div>
      <div className="top-trio-center">
        <ThemeSwitch />
      </div>
      <div className="top-trio-right">
        <OfflineDot />
        <div className="top-mic-slot" data-one-mic-slot="1" />
      </div>
    </header>
  );
}

function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="ghost-action slim company-signout"
      onClick={() => {
        void fetch("/api/session", { method: "DELETE" }).then(() => router.refresh());
      }}
    >
      Sign out
    </button>
  );
}

function PhoneCorner({
  role,
  jobId,
  estimate,
  jobs,
  employees,
  businessName,
}: {
  role?: SessionDTO["role"];
  jobId?: string;
  estimate: EstimateDTO | null;
  jobs?: JobDTO[] | null;
  employees?: EmployeeDTO[] | null;
  businessName?: string | null;
}) {
  return (
    // Top bar (Eric, 2026-10-02): alerts bell LEFT, the one mic RIGHT (OneMic portals into the slot).
    // DARK|LIGHT moved to the dock (Eric, 2026-10-03).
    <div className="phone-corner top-trio" data-top-trio="1">
      <div className="top-trio-left">
        <AlertCenter
          role={role === "CREW" ? "crew" : "office"}
          jobs={jobs ?? null}
          employees={employees ?? null}
          {...(jobId ? { jobId, estimate } : {})}
        />
      </div>
      <div className="top-trio-center">
        <span className="brand-wordmark-wrap">
          <img className="brand-wordmark-img" src="/brand/job-command-wordmark.png?v=20261005" alt={businessName || "jobcommand.app"} />
          <span className="brand-wordmark-app">.app</span>
        </span>
      </div>
      <div className="top-trio-right">
        <div className="top-mic-slot" data-one-mic-slot="1" />
      </div>
    </div>
  );
}

function Dock({
  tab,
  onTab,
  role,
  onCommand,
  guideActive,
}: {
  tab: AppTab;
  onTab: (tab: AppTab) => void;
  role?: SessionDTO["role"];
  onCommand: () => void;
  guideActive?: boolean;
}) {
  // CLEAN REBUILD (Eric 2026-10-07): No CSS classes, ONLY inline styles.
  // Bypasses all 83 conflicting .dock-btn rules.
  // All-skin support (Eric 2026-10-07): Use CSS variables so colors adapt to active skin.
  // Selected border: white on dark skins, neon green on light skins (white invisible on white).
  const isLightSkin = typeof document !== "undefined" &&
    ["light", "color"].includes(document.querySelector(".app-shell")?.getAttribute("data-shell") || "");
  const selectedBorder = isLightSkin ? "#39ff14" : "#ffffff";
  const selectedGlow = isLightSkin ? "rgba(57,255,20,0.5)" : "rgba(255,255,255,0.5)";
  const navStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 2fr 2fr",
    gap: "8px",
    padding: "12px",
    background: "var(--wb-fill, #1a1a1a)",
    borderRadius: "12px",
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 50,
  };
  const btnBase: React.CSSProperties = {
    padding: "12px 8px",
    borderRadius: "8px",
    background: "var(--wb-fill, #161616)",
    color: "var(--wb-ink, #b2ff00)",
    border: "2px solid var(--wb-edge, #4a5d23)",
    cursor: "pointer",
    textAlign: "center",
    fontWeight: "bold",
    fontSize: "14px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
  };
  const btnSelected: React.CSSProperties = {
    ...btnBase,
    border: `2px solid ${selectedBorder}`,
    boxShadow: `0 0 12px ${selectedGlow}`,
  };
  const btnAction: React.CSSProperties = {
    ...btnBase,
    border: "2px solid #f97316",
    boxShadow: "0 0 12px rgba(249,115,22,0.6)",
    animation: "dockPulse 1.5s ease-in-out infinite",
  };
  // Press feedback (Eric 2026-10-07): border flashes highlight color when pushed.
  const [pressed, setPressed] = useState<string | null>(null);
  const pressStyle = (key: string): CSSProperties | undefined =>
    pressed === key ? { border: `2px solid ${selectedBorder}`, boxShadow: `0 0 16px ${selectedGlow}` } : undefined;
  const pressHandlers = (key: string) => ({
    onTouchStart: () => setPressed(key),
    onTouchEnd: () => setPressed(null),
    onMouseDown: () => setPressed(key),
    onMouseUp: () => setPressed(null),
    onMouseLeave: () => setPressed(null),
  });
  return (
    <>
      <style>{`@keyframes dockPulse { 0%,100% { box-shadow: 0 0 12px rgba(249,115,22,0.6); } 50% { box-shadow: 0 0 20px rgba(249,115,22,0.9); } }`}</style>
      <nav aria-label="Desk" style={navStyle}>
        <button type="button" onClick={() => onTab("crew")} aria-label="Roster"
          {...pressHandlers("crew")}
          style={{ ...(tab === "crew" ? btnSelected : btnBase), ...pressStyle("crew") }}>
          <Clock className="size-5" />
        </button>
        <button type="button" onClick={() => onTab("company")} aria-label="Office"
          {...pressHandlers("company")}
          style={{ ...(tab === "company" ? btnSelected : btnBase), ...pressStyle("company") }}>
          <Settings className="size-5" />
        </button>
        <button type="button" onClick={() => onTab("command")}
          {...pressHandlers("command")}
          style={{ ...(tab === "command" ? btnSelected : btnBase), ...pressStyle("command") }}>
          <Crown className="size-5" />
          Jobs
        </button>
        <button type="button" onClick={onCommand} aria-label="Command"
          {...pressHandlers("guide")}
          style={{ ...(guideActive ? btnAction : btnBase), ...pressStyle("guide") }}>
          <Compass className="size-5" />
          Command
        </button>
      </nav>
    </>
  );
}

function CrewFolders({ onOpen }: { onOpen: (folder: CrewFolder) => void }) {
  return (
    <section className="crew-folders" aria-label="Roster">
      <div className="command-mast jobs-mast">
        <h1>Roster</h1>
      </div>
      <div className="crew-folder-grid">
        <button type="button" className="crew-folder schedule" onClick={() => onOpen("schedule")}>
          <CalendarDays aria-hidden="true" />
          <b>Schedule</b>
        </button>
        <button type="button" className="crew-folder profiles" onClick={() => onOpen("profiles")}>
          <Users aria-hidden="true" />
          <b>Profiles</b>
        </button>
        <button type="button" className="crew-folder archive" onClick={() => onOpen("archive")}>
          <Archive aria-hidden="true" />
          <b>Archive Jobs</b>
        </button>
      </div>
    </section>
  );
}

function CrewFolderBack({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="crew-folder-back" onClick={onBack}>
      ← Folders
    </button>
  );
}

function ScheduleWho({
  employee,
  onPrev,
  onNext,
  solo = false,
  hint = false,
  index = -1,
  count = 0,
}: {
  employee: EmployeeDTO;
  onPrev: () => void;
  onNext: () => void;
  solo?: boolean;
  hint?: boolean;
  /** Schedule carousel: position in the crew for "Role · n of N" and the dots. */
  index?: number;
  count?: number;
}) {
  const swipe = useSwipeNav(onPrev, onNext, { enabled: !solo, threshold: 22 });
  const slide = swipe.dragging ? Math.max(-40, Math.min(40, swipe.drag)) : 0;
  if (hint) {
    const flip = !solo && count > 1;
    return (
      <div className="sched-who" data-dragging={swipe.dragging ? "1" : "0"} data-solo={flip ? undefined : "1"} {...swipe.bind}>
        {flip ? (
          <button type="button" className="sched-who-arrow" onClick={onPrev} aria-label="Previous person" data-no-swipe>
            ◀
          </button>
        ) : null}
        <div className="sched-who-mid who-glide" style={swipe.dragging ? { transform: `translate3d(${slide}px,0,0)` } : undefined}>
          <img src={employee.photoUrl ?? "/avatars/generic.svg"} alt="" />
          <div className="sched-who-text">
            <b className="sched-who-name">
              {employee.firstName} {employee.lastName}
            </b>
            <span className="sched-who-role">{crewSpot(employee.jobTitle || "", index, count)}</span>
            {flip && count <= 12 ? (
              <span className="sched-who-dots" aria-hidden="true">
                {Array.from({ length: count }, (_, dot) => (
                  <i key={dot} className={dot === index ? "on" : undefined} />
                ))}
              </span>
            ) : null}
          </div>
        </div>
        {flip ? (
          <button type="button" className="sched-who-arrow" onClick={onNext} aria-label="Next person" data-no-swipe>
            ▶
          </button>
        ) : null}
        {flip ? <PersonSwipe /> : null}
      </div>
    );
  }
  return (
    <div className="schedule-who" data-dragging={swipe.dragging ? "1" : "0"} {...swipe.bind}>
      <div className="who-glide" style={swipe.dragging ? { transform: `translate3d(${slide}px,0,0)` } : undefined}>
        <img src={employee.photoUrl ?? "/avatars/generic.svg"} alt="" />
        <div className="who-names">
          <b>{employee.firstName}</b>
          <b>{employee.lastName}</b>
        </div>
      </div>
    </div>
  );
}

function CrewPane({
  employee,
  jobs,
  customers,
  estimates,
  settings,
  now,
  shop: _shop,
  onPrev,
  onNext,
  canFlip = false,
  solo = false,
  actor,
  onOpenStop,
  periodOffset,
  onPeriodOffset,
  onChangePeriod,
}: {
  employee: EmployeeDTO;
  jobs: JobDTO[];
  customers: CustomerDTO[];
  estimates: EstimateDTO[];
  settings: PayrollSettingsDTO;
  now: Date;
  shop: string;
  onPrev: () => void;
  onNext: () => void;
  canFlip?: boolean;
  solo?: boolean;
  actor: string;
  onOpenStop: (jobId: string) => void;
  periodOffset: number;
  onPeriodOffset: (offset: number) => void;
  onChangePeriod: () => void;
}) {
  if (solo) {
    return (
      <EmployeeHome
        employee={employee}
        jobs={jobs}
        customers={customers}
        estimates={estimates}
        settings={settings}
        now={now}
        actor={actor}
        onOpenStop={onOpenStop}
      />
    );
  }
  const today = todayString(now);
  const todayStops = employee.timeEntries
    .filter((entry) => entry.date === today && entry.scheduledHours > 0)
    .sort((a, b) => (a.scheduledStart || "").localeCompare(b.scheduledStart || ""));
  const todayEntry =
    todayStops.find((entry) => entry.clockIn && !entry.clockOut) || todayStops[0] || employee.timeEntries.find((entry) => entry.date === today);
  const live = Boolean(todayEntry?.clockIn && !todayEntry?.clockOut);

  return (
    <section className="rolodex-strip crew-card" aria-label="Employee">
      <div className="command-mast jobs-mast crew-mast">
        <h1>Roster</h1>
        <div className="jobs-nav">
          <button
            type="button"
            className="tumbler-step job-flip"
            onClick={onPrev}
            aria-label="Previous employee"
            disabled={!canFlip}
            data-no-swipe
          >
            ◀
          </button>
          <NewEmployeeDialog />
          <button
            type="button"
            className="tumbler-step job-flip"
            onClick={onNext}
            aria-label="Next employee"
            disabled={!canFlip}
            data-no-swipe
          >
            ▶
          </button>
        </div>
      </div>
      <IdentityEditor employee={employee} live={live} />
      {/* This worker's app link (moved here from the bottom of Office, Eric 2026-10-02). */}
      <CrewInviteLink key={`${employee.id}-invite`} employee={employee} shop={settings.businessName} />
      {/* Boss/office only (solo crew phones return EmployeeHome above). All pay lives here — no Roster › Pay folder. */}
      <ProfilePay
        key={`${employee.id}-pay`}
        employee={employee}
        settings={settings}
        actor={ACTOR}
        now={now}
        periodOffset={periodOffset}
        onPeriodOffset={onPeriodOffset}
        onChangePeriod={onChangePeriod}
      />
    </section>
  );
}

function SchedulePane({
  employee,
  employees,
  jobs,
  customers = [],
  estimates = [],
  invoices = [],
  settings,
  now,
  periodOffset,
  onPrev,
  onNext,
  solo = false,
  canEdit = true,
  actor,
  addKind = null,
  onOpenJob,
}: {
  employee: EmployeeDTO;
  employees: EmployeeDTO[];
  jobs: JobDTO[];
  customers?: CustomerDTO[];
  estimates?: EstimateDTO[];
  invoices?: InvoiceDTO[];
  settings: PayrollSettingsDTO;
  now: Date;
  periodOffset: number;
  onPrev: () => void;
  onNext: () => void;
  solo?: boolean;
  canEdit?: boolean;
  actor: string;
  addKind?: EntryKind | null;
  onOpenJob: (jobId: string) => void;
}) {
  const current = periodForCrew(settings, employee, now, periodOffset);
  const storedCurrent = employee.payPeriods.find(
    (period) => period.startDate === current.start && period.endDate === current.end
  );
  const locked =
    !canEdit ||
    storedCurrent?.status === "APPROVED" ||
    storedCurrent?.status === "PAID" ||
    storedCurrent?.status === "LOCKED";

  return (
    <div className="schedule-screen">
      <TimesheetBoard
        key={`${employee.id}-schedule`}
        employee={employee}
        crew={employees}
        jobs={jobs}
        customers={customers}
        estimates={estimates}
        invoices={invoices}
        actor={actor}
        locked={locked}
        canEdit={canEdit}
        now={now}
        periodStart={current.start}
        periodEnd={current.end}
        onOpenJob={onOpenJob}
        addKind={addKind}
        shopName={settings.businessName}
        onPrevEmployee={onPrev}
        onNextEmployee={onNext}
        canFlipEmployee={!solo && employees.length > 1}
      >
        <ScheduleWho
          employee={employee}
          onPrev={onPrev}
          onNext={onNext}
          solo={solo}
          hint
          index={employees.findIndex((row) => row.id === employee.id)}
          count={employees.length}
        />
      </TimesheetBoard>
    </div>
  );
}

function CompanyDesk({
  settings,
  employees,
  jobs,
  customers,
  invoices,
  estimates,
  onEditPayroll,
  onRerunSetup,
}: {
  settings: PayrollSettingsDTO;
  employees: EmployeeDTO[];
  jobs: JobDTO[];
  customers: CustomerDTO[];
  invoices: InvoiceDTO[];
  estimates: EstimateDTO[];
  onEditPayroll: () => void;
  onRerunSetup: () => void;
}) {
  const { id, setId, ink, setInk } = useShellTheme();
  const device = useDeviceLook();
  const [, startTheme] = useTransition();
  const [pay, setPay] = useState(() =>
    parsePayPrefs({
      acceptCard: settings.acceptCard,
      acceptAch: settings.acceptAch,
      acceptCash: settings.acceptCash,
      depositPercent: settings.depositPercent,
    })
  );
  return (
    <section className="company-desk">
      <div className="company-head-row">
        <h1 className="desk-title">Company</h1>
        <SignOutButton />
      </div>
      <BrandLockup settings={settings} />
      {/* Go-public B1: pick your own PIN (banner while it is still the end of a phone number). */}
      <ChangePin office />
      <div className="company-block" data-theme-settings="1">
        <ThemePicker
          compact
          value={id}
          ink={ink}
          onInk={(next) => {
            setInk(next);
            startTheme(async () => {
              await saveShellTheme({ theme: id, ink: formatShellInk(next), actor: "Office" });
            });
          }}
          onChange={(next) => {
            setId(next);
            // This phone follows the pick right away (and keeps it over its own Dark | Light pill pick).
            writeDeviceLook(device.accountKey, next);
            startTheme(async () => {
              await saveShellTheme({ theme: next, ink: formatShellInk(ink), actor: "Office" });
            });
          }}
        />
      </div>
      <div className="company-block">
        <ReplayAppTutorial />
      </div>
      <div className="company-block">
        <HelpModeToggle />
      </div>
      <div className="company-block">
        <VoiceChoice />
      </div>
      <div className="company-block">
        <AiPrivacySettings />
      </div>
      <div className="company-block">
        <p className="card-label">Business</p>
        <b>{settings.businessName || "—"}</b>
        {settings.businessAddress ? <span>{settings.businessAddress}</span> : null}
        {settings.businessEmail ? <span>{settings.businessEmail}</span> : null}
        {settings.companyPhone ? <span>{settings.companyPhone}</span> : null}
        <span>
          {settings.industry || "Trade"}
          {settings.businessSize ? ` · ${SIZE_LABEL[settings.businessSize] || settings.businessSize}` : ""}
        </span>
      </div>
      <div className="company-block" data-pay-settings="1">
        <PaymentPrefsForm
          value={pay}
          onChange={(next) => {
            setPay(next);
            startTheme(async () => {
              await savePayPrefs({ ...next, actor: "Office" });
            });
          }}
        />
      </div>
      <div className="company-block">
        <p className="card-label">Books</p>
        <span>{BOOKS_LABEL[settings.accountingSoftware]}</span>
      </div>
      <div className="company-block">
        <p className="card-label">Bosses with app access</p>
        {settings.bosses.length ? (
          settings.bosses.map((boss) => (
            <span key={boss.id}>
              {boss.firstName} {boss.lastName}
              {boss.isOwner ? " · owner" : ""}
              {boss.phone ? ` · ${boss.phone}` : ""}
            </span>
          ))
        ) : (
          <span>Owner only</span>
        )}
      </div>
      <div className="company-block">
        <p className="card-label">Company line</p>
        {settings.companyPhone ? <span>{settings.companyPhone}</span> : null}
        {settings.billing?.canUseAnswering && realAnsweringLine(settings.answeringLine) ? (
          <div className="setup-preview">
            <b>AI answering line</b>
            <span>{realAnsweringLine(settings.answeringLine)}</span>
          </div>
        ) : (
          <div className="setup-preview locked-addon" data-addon-locked="1">
            <b>AI answering line</b>
            <span>{realAnsweringLine(settings.answeringLine) || "Not connected yet"}</span>
            <small>Locked until you buy the ${settings.billing?.addonPrice || 59}/mo add-on.</small>
          </div>
        )}
        {/* AI call answering (lib/answering): setup + Call Cards live on their own office-only pages. */}
        <a className="ghost-action" href="/answering" data-answering-link="setup" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 52, fontSize: 17, fontWeight: 800, textDecoration: "none" }}>
          AI answering setup
        </a>
        <a className="ghost-action" href="/calls" data-answering-link="calls" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 52, fontSize: 17, fontWeight: 800, textDecoration: "none" }}>
          Calls the AI took
        </a>
      </div>
      <BillingDesk billing={settings.billing || emptyBillingDTO()} />
      <YearEndBooks
        jobs={jobs}
        invoices={invoices}
        estimates={estimates}
        employees={employees}
        companyName={settings.businessName}
        billing={settings.billing || emptyBillingDTO()}
      />
      {/* Moved from the old Roster › Archive dropdowns (only the files with no other home). */}
      <OfficeRecords jobs={jobs} customers={customers} invoices={invoices} estimates={estimates} />
      <div className="company-block legal-links" data-legal-links="1">
        <p className="card-label">Legal</p>
        <a href="/terms">Terms & Conditions</a>
        <a href="/privacy">Privacy Policy</a>
        <small>
          {settings.termsAcceptedAt
            ? `Agreed ${new Date(settings.termsAcceptedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · v${settings.termsVersion || "—"}`
            : "14-day trial, $199/mo or $1,990/yr flat-rate, answering +$59, 1% invoice fee, and job-site limits."}
        </small>
      </div>
      <button type="button" className="ghost-action hours" onClick={onEditPayroll}>
        Set pay period
      </button>
      <button type="button" className="ghost-action" onClick={onRerunSetup}>
        Run setup again
      </button>
      {/* App Store 5.1.1(v): office/owner can delete the whole shop. Two steps: open, then type DELETE. */}
      <DeleteShopAccount />
    </section>
  );
}

function PhotoEditor({
  employee,
  live,
}: {
  employee: EmployeeDTO;
  live: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className={`crew-photo ${live ? "duty-active" : "duty-off"}`}>
      <img src={employee.photoUrl ?? "/avatars/generic.svg"} alt="" />
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const form = new FormData();
          form.set("employeeId", employee.id);
          form.set("actor", ACTOR);
          form.set("file", file);
          startTransition(async () => {
            const response = await fetch("/api/upload", { method: "POST", body: form });
            if (!response.ok) {
              toast.error("Photo upload failed.");
              return;
            }
            router.refresh();
          });
        }}
      />
      <button
        type="button"
        className="photo-cam"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
        aria-label="Change photo"
      >
        <Camera className="size-3" />
      </button>
    </div>
  );
}

function ClockMarks({ live }: { live: boolean }) {
  return (
    <div className="crew-clock-marks" role="status" aria-label={live ? "Clocked in" : "Clocked out"} data-clock={live ? "in" : "out"}>
      <span className={`clock-mark in${live ? " on" : ""}`} aria-hidden="true">
        {live ? <Check strokeWidth={3} /> : null}
      </span>
      <span className={`clock-mark out${!live ? " on" : ""}`} aria-hidden="true">
        {!live ? <X strokeWidth={3} /> : null}
      </span>
    </div>
  );
}

function IdentityEditor({ employee, live }: { employee: EmployeeDTO; live: boolean }) {
  const mock = isMockSeedId(employee.id);

  function saveFirst(value: string) {
    if (mock) return;
    const firstName = value.trim();
    if (!firstName || firstName === employee.firstName) return;
    void updateIdentity({
      employeeId: employee.id,
      actor: ACTOR,
      firstName,
      lastName: employee.lastName,
      jobTitle: employee.jobTitle,
    }).catch(() => toast.error("Could not update name."));
  }

  function saveLast(value: string) {
    if (mock) return;
    const lastName = value.trim();
    if (!lastName || lastName === employee.lastName) return;
    void updateIdentity({
      employeeId: employee.id,
      actor: ACTOR,
      firstName: employee.firstName,
      lastName,
      jobTitle: employee.jobTitle,
    }).catch(() => toast.error("Could not update name."));
  }

  return (
    <div className="crew-identity">
      <PhotoEditor employee={employee} live={live} />
      <div className="crew-identity-copy">
        <div className="crew-legal-name">
          <input
            defaultValue={employee.firstName}
            key={`${employee.id}-first`}
            className="name-field"
            aria-label="First name"
            onBlur={(event) => saveFirst(event.target.value)}
          />
          <input
            defaultValue={employee.lastName}
            key={`${employee.id}-last`}
            className="name-field"
            aria-label="Last name"
            onBlur={(event) => saveLast(event.target.value)}
          />
        </div>
        <ClockMarks live={live} />
      </div>
    </div>
  );
}

// Built but not placed on any screen yet (no approved mockup). Exported so it stays type-checked.
export function RemoveEmployee({ employee }: { employee: EmployeeDTO }) {
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setAcknowledged(false);
      }}
    >
      <DialogTrigger asChild>
        <button type="button" className="ghost-action remove">
          Remove
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" data-employee-delete="1">
        <DialogHeader>
          <DialogTitle>Permanent deletion of employee records</DialogTitle>
          <DialogDescription>
            Official notice regarding {employee.firstName} {employee.lastName}. This action is final.
          </DialogDescription>
        </DialogHeader>
        <div className="employee-delete-notice">
          <p>
            You are requesting the irreversible destruction of this employee’s personnel file, including time
            records, pay periods, year-to-date wage amounts, federal and state withholding figures, and related
            payroll history.
          </p>
          <p>
            Deleted records cannot be recovered from this application and may no longer be available for wage
            reporting, tax audit, unemployment claims, or other legal inquiries. Retain any copies required by
            applicable tax and employment law before you proceed.
          </p>
          <label className="terms-accept" data-employee-delete-ack="1">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>
              I am authorized to delete this file. I understand this removal is permanent, cannot be undone, and
              may affect tax and payroll recordkeeping.
            </span>
          </label>
        </div>
        <DialogFooter>
          <button type="button" className="ghost-action" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="ghost-action remove"
            disabled={pending || !acknowledged}
            data-employee-delete-confirm="1"
            onClick={() =>
              startTransition(async () => {
                try {
                  await deleteEmployee({ employeeId: employee.id, actor: ACTOR });
                  setOpen(false);
                  router.replace("/");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not remove.");
                }
              })
            }
          >
            Permanently delete records
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewEmployeeDialog() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="tumbler-step job-flip job-add" aria-label="Add employee" data-no-swipe>
          +
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add person</DialogTitle>
        </DialogHeader>
        <form
          className="add-form"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            startTransition(async () => {
              try {
                const id = await createEmployee({
                  actor: ACTOR,
                  firstName: String(data.get("firstName")),
                  lastName: String(data.get("lastName")),
                  jobTitle: String(data.get("jobTitle")),
                  payType: "HOURLY" as PayType,
                  hourlyRate: Number(data.get("hourlyRate") || 0),
                  phone: String(data.get("phone") || ""),
                });
                setOpen(false);
                router.replace(`/?id=${id}`);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not add.");
              }
            });
          }}
        >
          <label className="settings-field">
            First name
            <input name="firstName" required autoFocus />
          </label>
          <label className="settings-field">
            Last name
            <input name="lastName" required />
          </label>
          <label className="settings-field">
            Job title
            <input name="jobTitle" required />
          </label>
          <label className="settings-field">
            Hourly rate
            <input name="hourlyRate" type="number" step="0.01" min="0" />
          </label>
          <label className="settings-field">
            Phone
            <input
              name="phone"
              type="tel"
              onInput={(e) => {
                const input = e.currentTarget;
                input.value = formatPhoneNumber(input.value);
              }}
            />
          </label>
          <button type="submit" disabled={pending}>
            Add
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
