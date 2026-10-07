"use client";

import { hoursOnDay } from "@/lib/schedule";
import type { EmployeeDTO } from "@/lib/types";

function dayRows(employee: EmployeeDTO, iso: string) {
  return employee.timeEntries.filter((item) => item.date === iso && !item.notes?.startsWith("absence:"));
}

function jobLabel(employee: EmployeeDTO, iso: string) {
  const rows = dayRows(employee, iso);
  const timed = rows.filter(
    (entry) => entry.job && entry.scheduledStart && entry.scheduledEnd && entry.scheduledStart !== entry.scheduledEnd
  );
  const picked = timed.length ? timed : rows.filter((entry) => entry.job);
  return [...new Set(picked.map((entry) => entry.job!.code))].join(" · ");
}

export function CrewHoursList({
  crew,
  date,
}: {
  crew: EmployeeDTO[];
  date: string;
  actor?: string;
  locked?: boolean;
  now?: Date;
  patches?: Record<string, number>;
}) {
  if (!crew.length) {
    return <p className="command-empty">Add crew on Company first.</p>;
  }

  return (
    <ul className="crew-hours" data-crew-hours="1">
      {crew.map((person) => {
        const hours = hoursOnDay(person.timeEntries, date);
        const jobs = jobLabel(person, date);
        return (
          <li key={person.id} data-scheduled={hours > 0 ? "1" : "0"}>
            <span className="crew-hours-hit">
              {`${person.firstName} ${person.lastName}`.trim()}
            </span>
            <span className="crew-hours-hit crew-hours-fig">
              {hours}
              <small>hr</small>
            </span>
            {jobs ? <small className="crew-hours-job">{jobs}</small> : null}
          </li>
        );
      })}
    </ul>
  );
}
