import type { EmployeeDTO, JobDTO } from "@/lib/types";

export type AppointmentHit = {
  key: string;
  jobId: string;
  client: string;
  date: string;
  start: string;
  end: string | null;
  at: number;
};

export function appointmentMoment(date: string, time: string) {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  if (!y || !m || !d || Number.isNaN(hh)) return null;
  return new Date(y, m - 1, d, hh, mm || 0, 0, 0).getTime();
}

export function upcomingAppointments(jobs: JobDTO[], employees: EmployeeDTO[], nowMs: number) {
  const clients = new Map(jobs.map((job) => [job.id, job.client]));
  const seen = new Map<string, AppointmentHit>();
  for (const employee of employees) {
    for (const entry of employee.timeEntries) {
      if (!entry.jobId || !entry.scheduledStart || entry.scheduledHours <= 0) continue;
      const client = clients.get(entry.jobId);
      if (!client) continue;
      const at = appointmentMoment(entry.date, entry.scheduledStart);
      if (at == null) continue;
      const endAt = entry.scheduledEnd ? appointmentMoment(entry.date, entry.scheduledEnd) : null;
      const doneAt = endAt != null && endAt > at ? endAt : at + Math.max(entry.scheduledHours, 1) * 60 * 60 * 1000;
      if (doneAt <= nowMs) continue;
      const key = `${entry.jobId}|${entry.date}|${entry.scheduledStart}`;
      if (!seen.has(key)) {
        seen.set(key, {
          key,
          jobId: entry.jobId,
          client,
          date: entry.date.slice(0, 10),
          start: entry.scheduledStart,
          end: entry.scheduledEnd,
          at,
        });
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.at - b.at || a.client.localeCompare(b.client));
}

export function soonestAppointment(hits: AppointmentHit[], nowMs: number) {
  const coming = hits.filter((hit) => hit.at > nowMs);
  const withinHour = coming.find((hit) => hit.at - nowMs <= 60 * 60 * 1000);
  if (withinHour) return withinHour;
  const live = hits.find((hit) => hit.at <= nowMs);
  return live || coming[0] || null;
}

export function hourRingKey(hit: AppointmentHit) {
  return `${hit.date}|${hit.start}`;
}

export function shouldRingForHour(hit: AppointmentHit | null, nowMs: number) {
  if (!hit) return false;
  const wait = hit.at - nowMs;
  return wait > 0 && wait <= 60 * 60 * 1000;
}
