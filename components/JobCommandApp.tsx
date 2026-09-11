"use client";

import AddCustomerForm from "@/components/AddCustomerForm";
import BossJobsBoard from "@/components/BossJobsBoard";
import CrewMap from "@/components/CrewMap";
import CrewMetrics from "@/components/CrewMetrics";
import CrewRolodex from "@/components/CrewRolodex";
import EditHoursCalendar from "@/components/EditHoursCalendar";
import EmployeeHome from "@/components/EmployeeHome";
import EmployeeJobs from "@/components/EmployeeJobs";
import EstimatesBoard, { TimeCardsBoard } from "@/components/EstimatesBoard";
import JobStatusRail from "@/components/JobStatusRail";
import JobTumbler from "@/components/JobTumbler";
import PaperNav from "@/components/PaperNav";
import ProfilePage from "@/components/ProfilePage";
import PropertySheet from "@/components/PropertySheet";
import SettingsPage from "@/components/SettingsPage";
import TalkButton from "@/components/TalkButton";
import {
  lockJobToCrew,
  activeJobs,
  assignedJob,
  tumblerIndexForCrew,
  toggleCrewClock,
  toggleCrewGps,
  updateWeeklySchedule,
} from "@/lib/assign";
import { applyCommands } from "@/lib/commands";
import {
  commitShop,
  getServerShopSnapshot,
  getShopSnapshot,
  resetShop,
  subscribeShop,
  type PersistedShop,
} from "@/lib/session";
import type {
  DaySchedule,
  Job,
  JobStatus,
  NavTab,
  Role,
  ShopSnapshot,
  ShopView,
  TalkResult,
} from "@/lib/types";
import { useLiveDate } from "@/lib/use-live-time";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

