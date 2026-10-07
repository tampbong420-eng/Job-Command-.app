import assert from "node:assert/strict";
import test from "node:test";
import {
  appointmentMoment,
  hourRingKey,
  shouldRingForHour,
  soonestAppointment,
  upcomingAppointments,
  type AppointmentHit,
} from "./appointment-notice";
import type { EmployeeDTO, JobDTO } from "./types";

const now = appointmentMoment("2026-09-29", "06:00")!;

test("an appointment an hour out is the one that rings", () => {
  const hit = {
    key: "a",
    jobId: "j",
    client: "Northline",
    date: "2026-09-29",
    start: "07:00",
    end: "08:00",
    at: appointmentMoment("2026-09-29", "07:00")!,
  } satisfies AppointmentHit;
  assert.equal(shouldRingForHour(hit, now), true);
  assert.equal(hourRingKey(hit), "2026-09-29|07:00");
  assert.equal(shouldRingForHour(hit, appointmentMoment("2026-09-29", "05:00")!), false);
  assert.equal(shouldRingForHour(hit, appointmentMoment("2026-09-29", "07:10")!), false);
});

test("the homepage notice keeps the soonest visit, not every booked day", () => {
  const jobs = [{ id: "j1", client: "Northline" }, { id: "j2", client: "Harbor" }] as JobDTO[];
  const employees = [
    {
      id: "e",
      timeEntries: [
        { jobId: "j1", date: "2026-09-28", scheduledStart: "07:00", scheduledEnd: "15:00", scheduledHours: 8 },
        { jobId: "j1", date: "2026-09-29", scheduledStart: "07:00", scheduledEnd: "15:00", scheduledHours: 8 },
        { jobId: "j2", date: "2026-09-29", scheduledStart: "07:00", scheduledEnd: "15:00", scheduledHours: 8 },
        { jobId: "j1", date: "2026-09-30", scheduledStart: "07:00", scheduledEnd: "15:00", scheduledHours: 8 },
      ],
    },
  ] as EmployeeDTO[];
  const hits = upcomingAppointments(jobs, employees, now);
  const next = soonestAppointment(hits, now);
  assert.equal(next?.date, "2026-09-29");
  assert.equal(next?.start, "07:00");
  assert.equal(shouldRingForHour(next, now), true);
});
