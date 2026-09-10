"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Employee, Job } from "@/lib/types";

export default function EmployeeLinkPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [gpsHint, setGpsHint] = useState("GPS stays off until you clock in.");

  const load = useCallback(async () => {
    const res = await fetch(`/api/crew/${token}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? "Link is invalid");
    }
    setEmployee(data.employee);
    setJobs(data.jobs ?? []);
  }, [token]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await load();
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Could not open link");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [load]);

  async function sendAction(
    action: "clock_in" | "clock_out" | "location",
    coords?: GeolocationPosition,
  ) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/crew/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          lat: coords?.coords.latitude,
          lng: coords?.coords.longitude,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      setEmployee(data.employee);
      setJobs(data.jobs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  function readGps(): Promise<GeolocationPosition | undefined> {
    if (!navigator.geolocation) {
      setGpsHint("This device cannot share GPS.");
      return Promise.resolve(undefined);
    }
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGpsHint("Location sharing starts while you are on the clock.");
          resolve(position);
        },
        () => {
          setGpsHint("Location permission was denied. You can still clock in.");
          resolve(undefined);
        },
        { enableHighAccuracy: true, timeout: 8000 },
      );
    });
  }

  async function toggleClock() {
    if (!employee) return;
    if (employee.is_on_clock) {
      await sendAction("clock_out");
      return;
    }
    const position = await readGps();
    await sendAction("clock_in", position);
  }

  useEffect(() => {
    if (!employee?.is_on_clock) return;
    if (!navigator.geolocation) return;
    const watch = navigator.geolocation.watchPosition(
      (position) => {
        void sendAction("location", position);
      },
      () => {
        setGpsHint("Live GPS paused — location permission is off.");
      },
      { enableHighAccuracy: true, maximumAge: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
    // employee.id + on-clock is enough; sendAction is stable enough for this page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee?.id, employee?.is_on_clock, token]);

  if (loading) {
    return (
      <main className="page theme-employee">
        <div className="empty">Opening your job link…</div>
      </main>
    );
  }

  if (!employee) {
    return (
      <main className="page theme-employee">
        <h1>JOB COMMAND</h1>
        <p className="error">
          {error ?? "Ask the boss to send the employee login link again."}
        </p>
      </main>
    );
  }

  return (
    <main className="page theme-employee">
      <div className="header">
        <div className="brand">
          <div className="logo">JC</div>
          <div>
            <p className="kicker">Employee login</p>
            <h1>{employee.name.toUpperCase()}</h1>
          </div>
        </div>
      </div>
      <p className="subtitle">
        {employee.role || "Crew"}
        {employee.phone ? ` · ${employee.phone}` : ""}
      </p>

      <section className="card accent">
        <div className="section-head">
          <h2>Clock</h2>
          <span
            className={employee.is_on_clock ? "badge badge-on" : "badge badge-off"}
          >
            {employee.is_on_clock ? "On the clock" : "Off the clock"}
          </span>
        </div>
        <button
          className="btn-clock"
          type="button"
          onClick={toggleClock}
          disabled={busy}
        >
          {employee.is_on_clock ? "Clock out" : "Get on the clock"}
        </button>
        <p className="gps">
          {employee.current_lat != null && employee.current_lng != null
            ? `LIVE GPS ${employee.current_lat.toFixed(5)}, ${employee.current_lng.toFixed(5)}`
            : gpsHint}
        </p>
        {error && <p className="error">{error}</p>}
      </section>

      <section className="card" style={{ marginTop: 20 }}>
        <div className="section-head">
          <h2>Your jobs</h2>
          <span className="count">{jobs.length} assigned</span>
        </div>
        {jobs.length === 0 ? (
          <div className="empty">No jobs queued for you yet.</div>
        ) : (
          <div className="list">
            {jobs.map((job) => (
              <article className="item" key={job.id}>
                <div className="item-top">
                  <div>
                    <div className="item-name">
                      {job.customer_name || "Customer"}
                    </div>
                    <div className="item-meta">
                      {job.title || "Job"}
                      {job.customer_phone ? ` · ${job.customer_phone}` : ""}
                    </div>
                  </div>
                  <span className="badge badge-job">{job.status}</span>
                </div>
                {job.address && <p className="item-meta">{job.address}</p>}
                {job.customer_phone && (
                  <a className="street-link" href={`tel:${job.customer_phone}`}>
                    Call customer
                  </a>
                )}
                {job.boss_notes && (
                  <div className="notes">
                    <div className="notes-label">Boss notes</div>
                    {job.boss_notes}
                  </div>
                )}
                {job.required_supplies && (
                  <div className="notes">
                    <div className="notes-label">Required supplies</div>
                    {job.required_supplies}
                  </div>
                )}
                {job.street_view_url && (
                  <div>
                    <a
                      className="street-link"
                      href={job.street_view_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Street view
                    </a>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
