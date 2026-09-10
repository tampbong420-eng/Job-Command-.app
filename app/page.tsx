"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Employee, Job } from "@/lib/types";

export default function BossDesk() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [crewName, setCrewName] = useState("");
  const [crewRole, setCrewRole] = useState("Crew");
  const [crewPhone, setCrewPhone] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [address, setAddress] = useState("");
  const [streetViewUrl, setStreetViewUrl] = useState("");
  const [bossNotes, setBossNotes] = useState("");
  const [supplies, setSupplies] = useState("");
  const [assignedId, setAssignedId] = useState("");
  const [jobTitle, setJobTitle] = useState("");

  const load = useCallback(async () => {
    const [crewRes, jobRes] = await Promise.all([
      fetch("/api/employees"),
      fetch("/api/jobs"),
    ]);
    const crewData = await crewRes.json();
    const jobData = await jobRes.json();
    setEmployees(crewData.employees ?? []);
    setJobs(jobData.jobs ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await load();
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load");
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [load]);

  const origin = useMemo(
    () => (typeof window === "undefined" ? "" : window.location.origin),
    [],
  );

  async function addEmployee(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const res = await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: crewName,
        role: crewRole,
        phone: crewPhone,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not add employee");
      return;
    }
    setCrewName("");
    setCrewPhone("");
    setEmployees((prev) =>
      [...prev, data.employee].sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  async function addJob(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: jobTitle,
        customer_name: customerName,
        customer_phone: customerPhone,
        address,
        street_view_url: streetViewUrl || null,
        boss_notes: bossNotes,
        required_supplies: supplies,
        assigned_employee_id: assignedId || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not create job");
      return;
    }
    setCustomerName("");
    setCustomerPhone("");
    setAddress("");
    setStreetViewUrl("");
    setBossNotes("");
    setSupplies("");
    setAssignedId("");
    setJobTitle("");
    setJobs((prev) => [data.job, ...prev]);
  }

  async function copyLink(token: string) {
    const url = `${origin}/e/${token}`;
    await navigator.clipboard.writeText(url);
    setCopied(token);
    setTimeout(() => setCopied(null), 1600);
  }

  async function removeEmployee(id: string) {
    await fetch(`/api/employees/${id}`, { method: "DELETE" });
    setEmployees((prev) => prev.filter((row) => row.id !== id));
  }

  async function removeJob(id: string) {
    await fetch(`/api/jobs/${id}`, { method: "DELETE" });
    setJobs((prev) => prev.filter((row) => row.id !== id));
  }

  return (
    <main className="page">
      <div className="header">
        <div className="brand">
          <div className="logo">JC</div>
          <div>
            <p className="kicker">Boss command</p>
            <h1>JOB COMMAND</h1>
          </div>
        </div>
      </div>
      <p className="subtitle">
        Dispatch customer jobs, keep GPS on the crew who are on the clock, and
        send each tech a unique login link.
      </p>
      {error && <p className="error">{error}</p>}

      <div className="grid">
        <section className="card accent">
          <div className="section-head">
            <h2>Crew</h2>
            <span className="count">{employees.length} on file</span>
          </div>
          <form className="form" onSubmit={addEmployee}>
            <div>
              <label htmlFor="crew-name">Employee name</label>
              <input
                id="crew-name"
                value={crewName}
                onChange={(e) => setCrewName(e.target.value)}
                placeholder="e.g. Alex Rivera"
                required
              />
            </div>
            <div className="form-row">
              <div>
                <label htmlFor="crew-role">Role</label>
                <input
                  id="crew-role"
                  value={crewRole}
                  onChange={(e) => setCrewRole(e.target.value)}
                  placeholder="Crew"
                />
              </div>
              <div>
                <label htmlFor="crew-phone">Phone</label>
                <input
                  id="crew-phone"
                  value={crewPhone}
                  onChange={(e) => setCrewPhone(e.target.value)}
                  placeholder="813-555-0100"
                />
              </div>
            </div>
            <button className="btn-primary" type="submit" disabled={!crewName.trim()}>
              Add employee
            </button>
          </form>

          {loading ? (
            <div className="empty">Loading crew…</div>
          ) : employees.length === 0 ? (
            <div className="empty">No employees on file.</div>
          ) : (
            <div className="list">
              {employees.map((employee) => (
                <article className="item" key={employee.id}>
                  <div className="item-top">
                    <div>
                      <div className="item-name">{employee.name}</div>
                      <div className="item-meta">
                        {employee.role || "Crew"}
                        {employee.phone ? ` · ${employee.phone}` : ""}
                      </div>
                    </div>
                    <span
                      className={
                        employee.is_on_clock ? "badge badge-on" : "badge badge-off"
                      }
                    >
                      {employee.is_on_clock ? "On the clock" : "Off the clock"}
                    </span>
                  </div>
                  {employee.current_lat != null && employee.current_lng != null ? (
                    <div className="gps">
                      LIVE GPS {employee.current_lat.toFixed(5)},{" "}
                      {employee.current_lng.toFixed(5)}
                    </div>
                  ) : (
                    <div className="gps">GPS waiting for clock-in</div>
                  )}
                  {employee.unique_link_token && (
                    <p className="token">
                      {origin}/e/{employee.unique_link_token}
                    </p>
                  )}
                  <div className="actions">
                    {employee.unique_link_token && (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => copyLink(employee.unique_link_token!)}
                      >
                        {copied === employee.unique_link_token
                          ? "Copied"
                          : "Copy login link"}
                      </button>
                    )}
                    <a
                      className="btn-ghost"
                      href={
                        employee.unique_link_token
                          ? `/e/${employee.unique_link_token}`
                          : "#"
                      }
                    >
                      Open
                    </a>
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() => removeEmployee(employee.id)}
                    >
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="card accent">
          <div className="section-head">
            <h2>Jobs</h2>
            <span className="count">{jobs.length} total</span>
          </div>
          <form className="form" onSubmit={addJob}>
            <div className="form-row">
              <div>
                <label htmlFor="customer-name">Customer name</label>
                <input
                  id="customer-name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label htmlFor="customer-phone">Customer phone</label>
                <input
                  id="customer-phone"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label htmlFor="address">Address</label>
              <input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="123 Oak St, Tampa, FL"
              />
            </div>
            <div className="form-row">
              <div>
                <label htmlFor="job-title">Job title</label>
                <input
                  id="job-title"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="AC no-cool"
                />
              </div>
              <div>
                <label htmlFor="assigned">Send to</label>
                <select
                  id="assigned"
                  value={assignedId}
                  onChange={(e) => setAssignedId(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="street-view">Street view URL</label>
              <input
                id="street-view"
                value={streetViewUrl}
                onChange={(e) => setStreetViewUrl(e.target.value)}
                placeholder="Leave blank to generate from the address"
              />
            </div>
            <div>
              <label htmlFor="boss-notes">Boss notes</label>
              <textarea
                id="boss-notes"
                value={bossNotes}
                onChange={(e) => setBossNotes(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="supplies">Required supplies</label>
              <textarea
                id="supplies"
                value={supplies}
                onChange={(e) => setSupplies(e.target.value)}
              />
            </div>
            <button
              className="btn-primary"
              type="submit"
              disabled={!customerName.trim()}
            >
              Create job
            </button>
          </form>

          {loading ? (
            <div className="empty">Loading jobs…</div>
          ) : jobs.length === 0 ? (
            <div className="empty">No customer jobs yet.</div>
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
                        {job.assigned_employee_name
                          ? ` · ${job.assigned_employee_name}`
                          : " · Unassigned"}
                      </div>
                    </div>
                    <span className="badge badge-job">{job.status}</span>
                  </div>
                  {job.address && <p className="item-meta">{job.address}</p>}
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
                    <a
                      className="street-link"
                      href={job.street_view_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Street view
                    </a>
                  )}
                  <div className="actions">
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() => removeJob(job.id)}
                    >
                      Delete job
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
