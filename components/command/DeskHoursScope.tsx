"use client";

/**
 * Desk-wide fallback for the one mic (office only): on any screen without its own helper,
 * “Change Jordan’s hours to 6” still works — same as the old Schedule mic did.
 */

import { useVoiceScope } from "@/components/command/OneMic";
import { parseHoursTalk } from "@/lib/hours-talk";
import { upsertHoursOffline } from "@/lib/offline/actions";

export type DeskPerson = {
  id: string;
  firstName: string;
  lastName: string;
  today: {
    id: string;
    scheduledHours: number;
    jobId: string | null;
    serviceCodeId: string | null;
    scheduledStart: string | null;
    scheduledEnd: string | null;
    notes: string | null;
  } | null;
};

export function DeskHoursScope({ people, actor, date }: { people: DeskPerson[]; actor: string; date: string }) {
  useVoiceScope({
    id: "desk-hours",
    label: "Today’s hours",
    priority: 0,
    examples: ["Change Jordan’s hours to 6", "Casey worked 8 hours"],
    propose: (text) =>
      // Only a spoken hours change ("Jordan's hours to 6", "Casey worked 8 hours", "set Avery off").
      // "Riley left at 3" is a clock time, not 3 hours — the job page's helper handles that.
      (/\b(?:hours?|hrs?|off)\b/i.test(text) ? parseHoursTalk(text, people) : []).map((hit, index) => {
        const person = people.find((row) => row.id === hit.employeeId);
        const entry = person?.today || null;
        return {
          id: `desk-hours-${hit.employeeId}-${index}`,
          label: `${person ? `${person.firstName} ${person.lastName}` : hit.name}: ${hit.hours} hr today`,
          dest: "Hours",
          run: () =>
            upsertHoursOffline({
              employeeId: hit.employeeId,
              date,
              scheduledHours: entry?.scheduledHours || hit.hours,
              actualHours: hit.hours,
              jobId: entry?.jobId || null,
              serviceCodeId: entry?.serviceCodeId || null,
              scheduledStart: entry?.scheduledStart || null,
              scheduledEnd: entry?.scheduledEnd || null,
              notes: entry?.notes || null,
              actor,
              entryId: entry?.id,
            }),
        };
      }),
  });
  return null;
}
