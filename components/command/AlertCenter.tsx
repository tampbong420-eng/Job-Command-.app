"use client";

import { Bell } from "lucide-react";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useAlerts } from "@/hooks/use-alerts";
import { alertKindLabel } from "@/lib/alert-core";
import { estimateStatusLabel } from "@/lib/estimate-status";
import type { EmployeeDTO, EstimateDTO, JobDTO } from "@/lib/types";
import { soonestAppointment, upcomingAppointments, type AppointmentHit } from "@/lib/appointment-notice";
import { appointmentNoticeCopy } from "@/components/command/AppointmentNotice";
import { isNativeApp } from "@/lib/native-app";
import { enableNativePush, onNativePushTap } from "@/lib/native-push";

const ESTIMATE_SEEN_KEY = "jc-job-estimate-seen";

function readSeen() {
  if (typeof window === "undefined") return [] as string[];
  try {
    const raw = window.localStorage.getItem(ESTIMATE_SEEN_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function estimateNoticeId(jobId: string, estimate: EstimateDTO) {
  return `${jobId}:${estimate.number}:${estimate.status}:${estimate.followUpCount || 0}`;
}

function estimateNoticeCopy(estimate: EstimateDTO) {
  const status = estimate.status;
  let body = estimateStatusLabel(status);
  if (status === "SENT") body = "Sent. Nudge goes out if they don’t open it in 24 hours.";
  else if (status === "VIEWED") body = "Opened. Waiting on a signature.";
  else if (status === "ACCEPTED" && estimate.signedName) body = `Signed by ${estimate.signedName}.`;
  else if (status === "CHANGES" && estimate.clientNote) body = estimate.clientNote;
  const extra = estimate.followUpCount
    ? `${estimate.followUpCount} auto follow-up${estimate.followUpCount === 1 ? "" : "s"} sent.`
    : "";
  return {
    title: estimate.number ? `Client estimate ${estimate.number}` : "Client estimate",
    label: estimateStatusLabel(status),
    body,
    extra,
  };
}

function timeLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", { hour: "numeric", minute: "2-digit" });
}

function vapidBytes(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(base64.replace(/-/g, "+").replace(/_/g, "/") + padding);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function AlertCenter({
  role = "office",
  jobId,
  estimate = null,
  jobs = null,
  employees = null,
}: {
  role?: "office" | "crew";
  /** Omit to keep the shop-wide feed. Pass null or an id to lock this circle to one job. */
  jobId?: string | null;
  estimate?: EstimateDTO | null;
  jobs?: JobDTO[] | null;
  employees?: EmployeeDTO[] | null;
}) {
  const router = useRouter();
  const { alerts, held, quietStart, quietEnd, vapidPublic, open, setOpen, refresh } = useAlerts();
  const [start, setStart] = useState(quietStart);
  const [end, setEnd] = useState(quietEnd);
  const [pushing, setPushing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [seen, setSeen] = useState<string[]>([]);
  const scoped = jobId !== undefined;
  const mine = scoped ? (jobId ? alerts.filter((alert) => alert.jobId === jobId) : []) : alerts;
  const notice =
    scoped && jobId && estimate && estimate.jobId === jobId && estimate.status !== "DRAFT"
      ? { id: estimateNoticeId(jobId, estimate), ...estimateNoticeCopy(estimate) }
      : null;
  const noticeFresh = Boolean(notice && !seen.includes(notice.id));
  // Next appointment lives in the bell now (Eric, 2026-10-03) — not above the house.
  const [apptHit, setApptHit] = useState<AppointmentHit | null>(null);
  useEffect(() => {
    if (!jobs || !employees) return;
    const look = () => {
      const nowMs = Date.now();
      setApptHit(soonestAppointment(upcomingAppointments(jobs, employees, nowMs), nowMs));
    };
    look();
    const timer = window.setInterval(look, 30000);
    return () => window.clearInterval(timer);
  }, [jobs, employees]);
  const apptCopy =
    apptHit && jobs && employees ? appointmentNoticeCopy(apptHit, jobs, employees, Date.now()) : null;
  const apptNotice =
    apptCopy && (!scoped || !jobId || apptCopy.jobId === jobId) ? apptCopy : null;
  const apptFresh = Boolean(apptNotice && !seen.includes(apptNotice.id));
  const unread = mine.filter((alert) => !alert.readAt).length + (noticeFresh ? 1 : 0) + (apptFresh ? 1 : 0);

  useEffect(() => {
    setMounted(true);
    setSeen(readSeen());
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [jobId, setOpen]);

  useEffect(() => {
    setStart(quietStart);
    setEnd(quietEnd);
  }, [quietStart, quietEnd]);

  function rememberNotice(id: string) {
    setSeen((current) => {
      if (current.includes(id)) return current;
      const next = [...current, id].slice(-80);
      try {
        window.localStorage.setItem(ESTIMATE_SEEN_KEY, JSON.stringify(next));
      } catch {
        /* the circle still stops for this visit */
      }
      return next;
    });
  }

  function checkNotice() {
    if (!notice) return;
    rememberNotice(notice.id);
    setOpen(false);
  }

  function checkApptNotice() {
    if (!apptNotice) return;
    rememberNotice(apptNotice.id);
    setOpen(false);
  }

  async function mark(ids: string[], href?: string) {
    const payload = !scoped && !ids.length ? { all: true } : { ids };
    if (scoped && !ids.length) return;
    await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await refresh();
    if (href) {
      setOpen(false);
      router.push(href);
      router.refresh();
    }
  }

  function markAll() {
    if (notice) rememberNotice(notice.id);
    if (apptNotice) rememberNotice(apptNotice.id);
    if (!scoped) {
      void mark([]);
      return;
    }
    const ids = mine.filter((alert) => !alert.readAt).map((alert) => alert.id);
    if (!ids.length) return;
    void mark(ids);
  }

  async function saveQuiet() {
    await fetch("/api/alerts/quiet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start, end }),
    });
    toast.success("Quiet hours saved.");
    await refresh();
  }

  // iPhone app: a tapped notification opens its page.
  useEffect(() => {
    if (!isNativeApp()) return;
    return onNativePushTap((path) => router.push(path));
  }, [router]);

  async function enablePush() {
    // Web push doesn't exist inside the iPhone app (WKWebView); use APNs there.
    if (isNativeApp()) {
      setPushing(true);
      try {
        const result = await enableNativePush();
        if (result.ok) toast.success(result.message);
        else toast.error(result.message);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not turn on push.");
      } finally {
        setPushing(false);
      }
      return;
    }
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      toast.error("This phone browser won’t take push. Alerts still land in the drawer.");
      return;
    }
    setPushing(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Push is off. The badge still catches approvals.");
        return;
      }
      const ready = await navigator.serviceWorker.ready;
      const key = vapidPublic || (await fetch("/api/push/vapid").then((r) => r.json())).publicKey;
      if (!key) throw new Error("No push key.");
      const sub = await ready.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidBytes(key),
      });
      const json = sub.toJSON();
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, role }),
      });
      toast.success("This phone will get dispatch and signed bids.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not turn on push.");
    } finally {
      setPushing(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`alert-hit${unread ? " on" : ""}`}
        aria-label={unread ? `${unread} alerts` : "Alerts"}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {/* Bell + count badge (Eric, 2026-10-02: alerts bell top-left). */}
        <Bell className="alert-bell" aria-hidden="true" />
        {unread ? <span className="alert-count">{unread > 9 ? "9+" : unread}</span> : null}
      </button>
      {open && mounted
        ? createPortal(
            <div className="alert-drawer" role="dialog" aria-label="Alerts">
          <button type="button" className="alert-scrim" aria-label="Close alerts" onClick={() => setOpen(false)} />
          <aside className="alert-panel">
            <header className="alert-head">
              <p className="card-label">Alerts</p>
              <button type="button" className="ghost-action slim" onClick={() => setOpen(false)}>
                Close
              </button>
            </header>
            {!scoped && held ? (
              <p className="alert-held">
                {held} {held === 1 ? "note" : "notes"} waiting — not urgent.
              </p>
            ) : null}
            {mine.length || notice || apptNotice ? (
              <ul className="alert-list">
                {apptNotice ? (
                  <li>
                    <button
                      type="button"
                      className={`alert-item${apptFresh ? " unread" : ""}`}
                      onClick={checkApptNotice}
                    >
                      <span className="alert-kind">{apptNotice.label}</span>
                      <b>{apptNotice.title}</b>
                      <span>{apptNotice.body}</span>
                    </button>
                  </li>
                ) : null}
                {notice ? (
                  <li>
                    <button
                      type="button"
                      className={`alert-item${noticeFresh ? " unread" : ""}`}
                      onClick={checkNotice}
                    >
                      <span className="alert-kind">{notice.label}</span>
                      <b>{notice.title}</b>
                      <span>{notice.body}</span>
                      {notice.extra ? <small>{notice.extra}</small> : null}
                    </button>
                  </li>
                ) : null}
                {mine.map((alert) => (
                  <li key={alert.id}>
                    <button
                      type="button"
                      className={`alert-item${alert.readAt ? "" : " unread"}`}
                      onClick={() => void mark([alert.id], alert.href)}
                    >
                      <span className="alert-kind">{alertKindLabel(alert.kind)}</span>
                      <b>{alert.title}</b>
                      <span>{alert.body}</span>
                      <small>{timeLabel(alert.createdAt)}</small>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="command-empty">Quiet. Signed bids and dispatch land here.</p>
            )}
            {unread ? (
              <button type="button" className="ghost-action slim" onClick={markAll}>
                Mark all read
              </button>
            ) : null}
            <section className="alert-quiet">
              <p className="card-label">Quiet hours</p>
              <p>Urgent dispatch and signed estimates still come through. Evening notes wait.</p>
              <div className="choice-row">
                <label className="settings-field">
                  From
                  <input type="time" value={start} onChange={(event) => setStart(event.target.value)} />
                </label>
                <label className="settings-field">
                  Until
                  <input type="time" value={end} onChange={(event) => setEnd(event.target.value)} />
                </label>
              </div>
              <button type="button" className="ghost-action hours" onClick={() => void saveQuiet()}>
                Save hours
              </button>
              <button type="button" className="ghost-action hours" disabled={pushing} onClick={() => void enablePush()}>
                {pushing ? "Connecting…" : "Alerts on this phone"}
              </button>
            </section>
          </aside>
        </div>,
            document.body
          )
        : null}
    </>
  );
}
