"use client";

import { useEffect, useState } from "react";

type JobStatus = "idle" | "running" | "completed" | "failed";

interface Job {
  id: string;
  name: string;
  command: string;
  status: JobStatus;
  exitCode: number | null;
  lastRunAt: string | null;
  output: string | null;
  createdAt: string;
}

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadJobs() {
    const res = await fetch("/api/jobs");
    const data = await res.json();
    setJobs(data.jobs);
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch("/api/jobs");
      const data = await res.json();
      if (!active) return;
      setJobs(data.jobs);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  async function addJob(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, command }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to create job");
      }
      setName("");
      setCommand("");
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  async function runJob(id: string) {
    setBusyId(id);
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, status: "running" } : j)),
    );
    try {
      const res = await fetch(`/api/jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run" }),
      });
      const data = await res.json();
      setJobs((prev) => prev.map((j) => (j.id === id ? data.job : j)));
    } finally {
      setBusyId(null);
    }
  }

  async function deleteJob(id: string) {
    setBusyId(id);
    try {
      await fetch(`/api/jobs/${id}`, { method: "DELETE" });
      setJobs((prev) => prev.filter((j) => j.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="page">
      <div className="header">
        <div className="logo">⌘</div>
        <h1>Job Command</h1>
      </div>
      <p className="subtitle">
        Define, run, and track job commands from a single dashboard.
      </p>

      <form className="form card" onSubmit={addJob}>
        <div>
          <label htmlFor="name">Job name</label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Nightly backup"
          />
        </div>
        <div className="field-command">
          <label htmlFor="command">Command</label>
          <input
            id="command"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="e.g. ./scripts/backup.sh"
          />
        </div>
        <button
          className="btn-primary"
          type="submit"
          disabled={submitting || !name.trim() || !command.trim()}
        >
          {submitting ? "Adding…" : "Add job"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}

      <div className="section-title">
        <h2>Jobs</h2>
        <span className="count">{jobs.length} total</span>
      </div>

      {loading ? (
        <div className="empty">Loading jobs…</div>
      ) : jobs.length === 0 ? (
        <div className="empty">No jobs yet. Add your first command above.</div>
      ) : (
        <div className="jobs">
          {jobs.map((job) => (
            <div className="job" key={job.id}>
              <div className="job-top">
                <div>
                  <div className="job-name">{job.name}</div>
                  <div className="job-command">$ {job.command}</div>
                </div>
                <div className="spacer" />
                <span className={`badge badge-${job.status}`}>{job.status}</span>
                <div className="actions">
                  <button
                    className="btn-run"
                    onClick={() => runJob(job.id)}
                    disabled={busyId === job.id}
                  >
                    {busyId === job.id && job.status === "running"
                      ? "Running…"
                      : "Run"}
                  </button>
                  <button
                    className="btn-delete"
                    onClick={() => deleteJob(job.id)}
                    disabled={busyId === job.id}
                    aria-label={`Delete ${job.name}`}
                  >
                    Delete
                  </button>
                </div>
              </div>
              {job.output && <pre className="output">{job.output}</pre>}
              {job.lastRunAt && (
                <div className="meta">
                  Last run {new Date(job.lastRunAt).toLocaleString()} · exit code{" "}
                  {job.exitCode}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
import JobCommandApp from "@/components/JobCommandApp";

export default function Home() {
  return <JobCommandApp />;
}
