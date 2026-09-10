"use client";

import { useCallback, useEffect, useState } from "react";
import "./JobCommandApp.css";

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function formatClockTime(iso) {
  if (!iso) return "TBD";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "TBD";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function firstStop(jobs) {
  if (!jobs.length) return null;
  return [...jobs].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )[0];
}

export default function JobCommandApp({
  employeeToken,
  initialEmployee = null,
  initialJobs = [],
  initialCrew = [],
  initialHours,
  initialError = null,
}) {
  const [employee, setEmployee] = useState(initialEmployee);
  const [isOnClock, setIsOnClock] = useState(Boolean(initialEmployee?.is_on_clock));
  const [activeTab, setActiveTab] = useState("command");
  const [jobs, setJobs] = useState(initialJobs);
  const [teamMembers, setTeamMembers] = useState(initialCrew);
  const [hours, setHours] = useState(
    initialHours ?? { todaySeconds: 0, weekSeconds: 0, clockedInAt: null },
  );
  const [activeCall, setActiveCall] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const [gpsHint, setGpsHint] = useState("GPS stays off until you clock in.");
  const [now, setNow] = useState(() => Date.now());
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());

  const applyPayload = useCallback((data) => {
    setEmployee(data.employee ?? null);
    setIsOnClock(Boolean(data.employee?.is_on_clock));
    setJobs(data.jobs ?? []);
    setTeamMembers(data.crew ?? []);
    setHours(
      data.hours ?? { todaySeconds: 0, weekSeconds: 0, clockedInAt: null },
    );
    setFetchedAt(Date.now());
  }, []);

  const fetchEmployeeData = useCallback(
    async (token) => {
      if (!token) return;
      try {
        const res = await fetch(`/api/crew/${token}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Link is invalid");
        }
        applyPayload(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load portal");
      }
    },
    [applyPayload],
  );

  useEffect(() => {
    if (!employeeToken) return undefined;
    const id = window.setInterval(() => {
      void fetchEmployeeData(employeeToken);
    }, 8000);
    return () => window.clearInterval(id);
  }, [employeeToken, fetchEmployeeData]);

  useEffect(() => {
    if (!isOnClock) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isOnClock]);

  const liveDrift = isOnClock ? Math.max(0, Math.floor((now - fetchedAt) / 1000)) : 0;
  const liveTodaySeconds = hours.todaySeconds + liveDrift;
  const liveWeekSeconds = hours.weekSeconds + liveDrift;

  const currentJob = firstStop(jobs);

  const updateClockStatusAPI = useCallback(
    async (token, status, coords) => {
      const res = await fetch(`/api/crew/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: status ? "clock_in" : "clock_out",
          lat: coords?.lat,
          lng: coords?.lng,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Clock update failed");
      }
      applyPayload(data);
    },
    [applyPayload],
  );

  const readGps = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsHint("This device cannot share GPS.");
      return Promise.resolve(undefined);
    }
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGpsHint("Location sharing starts while you are on the clock.");
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        () => {
          setGpsHint("Location permission was denied. You can still clock in.");
          resolve(undefined);
        },
        { enableHighAccuracy: true, timeout: 8000 },
      );
    });
  }, []);

  const toggleClock = async () => {
    if (!employeeToken || busy) return;
    setBusy(true);
    setError(null);
    try {
      const nextStatus = !isOnClock;
      const coords = nextStatus ? await readGps() : undefined;
      await updateClockStatusAPI(employeeToken, nextStatus, coords);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clock update failed");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!employee?.is_on_clock || !employeeToken) return undefined;
    if (!navigator.geolocation) return undefined;
    const watch = navigator.geolocation.watchPosition(
      (position) => {
        void fetch(`/api/crew/${employeeToken}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "location",
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          }),
        });
      },
      () => {
        setGpsHint("Live GPS paused — location permission is off.");
      },
      { enableHighAccuracy: true, maximumAge: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [employee?.is_on_clock, employeeToken]);

  const handleInAppCall = (member) => {
    if (!isOnClock) {
      alert("Clock in before paging crew through Job Command.");
      return;
    }
    if (!member.onClock) {
      alert(
        `${member.name} is currently off the clock and cannot be reached via in-app paging.`,
      );
      return;
    }
    setActiveCall(member);
  };

  if (!employee) {
    return (
      <div className="job-command-container">
        <header className="app-header">
          <div className="brand">JOB COMMAND</div>
          <div className="user-badge">EMPLOYEE PORTAL</div>
        </header>
        <p className="portal-error">
          {error ?? "Ask the boss to send the employee login link again."}
        </p>
      </div>
    );
  }

  return (
    <div className={`job-command-container ${isOnClock ? "is-live" : "is-idle"}`}>
      <header className="app-header">
        <div className="brand">JOB COMMAND</div>
        <div className="user-badge">EMPLOYEE PORTAL</div>
      </header>

      <div
        className={`status-banner ${isOnClock ? "clocked-in-glow" : "clocked-out-orange"}`}
        role="status"
      >
        <h2>{isOnClock ? "YOU'RE LIVE & CLOCKED IN" : "STILL AT IT."}</h2>
        <p>Status: {isOnClock ? "Active on the clock" : "Off the clock"}</p>
        <p className="hours-line">
          Today: {formatDuration(liveTodaySeconds)}
          {isOnClock && hours.clockedInAt
            ? ` · live since ${formatClockTime(hours.clockedInAt)}`
            : ""}
        </p>
      </div>

      {activeTab === "command" && (
        <div className="tab-content">
          <button
            className={`action-btn ${isOnClock ? "btn-green-glow" : "btn-orange"}`}
            onClick={toggleClock}
            disabled={busy}
            type="button"
            aria-pressed={isOnClock}
          >
            {busy ? "UPDATING…" : isOnClock ? "CLOCK OUT" : "CLOCK IN"}
          </button>
          {error && <p className="portal-error">{error}</p>}

          <div className="card schedule-card">
            <h3>TODAY&apos;S SHIFT &amp; HOURS</h3>
            <p>
              <strong>First Stop:</strong>{" "}
              {currentJob
                ? `${formatClockTime(currentJob.created_at)} - ${currentJob.title || currentJob.customer_name || "Assigned job"}`
                : "No job scheduled"}
            </p>
            <p>
              <strong>Hours today:</strong> {formatDuration(liveTodaySeconds)}
            </p>
            <p>
              <strong>This week:</strong> {formatDuration(liveWeekSeconds)}
            </p>
          </div>

          {currentJob && (
            <div className="card job-card">
              <h3>TODAY&apos;S JOB DETAILS</h3>
              <p>
                <strong>Customer:</strong>{" "}
                {currentJob.customer_name || "Customer"}
                {currentJob.customer_phone
                  ? ` (${currentJob.customer_phone})`
                  : ""}
              </p>
              <p>
                <strong>Address:</strong> {currentJob.address || "Not provided"}
              </p>

              <div className="notes-box">
                <h4>Boss&apos;s Job Notes &amp; Directives:</h4>
                <p>{currentJob.boss_notes || "No notes posted yet."}</p>
              </div>

              <div className="supplies-box">
                <h4>Required Truck Supplies &amp; Equipment:</h4>
                <p>{currentJob.required_supplies || "No supply list yet."}</p>
              </div>

              {currentJob.address && (
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(currentJob.address)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="nav-link-btn"
                >
                  Get Directions &amp; View Map
                </a>
              )}
              {currentJob.street_view_url && (
                <a
                  href={currentJob.street_view_url}
                  target="_blank"
                  rel="noreferrer"
                  className="nav-link-btn street-view"
                >
                  Open Street View
                </a>
              )}
            </div>
          )}

          <div className="card team-directory-card">
            <h3>CREW COMMUNICATION (ON-CLOCK ONLY)</h3>
            <ul className="team-list">
              {teamMembers.length === 0 && (
                <li className="offline">No other crew on this roster yet.</li>
              )}
              {teamMembers.map((member) => (
                <li
                  key={member.id}
                  className={member.onClock ? "online" : "offline"}
                >
                  <span>
                    {member.name}
                    {member.role ? ` · ${member.role}` : ""} (
                    {member.onClock ? "On Clock" : "Off Clock"})
                  </span>
                  {member.onClock && isOnClock && (
                    <button
                      className="call-btn"
                      type="button"
                      onClick={() => handleInAppCall(member)}
                    >
                      Page / Call
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {activeTab === "jobs" && (
        <div className="tab-content">
          <div className="card">
            <h3>ASSIGNED JOBS</h3>
            {jobs.length === 0 ? (
              <p>No jobs queued for you yet.</p>
            ) : (
              <ul className="jobs-list">
                {jobs.map((job) => (
                  <li key={job.id} className="job-list-item">
                    <div className="job-list-top">
                      <strong>{job.title || job.customer_name || "Job"}</strong>
                      <span className="job-status">{job.status}</span>
                    </div>
                    <p>
                      {job.customer_name || "Customer"}
                      {job.customer_phone ? ` · ${job.customer_phone}` : ""}
                    </p>
                    {job.address && <p>{job.address}</p>}
                    {job.boss_notes && (
                      <div className="notes-box">
                        <h4>Boss notes</h4>
                        <p>{job.boss_notes}</p>
                      </div>
                    )}
                    {job.required_supplies && (
                      <div className="supplies-box">
                        <h4>Supplies</h4>
                        <p>{job.required_supplies}</p>
                      </div>
                    )}
                    {job.address && (
                      <a
                        href={`https://maps.google.com/?q=${encodeURIComponent(job.address)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="nav-link-btn"
                      >
                        Get Directions &amp; View Map
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {activeTab === "profile" && (
        <div className="tab-content">
          <div className="card">
            <h3>RESTRICTED EMPLOYEE PROFILE</h3>
            <p>
              <strong>Name:</strong> {employee.name}
            </p>
            <p>
              <strong>Role:</strong> {employee.role || "Crew"}
            </p>
            <p>
              <strong>Phone:</strong> {employee.phone || "Not on file"}
            </p>
            <p>
              <strong>Clock:</strong> {isOnClock ? "On the clock" : "Off the clock"}
            </p>
            <p>
              <strong>Hours today:</strong> {formatDuration(liveTodaySeconds)}
            </p>
            <p>
              <strong>Hours this week:</strong> {formatDuration(liveWeekSeconds)}
            </p>
            <p className="gps-line">
              {employee.current_lat != null && employee.current_lng != null
                ? `LIVE GPS ${employee.current_lat.toFixed(5)}, ${employee.current_lng.toFixed(5)}`
                : gpsHint}
            </p>
            <p className="restricted-note">
              This unique login link is employee-only. Payroll, dispatch edits,
              and crew admin stay on the boss desk.
            </p>
          </div>
        </div>
      )}

      {activeCall && (
        <div className="call-overlay" role="dialog" aria-modal="true">
          <div className="call-card">
            <p className="kicker">In-app page</p>
            <h3>Paging {activeCall.name}</h3>
            <p>
              Both of you are on the clock. Signaling for a live voice channel
              can attach here; this page keeps the crew directory restricted to
              on-clock employees.
            </p>
            <button
              className="action-btn btn-orange"
              type="button"
              onClick={() => setActiveCall(null)}
            >
              End Page
            </button>
          </div>
        </div>
      )}

      <nav className="bottom-nav" aria-label="Employee views">
        <button
          type="button"
          onClick={() => setActiveTab("command")}
          className={activeTab === "command" ? "active" : ""}
        >
          Command
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("jobs")}
          className={activeTab === "jobs" ? "active" : ""}
        >
          Jobs
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("profile")}
          className={activeTab === "profile" ? "active" : ""}
        >
          Profile
        </button>
      </nav>
    </div>
  );
}
