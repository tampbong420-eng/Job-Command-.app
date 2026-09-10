import type { CrewMember, Job } from "./types";

export function lockJobToCrew(
  jobs: Job[],
  crew: CrewMember[],
  jobId: string,
  employeeId: string,
): { jobs: Job[]; crew: CrewMember[]; locked: boolean } {
  const job = jobs.find((row) => row.id === jobId);
  const employee = crew.find((row) => row.id === employeeId);
  if (!job || !employee || job.status === "completed") {
    return { jobs, crew, locked: false };
  }

  const nextJobs = jobs.map((row) => {
    if (row.id !== jobId) return row;
    return {
      ...row,
      worker: employee.name,
      workerId: employee.id,
      status: row.status === "lead" ? "in_progress" : row.status,
    };
  });

  const nextCrew = crew.map((row) => {
    if (row.id !== employee.id) {
      if (row.currentJobId === jobId) {
        return {
          ...row,
          currentJobId: null,
          currentJob: "Unassigned",
        };
      }
      return row;
    }
    return {
      ...row,
      currentJobId: job.id,
      currentJob: job.jobTitle,
    };
  });

  return { jobs: nextJobs, crew: nextCrew, locked: true };
}

export function activeJobs(jobs: Job[]): Job[] {
  return jobs.filter((job) => job.status !== "completed");
}

export function toggleCrewClock(
  crew: CrewMember[],
  employeeId: string,
  now = new Date().toISOString(),
): CrewMember[] {
  return crew.map((row) => {
    if (row.id !== employeeId) return row;
    if (row.status === "active") {
      return { ...row, status: "off" };
    }
    return {
      ...row,
      status: "active",
      startedAt: row.startedAt ?? now,
    };
  });
}