const TABS: { id: NavTab; label: string; icon: string }[] = [
  { id: "command", label: "Command", icon: "▣" },
  { id: "jobs", label: "Jobs", icon: "⚒" },
  { id: "profile", label: "Profile", icon: "☺" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

export default function JobCommandApp() {
  const shop = useSyncExternalStore(
    subscribeShop,
    getShopSnapshot,
    getServerShopSnapshot,
  );
  const { jobs, crew, estimates, timeCards, employeeId, settings } = shop;
  const [role, setRole] = useState<Role>("boss");
  const [tab, setTab] = useState<NavTab>("command");
  const [paper, setPaper] = useState<"jobs" | "estimates" | "timecards">("jobs");
  const [desk, setDesk] = useState<"crew" | "hours">("crew");
  const [crewIndex, setCrewIndex] = useState(0);
  const [jobIndex, setJobIndex] = useState(() =>
    tumblerIndexForCrew(
      getServerShopSnapshot().jobs,
      getServerShopSnapshot().crew[0]?.id ?? "",
      getServerShopSnapshot().crew[0]?.currentJobId ?? null,
    ),
  );
  const [ticking, setTicking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [propertyOpen, setPropertyOpen] = useState(false);
  const [sheetJobId, setSheetJobId] = useState<string | null>(null);
  const fieldDate = useLiveDate();

  const member = crew[crewIndex] ?? crew[0];
  const employee =
    crew.find((row) => row.id === employeeId) ?? crew[0] ?? member;
  const actor = role === "employee" ? employee : member;
  const stack = useMemo(() => activeJobs(jobs), [jobs]);
  const selectedJob = stack[jobIndex] ?? null;
  const assigned =
    actor ? assignedJob(jobs, actor) : null;
  const property =
    jobs.find((job) => job.id === sheetJobId) ??
    assigned ??
    (role === "boss" ? selectedJob : null);

  const snapshot: ShopSnapshot = {
    jobs,
    crew,
    estimates,
    timeCards,
    selectedJobId: property?.id ?? selectedJob?.id ?? null,
    selectedCrewId: actor?.id ?? null,
  };

  useEffect(() => {
    if (!notice) return undefined;
    const id = window.setTimeout(() => setNotice(null), 2800);
    return () => window.clearTimeout(id);
  }, [notice]);

  function patchShop(partial: Partial<PersistedShop>) {
    commitShop({ ...getShopSnapshot(), ...partial });
  }

  function ping(message: string) {
    if (!settings.pageAlerts) return;
    setNotice(message);
  }

  function goView(view: ShopView | null) {
    if (!view) return;
    if (view === "hours") {
      setTab("command");
      setDesk("hours");
      return;
    }
    if (view === "command") {
      setTab("command");
      setDesk("crew");
      return;
    }
    setTab("jobs");
    setPaper(view);
  }

  function applyTalk(result: TalkResult) {
    const next = applyCommands(snapshot, result.commands);
    patchShop({
      jobs: next.state.jobs,
      crew: next.state.crew,
      estimates: next.state.estimates,
      timeCards: next.state.timeCards,
    });
    goView(next.view);
    ping(result.say || next.notices.join(" "));
    if (member) {
      setJobIndex(
        tumblerIndexForCrew(
          next.state.jobs,
          member.id,
          next.state.crew.find((row) => row.id === member.id)?.currentJobId ??
            null,
        ),
      );
    }
  }

  function setJobStatus(jobId: string, status: JobStatus) {
    applyTalk({
      say: "",
      commands: [{ type: "set_status", query: jobId, status }],
    });
  }

  function deleteJob(jobId: string) {
    applyTalk({
      say: "",
      commands: [{ type: "delete_job", query: jobId }],
    });
    setPropertyOpen(false);
    setSheetJobId(null);
  }

  function addCustomer(input: {
    customerName: string;
    address: string;
    jobTitle: string;
    phone: string;
  }) {
    applyTalk({
      say: `Added ${input.customerName} as a new lead.`,
      commands: [
        {
          type: "create_job",
          customerName: input.customerName,
          address: input.address,
          jobTitle: input.jobTitle,
          phone: input.phone,
          status: "lead",
        },
      ],
    });
  }

  function lockCurrentJob() {
    if (!member || !selectedJob) return;
    if (selectedJob.workerId === member.id) return;
    const result = lockJobToCrew(jobs, crew, selectedJob.id, member.id);
    if (!result.locked) {
      ping("Completed jobs stay closed.");
      return;
    }
    patchShop({ jobs: result.jobs, crew: result.crew });
    setTicking(true);
    window.setTimeout(() => setTicking(false), 320);
    ping(`Locked ${selectedJob.jobTitle} to ${member.name}.`);
  }

  function selectCrew(nextIndex: number) {
    setCrewIndex(nextIndex);
    const nextMember = crew[nextIndex];
    if (!nextMember) return;
    setJobIndex(
      tumblerIndexForCrew(jobs, nextMember.id, nextMember.currentJobId),
    );
  }

  function toggleClock() {
    if (!member) return;
    patchShop({ crew: toggleCrewClock(getShopSnapshot().crew, member.id) });
  }

  function toggleEmployeeClock() {
    if (!employee) return;
    const wasOff = employee.status === "off";
    patchShop({ crew: toggleCrewClock(getShopSnapshot().crew, employee.id) });
    ping(
      wasOff
        ? `${employee.name.split(" ")[0]} clocked in.`
        : `${employee.name.split(" ")[0]} clocked out.`,
    );
  }

  function toggleGps() {
    if (!member) return;
    patchShop({ crew: toggleCrewGps(getShopSnapshot().crew, member.id) });
  }

  function saveHours(schedule: DaySchedule[]) {
    if (!member) return;
    patchShop({
      crew: updateWeeklySchedule(getShopSnapshot().crew, member.id, schedule),
    });
    setDesk("crew");
    ping(`Updated ${member.name.split(" ")[0]}'s weekly hours.`);
  }

  function openDirections(job?: Job) {
    const target = job ?? assigned ?? (role === "boss" ? selectedJob : null);
    if (!target) {
      ping("No active property locked to this crew.");
      return;
    }
    setSheetJobId(target.id);
    setPropertyOpen(true);
  }

  function resetDemoShop() {
    resetShop();
    const next = getShopSnapshot();
    setCrewIndex(0);
    setJobIndex(
      tumblerIndexForCrew(
        next.jobs,
        next.crew[0]?.id ?? "",
        next.crew[0]?.currentJobId ?? null,
      ),
    );
    setPaper("jobs");
    setDesk("crew");
    setPropertyOpen(false);
    setSheetJobId(null);
    setNotice("Demo shop reset.");
  }

  const paperTabs = (
    <PaperNav paper={paper} onPaper={setPaper} />
  );

  return (
    <main className={`app-shell theme-${role}`}>
      <div className="grain" />
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/job-command-logo.jpg" alt="JOB COMMAND" />
          </div>
          <div>
            <p className="eyebrow">
              {role === "boss" ? "BOSS COMMAND" : "FIELD OPERATIONS"}
            </p>
            <p className="brand-name">
              <span className="job-word">JOB </span>
              <span className="command-word">COMMAND</span>
            </p>
          </div>
        </div>
        <div className="topbar-right">
          <div className="role-switcher" role="tablist" aria-label="Switch role">
            <button
              type="button"
              className={`role-tab employee ${role === "employee" ? "on" : ""}`}
              role="tab"
              aria-selected={role === "employee"}
              onClick={() => {
                setRole("employee");
                setTab("command");
                setDesk("crew");
                setPropertyOpen(false);
                setSheetJobId(null);
              }}
            >
              EMPLOYEE
            </button>
            <button
              type="button"
              className={`role-tab boss ${role === "boss" ? "on" : ""}`}
              role="tab"
              aria-selected={role === "boss"}
              onClick={() => {
                setRole("boss");
                setTab("command");
              }}
            >
              BOSS
            </button>
          </div>
          <p className="account-chip">{settings.account}</p>
        </div>
      </header>

      {role === "employee" && tab === "command" && employee && (
        <EmployeeHome
          member={employee}
          crew={crew}
          jobs={jobs}
          onToggleClock={toggleEmployeeClock}
          onDirections={openDirections}
        />
      )}

      {role === "boss" && tab === "command" && member && desk === "hours" && (
        <EditHoursCalendar
          member={member}
          onSave={saveHours}
          onCancel={() => setDesk("crew")}
        />
      )}

      {role === "boss" && tab === "command" && member && desk === "crew" && (
        <section className="page crew-desk">
          <div className="crew-head">
            <p className="section-kicker">{fieldDate}</p>
            <h1>CREW</h1>
          </div>
          <JobStatusRail jobs={jobs} />
          <CrewRolodex
            crew={crew}
            index={crewIndex}
            property={property}
            onIndexChange={selectCrew}
            onEditHours={() => setDesk("hours")}
            onGetDirections={() => openDirections()}
          />
          <JobTumbler
            jobs={jobs}
            jobIndex={jobIndex}
            member={member}
            ticking={ticking}
            onIndexChange={setJobIndex}
            onLock={lockCurrentJob}
          />
          <CrewMetrics
            member={member}
            job={selectedJob}
            onToggleClock={toggleClock}
            onToggleGps={toggleGps}
          />
          <CrewMap member={member} job={property} />
        </section>
      )}

      {tab === "jobs" && role === "boss" && paper === "jobs" && (
        <BossJobsBoard
          jobs={jobs}
          estimates={estimates}
          timeCards={timeCards}
          onStatus={setJobStatus}
          onDelete={deleteJob}
          onOpenEstimates={() => setPaper("estimates")}
          onOpenTimeCards={() => setPaper("timecards")}
        >
          {paperTabs}
          <AddCustomerForm onAdd={addCustomer} />
        </BossJobsBoard>
      )}

      {tab === "jobs" && role === "boss" && paper === "estimates" && (
        <EstimatesBoard
          jobs={jobs}
          estimates={estimates}
          onBack={() => setPaper("jobs")}
        >
          {paperTabs}
        </EstimatesBoard>
      )}

      {tab === "jobs" && role === "boss" && paper === "timecards" && (
        <TimeCardsBoard
          crew={crew}
          jobs={jobs}
          timeCards={timeCards}
          onBack={() => setPaper("jobs")}
        >
          {paperTabs}
        </TimeCardsBoard>
      )}

      {tab === "jobs" && role === "employee" && employee && (
        <EmployeeJobs
          member={employee}
          jobs={jobs}
          onStatus={setJobStatus}
          onDirections={openDirections}
        />
      )}

      {tab === "profile" && actor && (
        <ProfilePage
          member={actor}
          jobs={jobs}
          estimates={estimates}
          timeCards={timeCards}
          crew={crew}
          role={role}
          employeeId={employeeId}
          onPickEmployee={(id) => {
            patchShop({ employeeId: id });
            ping(
              `Field login is ${crew.find((row) => row.id === id)?.name ?? "crew"}.`,
            );
          }}
        />
      )}

      {tab === "settings" && (
        <SettingsPage
          role={role}
          settings={settings}
          onSettings={(next) => patchShop({ settings: next })}
          onReset={resetDemoShop}
        />
      )}

      <TalkButton snapshot={snapshot} onResult={applyTalk} />

      <nav className="bottom-nav" aria-label="Primary">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? "selected" : ""}
            onClick={() => {
              setTab(item.id);
              if (item.id !== "command") setDesk("crew");
              if (item.id === "jobs") setPaper("jobs");
            }}
          >
            <span className="nav-icon" aria-hidden="true">
              {item.icon}
            </span>
            {item.label}
          </button>
        ))}
      </nav>

      {notice && <div className="toast">{notice}</div>}
      {propertyOpen && property && actor && (
        <PropertySheet
          job={jobs.find((job) => job.id === property.id) ?? property}
          member={actor}
          onClose={() => {
            setPropertyOpen(false);
            setSheetJobId(null);
          }}
          onStatus={(status) => setJobStatus(property.id, status)}
          onDelete={() => deleteJob(property.id)}
        />
      )}
    </main>
  );
}
