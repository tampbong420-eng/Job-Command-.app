"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CrewMember, Employee, HoursSummary, Job } from "@/lib/types";
import { jobBotReply } from "@/lib/bot";
import { pagingBlockReason } from "@/lib/paging";
import "./JobCommandMaster.css";

type Role = "employee" | "boss";
type View =
  | "home"
  | "todays-job"
  | "schedule"
  | "crew"
  | "bot-chat"
  | "profile"
  | "boss-links";

type ChatMessage = { sender: "bot" | "user"; text: string };

type TileAccent =
  | "orange"
  | "green"
  | "blue"
  | "yellow"
  | "purple"
  | "slate"
  | "neutral"
  | "boss";

const DEMO_JOB: Job = {
  id: "demo-northline",
  title: "Northline Properties",
  status: "assigned",
  assigned_employee_id: "demo-eric",
  customer_name: "John Doe",
  customer_phone: "501-555-0192",
  address: "123 Painted Post Rd, Hot Springs, AR",
  street_view_url:
    "https://www.google.com/maps/@?api=1&map_action=pano&query=123%20Painted%20Post%20Rd%2C%20Hot%20Springs%2C%20AR",
  boss_notes:
    "Make sure drop cloths cover all perimeter landscaping. Use exterior grade primer on south-facing trim.",
  required_supplies:
    "2x Graco TrueCoat 360, 5 gal Exterior Satin White, 3x Blue Tape rolls, Ladder stabilizer.",
  created_at: "2026-09-10T13:30:00.000Z",
  updated_at: "2026-09-10T13:30:00.000Z",
};

const DEMO_CREW: CrewMember[] = [
  { id: "demo-ricky", name: "Ricky", role: "Lead tech", onClock: true },
  { id: "demo-dina", name: "Dina", role: "Crew", onClock: false },
];

const DEMO_EMPLOYEE: Employee = {
  id: "demo-eric",
  name: "Eric St. Lawrence",
  role: "Field Worker / Contractor",
  phone: null,
  unique_link_token: null,
  is_on_clock: false,
  current_lat: null,
  current_lng: null,
  created_at: "2026-09-10T12:00:00.000Z",
  updated_at: "2026-09-10T12:00:00.000Z",
};

const DEMO_HOURS: HoursSummary = {
  todaySeconds: 0,
  weekSeconds: Math.round(32.5 * 3600),
  clockedInAt: null,
};

const DEMO_SHIFT_LABEL = "08:30 AM — Northline Properties";

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours} hrs`;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function formatWeekHours(totalSeconds: number): string {
  const hours = totalSeconds / 3600;
  if (Number.isInteger(hours)) return `${hours} hrs this week`;
  return `${hours.toFixed(1)} hrs this week`;
}

function formatClockTime(iso: string | null | undefined): string {
  if (!iso) return "TBD";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "TBD";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function firstNameUpper(name: string): string {
  return (name.split(/\s+/)[0] || "CREW").toUpperCase();
}

function firstStop(jobs: Job[]): Job | null {
  if (!jobs.length) return null;
  return [...jobs].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )[0];
}

function mapsUrl(address: string): string {
  return `https://maps.google.com/?q=${encodeURIComponent(address)}`;
}

