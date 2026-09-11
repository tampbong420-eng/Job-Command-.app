export type JobStatus = "idle" | "running" | "completed" | "failed";

export interface Job {
  id: string;
  name: string;
  command: string;
  status: JobStatus;
  exitCode: number | null;
  lastRunAt: string | null;
  output: string | null;
  createdAt: string;
}

// In-memory store. This is intentionally ephemeral: it is a demo backend that
// resets whenever the server process restarts. A real deployment would swap this
// for a database or durable queue.
const jobs = new Map<string, Job>();

function seed() {
  if (jobs.size > 0) return;
  const now = new Date().toISOString();
  const initial: Array<Pick<Job, "name" | "command">> = [
    { name: "Build project", command: "npm run build" },
    { name: "Run tests", command: "npm test" },
    { name: "Deploy preview", command: "vercel deploy" },
  ];
  for (const item of initial) {
    const id = crypto.randomUUID();
    jobs.set(id, {
      id,
      name: item.name,
      command: item.command,
      status: "idle",
      exitCode: null,
      lastRunAt: null,
      output: null,
      createdAt: now,
    });
  }
}

seed();

export function listJobs(): Job[] {
  return [...jobs.values()].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
  );
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function createJob(name: string, command: string): Job {
  const id = crypto.randomUUID();
  const job: Job = {
    id,
    name,
    command,
    status: "idle",
    exitCode: null,
    lastRunAt: null,
    output: null,
    createdAt: new Date().toISOString(),
  };
  jobs.set(id, job);
  return job;
}

export function deleteJob(id: string): boolean {
  return jobs.delete(id);
}

// Simulate running a command. We don't execute anything on the host; we just
// produce deterministic-ish output so the UI has something real to show.
export function runJob(id: string): Job | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;
  const failed = /fail|error|exit\s+1/i.test(job.command);
  const updated: Job = {
    ...job,
    status: failed ? "failed" : "completed",
    exitCode: failed ? 1 : 0,
    lastRunAt: new Date().toISOString(),
    output: failed
      ? `$ ${job.command}\nProcess exited with code 1`
      : `$ ${job.command}\nProcess completed successfully (exit 0)`,
  };
  jobs.set(id, updated);
  return updated;
}
