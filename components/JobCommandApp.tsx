"use client";

import BossJobsBoard from "@/components/BossJobsBoard";
import CrewMap from "@/components/CrewMap";
import CrewMetrics from "@/components/CrewMetrics";
import CrewRolodex from "@/components/CrewRolodex";
import EditHoursCalendar from "@/components/EditHoursCalendar";
import EmployeeHome from "@/components/EmployeeHome";
import JobStatusRail from "@/components/JobStatusRail";
import JobTumbler from "@/components/JobTumbler";
import PropertySheet from "@/components/PropertySheet";
import {
  lockJobToCrew,
  activeJobs,
  assignedJob,
  tumblerIndexForCrew,
  toggleCrewClock,
  toggleCrewGps,
  updateWeeklySchedule,
} from "@/lib/assign";
import { CREW, JOBS } from "@/lib/demo-data";
import type { CrewMember, DaySchedule, Job, NavTab, Role } from "@/lib/types";
import { useLiveDate } from "@/lib/use-live-time";
import { useEffect, useMemo, useState } from "react";

const TABS: { id: NavTab; label: string; icon: string }[] = [
  { id: "command", label: "Command", icon: "▣" },
  { id: "jobs", label: "Jobs", icon: "⚒" },
  { id: "profile", label: "Profile", icon: "☺" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

export default function JobCommandApp() {
  const [role, setRole] = useState<Role>("boss");
  const [tab, setTab] = useState<NavTab>("command");
  const [desk, setDesk] = useState<"crew" | "hours">("crew");
  const [crew, setCrew] = useState<CrewMember[]>(CREW);
  const [jobs, setJobs] = useState<Job[]>(JOBS);
  const [crewIndex, setCrewIndex] = useState(0);
  const [jobIndex, setJobIndex] = useState(() =>
    tumblerIndexForCrew(JOBS, CREW[0].id, CREW[0].currentJobId),
  );
  const [ticking, setTicking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [propertyOpen, setPropertyOpen] = useState(false);
  const fieldDate = useLiveDate();

  const member = crew[crewIndex] ?? crew[0];
  const stack = useMemo(() => activeJobs(jobs), [jobs]);
  const selectedJob = stack[jobIndex] ?? null;
  const property = member ? assignedJob(jobs, member) ?? selectedJob : null;

  useEffect(() => {
    if (!notice) return undefined;
    const id = window.setTimeout(() => setNotice(null), 2800);
    return () => window.clearTimeout(id);
  }, [notice]);

  function lockCurrentJob() {
    if (!member || !selectedJob) return;
    if (selectedJob.workerId === member.id) return;
    const result = lockJobToCrew(jobs, crew, selectedJob.id, member.id);
    if (!result.locked) {
      setNotice("Completed jobs stay closed.");
      return;
    }
    setJobs(result.jobs);
    setCrew(result.crew);
    setTicking(true);
    window.setTimeout(() => setTicking(false), 320);
    setNotice(`Locked ${selectedJob.jobTitle} to ${member.name}.`);
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
    setCrew((current) => toggleCrewClock(current, member.id));
  }

  function toggleGps() {
    if (!member) return;
    setCrew((current) => toggleCrewGps(current, member.id));
  }

  function saveHours(schedule: DaySchedule[]) {
    if (!member) return;
    setCrew((current) => updateWeeklySchedule(current, member.id, schedule));
    setDesk("crew");
    setNotice(`Updated ${member.name.split(" ")[0]}'s weekly hours.`);
  }

  function openDirections() {
    if (!property) {
      setNotice("No active property locked to this crew.");
      return;
    }
    setPropertyOpen(true);
  }

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
          <p className="account-chip">ERIC12345</p>
        </div>
      </header>

      {role === "employee" && tab === "command" && member && (
        <EmployeeHome member={member} jobs={jobs} />
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
            onGetDirections={openDirections}
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

      {tab === "jobs" && role === "boss" && <BossJobsBoard jobs={jobs} />}

      {tab === "jobs" && role === "employee" && (
        <section className="page stub-page">
          <p className="section-kicker">Jobs</p>
          <h1>
            Active
            <br />
            <strong>Board.</strong>
          </h1>
          <p>
            Job packets stay on the Command tumbler for now. Swipe and lock from
            the CREW screen.
          </p>
        </section>
      )}

      {tab === "profile" && member && (
        <section className="page stub-page">
          <p className="section-kicker">Profile</p>
          <h1>
            {member.name.split(" ")[0]}
            <br />
            <strong>Card.</strong>
          </h1>
          <p>
            {member.role} · {member.phone}
          </p>
        </section>
      )}

      {tab === "settings" && (
        <section className="page stub-page">
          <p className="section-kicker">Settings</p>
          <h1>
            Shop
            <br />
            <strong>Controls.</strong>
          </h1>
          <p>Employee tools are on hold while dispatch is rebuilt on Command.</p>
        </section>
      )}

      <nav className="bottom-nav" aria-label="Primary">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? "selected" : ""}
            onClick={() => {
              setTab(item.id);
              if (item.id !== "command") setDesk("crew");
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
      {propertyOpen && property && member && (
        <PropertySheet
          job={property}
          member={member}
          onClose={() => setPropertyOpen(false)}
        />
      )}
    </main>
  );
}