function Tile({
  accent,
  glowing,
  icon,
  title,
  subtitle,
  onClick,
  disabled,
}: {
  accent: TileAccent;
  glowing?: boolean;
  icon: string;
  title: string;
  subtitle: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`tile tile-${accent}${glowing ? " tile-green-glow" : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="tile-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="tile-text">
        <span className="tile-title">{title}</span>
        <span className="tile-sub">{subtitle}</span>
      </span>
    </button>
  );
}

export default function JobCommandMasterApp({
  initialRole = "employee",
  lockRole = false,
  employeeToken,
  initialEmployee = null,
  initialJobs,
  initialCrew,
  initialHours,
  initialError = null,
}: {
  initialRole?: Role;
  lockRole?: boolean;
  employeeToken?: string;
  initialEmployee?: Employee | null;
  initialJobs?: Job[];
  initialCrew?: CrewMember[];
  initialHours?: HoursSummary;
  initialError?: string | null;
}) {
  const isLivePortal = Boolean(employeeToken);
  const [role, setRole] = useState<Role>(initialRole);
  const [activeView, setActiveView] = useState<View>("home");
  const [employee, setEmployee] = useState<Employee | null>(
    initialEmployee ?? (isLivePortal ? null : DEMO_EMPLOYEE),
  );
  const [isOnClock, setIsOnClock] = useState(
    Boolean(initialEmployee?.is_on_clock),
  );
  const [jobs, setJobs] = useState<Job[]>(
    initialJobs ?? (isLivePortal ? [] : [DEMO_JOB]),
  );
  const [teamMembers, setTeamMembers] = useState<CrewMember[]>(
    initialCrew ?? (isLivePortal ? [] : DEMO_CREW),
  );
  const [hours, setHours] = useState<HoursSummary>(
    initialHours ?? (isLivePortal ? { todaySeconds: 0, weekSeconds: 0, clockedInAt: null } : DEMO_HOURS),
  );
  const [activeCall, setActiveCall] = useState<CrewMember | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      sender: "bot",
      text: "Hello! I am your Job Command assistant. How can I help you coordinate your shift today?",
    },
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError);
  const [busy, setBusy] = useState(false);
  const [gpsHint, setGpsHint] = useState("GPS stays off until you clock in.");
  const [now, setNow] = useState(() => Date.now());
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());
  const [linkName, setLinkName] = useState("");
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [portalEmployees, setPortalEmployees] = useState<Employee[]>([]);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const botTimer = useRef<number | null>(null);

  const currentJob = firstStop(jobs) ?? (isLivePortal ? null : DEMO_JOB);
  const profile = employee ?? DEMO_EMPLOYEE;

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4200);
  }, []);

  const applyPayload = useCallback(
    (data: {
      employee?: Employee | null;
      jobs?: Job[];
      crew?: CrewMember[];
      hours?: HoursSummary;
    }) => {
      setEmployee(data.employee ?? null);
      setIsOnClock(Boolean(data.employee?.is_on_clock));
      setJobs(data.jobs ?? []);
      setTeamMembers(data.crew ?? []);
      setHours(
        data.hours ?? { todaySeconds: 0, weekSeconds: 0, clockedInAt: null },
      );
      setFetchedAt(Date.now());
    },
    [],
  );

  const fetchEmployeeData = useCallback(
    async (token: string) => {
      const res = await fetch(`/api/crew/${token}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Link is invalid");
      }
      applyPayload(data);
      setError(null);
    },
    [applyPayload],
  );

  useEffect(() => {
    if (!employeeToken) return undefined;
    const id = window.setInterval(() => {
      void fetchEmployeeData(employeeToken).catch((err) => {
        setError(err instanceof Error ? err.message : "Could not load portal");
      });
    }, 8000);
    return () => window.clearInterval(id);
  }, [employeeToken, fetchEmployeeData]);

  useEffect(() => {
    if (!isOnClock) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isOnClock]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [chatMessages]);

  useEffect(() => {
    if (!activeCall) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveCall(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeCall]);

  useEffect(() => {
    return () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
      if (botTimer.current) window.clearTimeout(botTimer.current);
    };
  }, []);

  const loadPortalEmployees = useCallback(async () => {
    const res = await fetch("/api/employees");
    const data = await res.json();
    setPortalEmployees(data.employees ?? []);
  }, []);

  const switchRole = (next: Role) => {
    setRole(next);
    if (next === "employee") {
      setActiveView((view) => (view === "boss-links" ? "home" : view));
    }
    if (next === "boss") {
      void loadPortalEmployees();
    }
  };

  useEffect(() => {
    if (role !== "boss" || lockRole || activeView !== "boss-links") {
      return undefined;
    }
    const id = window.setInterval(() => {
      void loadPortalEmployees();
    }, 8000);
    return () => window.clearInterval(id);
  }, [role, lockRole, activeView, loadPortalEmployees]);

  const liveDrift = isOnClock ? Math.max(0, Math.floor((now - fetchedAt) / 1000)) : 0;
  const liveTodaySeconds = hours.todaySeconds + liveDrift;
  const liveWeekSeconds = hours.weekSeconds + liveDrift;

  const shiftLabel = useMemo(() => {
    if (!isLivePortal) return DEMO_SHIFT_LABEL;
    if (!currentJob) return "No job scheduled";
    return `${formatClockTime(currentJob.created_at)} — ${currentJob.title || currentJob.customer_name || "Assigned job"}`;
  }, [isLivePortal, currentJob]);

  const readGps = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsHint("This device cannot share GPS.");
      return Promise.resolve(undefined);
    }
    return new Promise<{ lat: number; lng: number } | undefined>((resolve) => {
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
    if (busy) return;
    const nextStatus = !isOnClock;

    if (!employeeToken) {
      setIsOnClock(nextStatus);
      setHours((prev) => ({
        ...prev,
        clockedInAt: nextStatus ? new Date().toISOString() : null,
      }));
      setFetchedAt(Date.now());
      console.log(`Shift status updated: ${nextStatus ? "ON_CLOCK" : "OFF_CLOCK"}`);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const coords = nextStatus ? await readGps() : undefined;
      const res = await fetch(`/api/crew/${employeeToken}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: nextStatus ? "clock_in" : "clock_out",
          lat: coords?.lat,
          lng: coords?.lng,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Clock update failed");
      applyPayload(data);
      console.log(`Shift status updated: ${nextStatus ? "ON_CLOCK" : "OFF_CLOCK"}`);
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

  const handleInAppCall = (member: CrewMember) => {
    const blocked = pagingBlockReason(isOnClock, member.onClock, member.name);
    if (blocked) {
      showNotice(blocked);
      return;
    }
    setActiveCall(member);
    showNotice(`Connecting secure in-app data call to ${member.name}...`);
  };

  const handleSendMessage = (event: FormEvent) => {
    event.preventDefault();
    const text = inputMessage.trim();
    if (!text) return;

    setChatMessages((prev) => [...prev, { sender: "user", text }]);
    setInputMessage("");

    const reply = jobBotReply(text, {
      isOnClock,
      jobTitle: currentJob?.title || currentJob?.customer_name || "Today's job",
      jobAddress: currentJob?.address || "Address not posted yet",
      supplies: currentJob?.required_supplies || "No supply list yet.",
    });

    if (botTimer.current) window.clearTimeout(botTimer.current);
    botTimer.current = window.setTimeout(() => {
      setChatMessages((prev) => [...prev, { sender: "bot", text: reply }]);
    }, 1000);
  };

  const handleGenerateLink = async () => {
    const name = linkName.trim() || "New Field Staff";
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, role: "Crew" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not generate link");

      const token = data.employee?.unique_link_token as string | undefined;
      const origin = window.location.origin;
      const portalLink = token
        ? `${origin}/e/${token}`
        : `${origin}/portal?token=${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

      try {
        await navigator.clipboard?.writeText(portalLink);
      } catch {
        // Still show the URL if clipboard is blocked.
      }

      setGeneratedLink(portalLink);
      setLinkName("");
      setPortalEmployees((prev) =>
        [...prev, data.employee].sort((a, b) => a.name.localeCompare(b.name)),
      );
      showNotice(
        `Unique employee restricted portal link generated and copied:\n${portalLink}`,
      );
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Could not generate link");
    }
  };

  const copyExistingLink = async (token: string) => {
    const url = `${window.location.origin}/e/${token}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Show the copied state even if the clipboard API is unavailable.
    }
    setCopiedToken(token);
    setGeneratedLink(url);
    showNotice(`Unique employee restricted portal link copied:\n${url}`);
    window.setTimeout(() => setCopiedToken(null), 1600);
  };

  const goHome = () => setActiveView("home");

  if (isLivePortal && !employee) {
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
        {lockRole ? (
          <div className="user-badge">EMPLOYEE PORTAL</div>
        ) : (
          <div className="role-toggle-container" role="group" aria-label="Role">
            <button
              type="button"
              className={`toggle-btn ${role === "employee" ? "active" : ""}`}
              onClick={() => switchRole("employee")}
            >
              EMPLOYEE
            </button>
            <button
              type="button"
              className={`toggle-btn ${role === "boss" ? "active" : ""}`}
              onClick={() => switchRole("boss")}
            >
              BOSS
            </button>
          </div>
        )}
      </header>

      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}

      {activeView === "home" && (
        <div className="tile-grid-container">
          <div className="greeting-banner">
            <h2>
              {role === "boss"
                ? "BOSS COMMAND CENTER"
                : `STILL AT IT, ${firstNameUpper(profile.name)}.`}
            </h2>
            <p>
              {role === "boss"
                ? "Manage crew links, dispatches, and projects"
                : "Select a tile below to manage your shift"}
            </p>
          </div>

          <div className="tiles-grid">
            <Tile
              accent={isOnClock ? "green" : "orange"}
              glowing={isOnClock}
              icon="⏰"
              title={busy ? "UPDATING…" : isOnClock ? "CLOCK OUT" : "CLOCK IN"}
              subtitle={
                isOnClock ? "Status: Active on clock" : "Status: Off the clock"
              }
              onClick={() => void toggleClock()}
              disabled={busy}
            />
            <Tile
              accent="blue"
              icon="📍"
              title="TODAY'S JOB"
              subtitle={
                currentJob
                  ? `${currentJob.title || currentJob.customer_name || "Assigned job"} — ${isLivePortal ? formatClockTime(currentJob.created_at) : "08:30 AM"}`
                  : "No job assigned yet"
              }
              onClick={() => setActiveView("todays-job")}
            />
            <Tile
              accent="yellow"
              icon="📅"
              title="SCHEDULE & HOURS"
              subtitle="View shifts and time logs"
              onClick={() => setActiveView("schedule")}
            />
            <Tile
              accent="purple"
              icon="💬"
              title="CREW COMMS"
              subtitle="In-app paging & active members"
              onClick={() => setActiveView("crew")}
            />
            <Tile
              accent="slate"
              icon="🤖"
              title="AI ASSISTANT"
              subtitle="Communicate with the job bot"
              onClick={() => setActiveView("bot-chat")}
            />
            <Tile
              accent="neutral"
              icon="👤"
              title="PROFILE"
              subtitle="View restricted credentials"
              onClick={() => setActiveView("profile")}
            />
            {role === "boss" && !lockRole && (
              <Tile
                accent="boss"
                icon="🔗"
                title="EMPLOYEE LINKS"
                subtitle="Generate restricted portal URLs"
                onClick={() => {
                  setActiveView("boss-links");
                  void loadPortalEmployees();
                }}
              />
            )}
          </div>
          {error && <p className="portal-error">{error}</p>}
        </div>
      )}

      {activeView === "todays-job" && (
        <div className="detail-view page-outline-blue">
          <button className="back-btn" type="button" onClick={goHome}>
            ← Back to Dashboard
          </button>
          <h2>Today&apos;s Job: {currentJob?.title || "Unassigned"}</h2>
          {currentJob ? (
            <>
              <p>
                <strong>Customer:</strong> {currentJob.customer_name || "Customer"}
                {currentJob.customer_phone ? ` (${currentJob.customer_phone})` : ""}
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
                  href={mapsUrl(currentJob.address)}
                  target="_blank"
                  rel="noreferrer"
                  className="nav-link-btn"
                >
                  Get Directions &amp; Street View
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
            </>
          ) : (
            <p>No job packet is queued for this shift yet.</p>
          )}
        </div>
      )}

      {activeView === "schedule" && (
        <div className="detail-view page-outline-yellow">
          <button className="back-btn" type="button" onClick={goHome}>
            ← Back to Dashboard
          </button>
          <h2>Schedule &amp; Hours</h2>
          <p>
            <strong>Today&apos;s Shift:</strong> {shiftLabel}
          </p>
          <p>
            <strong>Hours today:</strong> {formatDuration(liveTodaySeconds)}
            {isOnClock && hours.clockedInAt
              ? ` · live since ${formatClockTime(hours.clockedInAt)}`
              : ""}
          </p>
          <p>
            <strong>Total Tracked Hours:</strong> {formatWeekHours(liveWeekSeconds)}
          </p>
        </div>
      )}

      {activeView === "crew" && (
        <div className="detail-view page-outline-purple">
          <button className="back-btn" type="button" onClick={goHome}>
            ← Back to Dashboard
          </button>
          <h2>Crew Communication &amp; Paging</h2>
          <p>Connect securely with crew members currently on the clock:</p>
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
                  {member.role ? ` · ${member.role}` : ""} —{" "}
                  {member.onClock ? "On Clock" : "Off Clock"}
                </span>
                {member.onClock && (
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
      )}

      {activeView === "bot-chat" && (
        <div className="detail-view page-outline-slate chat-view">
          <button className="back-btn" type="button" onClick={goHome}>
            ← Back to Dashboard
          </button>
          <h2>Job Bot Assistant</h2>
          <div className="chat-window">
            {chatMessages.map((msg, idx) => (
              <div key={`${msg.sender}-${idx}`} className={`chat-message ${msg.sender}`}>
                <p>{msg.text}</p>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={handleSendMessage} className="chat-form">
            <input
              type="text"
              value={inputMessage}
              onChange={(event) => setInputMessage(event.target.value)}
              placeholder="Ask the bot anything about the job..."
              aria-label="Message the job bot"
            />
            <button type="submit">Send</button>
          </form>
        </div>
      )}

      {activeView === "profile" && (
        <div className="detail-view page-outline-neutral">
          <button className="back-btn" type="button" onClick={goHome}>
            ← Back to Dashboard
          </button>
          <h2>Employee Profile</h2>
          <p>
            <strong>Name:</strong> {profile.name}
          </p>
          <p>
            <strong>Role:</strong> {profile.role || "Field Worker / Contractor"}
          </p>
          {profile.phone && (
            <p>
              <strong>Phone:</strong> {profile.phone}
            </p>
          )}
          <p>
            <strong>Portal Status:</strong> Restricted Employee Access Active
          </p>
          <p>
            <strong>Clock:</strong> {isOnClock ? "On the clock" : "Off the clock"}
          </p>
          {isLivePortal && (
            <p className="gps-line">
              {employee?.current_lat != null && employee?.current_lng != null
                ? `LIVE GPS ${employee.current_lat.toFixed(5)}, ${employee.current_lng.toFixed(5)}`
                : gpsHint}
            </p>
          )}
        </div>
      )}

      {activeView === "boss-links" && role === "boss" && !lockRole && (
        <div className="detail-view page-outline-boss">
          <button className="back-btn" type="button" onClick={goHome}>
            ← Back to Dashboard
          </button>
          <h2>Employee Link Generator</h2>
          <p>Generate a secure, unique onboarding URL for new field staff:</p>
          <label className="link-name-label" htmlFor="new-staff-name">
            Crew name
          </label>
          <input
            id="new-staff-name"
            className="link-name-input"
            value={linkName}
            onChange={(event) => setLinkName(event.target.value)}
            placeholder="New Field Staff"
          />
          <button className="action-btn" type="button" onClick={() => void handleGenerateLink()}>
            Generate New Restricted Portal Link
          </button>
          {generatedLink && (
            <p className="generated-link">
              <strong>Copied link:</strong> {generatedLink}
            </p>
          )}
          {portalEmployees.length > 0 && (
            <ul className="team-list link-list">
              {portalEmployees.map((person) => (
                <li key={person.id} className={person.is_on_clock ? "online" : "offline"}>
                  <span>
                    {person.name} — {person.is_on_clock ? "On Clock" : "Off Clock"}
                  </span>
                  {person.unique_link_token && (
                    <button
                      className="call-btn copy-link-btn"
                      type="button"
                      onClick={() => void copyExistingLink(person.unique_link_token!)}
                    >
                      {copiedToken === person.unique_link_token ? "Copied" : "Copy Link"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {activeCall && (
        <div className="call-overlay" role="dialog" aria-modal="true">
          <div className="call-card">
            <p className="kicker">In-app page</p>
            <h3>Paging {activeCall.name}</h3>
            <p>
              Connecting a secure in-app data call. Both of you are on the
              clock, so crew paging stays restricted to live shift members.
            </p>
            <button
              className="action-btn"
              type="button"
              onClick={() => setActiveCall(null)}
            >
              End Page
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
