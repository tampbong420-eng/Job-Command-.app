"use client";

import CrewMetrics from "@/components/CrewMetrics";
import CrewRolodex from "@/components/CrewRolodex";
import EmployeeHome from "@/components/EmployeeHome";
import JobTumbler from "@/components/JobTumbler";
import {
  lockJobToCrew,
  activeJobs,
  tumblerIndexForCrew,
  toggleCrewClock,
  toggleCrewGps,
} from "@/lib/assign";
import { CREW, JOBS } from "@/lib/demo-data";
import type { CrewMember, Job, NavTab, Role } from "@/lib/types";
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
  const [crew, setCrew] = useState<CrewMember[]>(CREW);
  const [jobs, setJobs] = useState<Job[]>(JOBS);
  const [crewIndex, setCrewIndex] = useState(0);
  const [jobIndex, setJobIndex] = useState(() =>
    tumblerIndexForCrew(JOBS, CREW[0].id, CREW[0].currentJobId),
  );
  const [ticking, setTicking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fieldDate = useLiveDate();

  const member = crew[crewIndex] ?? crew[0];
  const stack = useMemo(() => activeJobs(jobs), [jobs]);
  const selectedJob = stack[jobIndex] ?? null;

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

      {role === "boss" && tab === "command" && member && (
        <section className="page crew-desk">
          <div className="crew-head">
            <p className="section-kicker">{fieldDate}</p>
            <h1>CREW</h1>
          </div>
          <CrewRolodex
            crew={crew}
            index={crewIndex}
            onIndexChange={selectCrew}
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
        </section>
      )}

      {tab === "jobs" && (
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
            onClick={() => setTab(item.id)}
          >
            <span className="nav-icon" aria-hidden="true">
              {item.icon}
            </span>
            {item.label}
          </button>
        ))}
      </nav>

      {notice && <div className="toast">{notice}</div>}
    </main>
  );
}
