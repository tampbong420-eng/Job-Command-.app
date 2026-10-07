"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { savePayrollSetup } from "@/app/actions";
import {
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
  formatDay,
  formatRange,
  mostRecentWeekday,
  periodFromClock,
  snapToWeekday,
  todayString,
} from "@/lib/dates";
import { parsePayrollTalk } from "@/lib/setup-parse";
import type { PayrollSettingsDTO } from "@/lib/types";

const ACTOR = "Office";

export function PayrollSetup({
  settings,
  onDone,
}: {
  settings: PayrollSettingsDTO;
  onDone?: () => void;
}) {
  const today = todayString();
  const seededWeekday = new Date(`${settings.periodAnchor}T00:00:00Z`).getUTCDay();
  const [frequency, setFrequency] = useState<"WEEKLY" | "BIWEEKLY">(
    settings.payFrequency
  );
  const [weekday, setWeekday] = useState(seededWeekday);
  const [periodStart, setPeriodStart] = useState(() =>
    snapToWeekday(mostRecentWeekday(seededWeekday, today), seededWeekday)
  );
  const [talk, setTalk] = useState("");
  const [heard, setHeard] = useState<string | null>(
    settings.setupComplete ? null : "How often do you pay the crew, and what day does a pay period start?"
  );
  const [pending, startTransition] = useTransition();

  const preview = useMemo(
    () => periodFromClock(frequency, periodStart, today, 0),
    [frequency, periodStart, today]
  );
  const next = useMemo(
    () => periodFromClock(frequency, periodStart, today, 1),
    [frequency, periodStart, today]
  );

  function applyDraft(draft: {
    frequency?: "WEEKLY" | "BIWEEKLY";
    startWeekday?: number;
    periodStart?: string;
  }) {
    const nextWeekday = draft.startWeekday ?? weekday;
    const nextFreq = draft.frequency ?? frequency;
    setFrequency(nextFreq);
    setWeekday(nextWeekday);
    setPeriodStart(
      snapToWeekday(draft.periodStart ?? mostRecentWeekday(nextWeekday, today), nextWeekday)
    );
  }

  function hear(text: string) {
    const local = parsePayrollTalk(text, today);
    applyDraft(local);
    startTransition(async () => {
      try {
        const response = await fetch("/api/setup/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (response.ok) {
          const draft = (await response.json()) as typeof local;
          applyDraft({ ...local, ...draft });
        }
      } catch {
        /* local parse already applied */
      }
    });
    const bits = [
      local.frequency === "BIWEEKLY"
        ? "every two weeks"
        : local.frequency === "WEEKLY"
          ? "every week"
          : null,
      local.startWeekday != null ? `starting ${WEEKDAY_LONG[local.startWeekday]}` : null,
    ].filter(Boolean);
    setHeard(
      bits.length
        ? `Got it — ${bits.join(", ")}. Check the days below, then lock it in.`
        : "Tap weekly or every two weeks, then the day a period starts."
    );
  }

  return (
    <section className="setup-desk">
      <p className="card-label">Payroll calendar</p>
      <h1>Set the pay period</h1>
      <p className="setup-voice">{heard}</p>

      <form
        className="talk-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!talk.trim()) return;
          hear(talk.trim());
          setTalk("");
        }}
      >
        <input
          value={talk}
          onChange={(event) => setTalk(event.target.value)}
          aria-label="Tell jobcommand.app how you pay"
        />
        <button type="submit" disabled={pending || !talk.trim()}>
          Got it
        </button>
      </form>

      <p className="card-label">How often</p>
      <div className="choice-row">
        <button
          type="button"
          className={frequency === "WEEKLY" ? "on" : ""}
          onClick={() => setFrequency("WEEKLY")}
        >
          Every week
        </button>
        <button
          type="button"
          className={frequency === "BIWEEKLY" ? "on" : ""}
          onClick={() => setFrequency("BIWEEKLY")}
        >
          Every 2 weeks
        </button>
      </div>

      <p className="card-label">Period starts</p>
      <div className="weekday-row">
        {WEEKDAY_SHORT.map((label, index) => (
          <button
            key={label}
            type="button"
            className={weekday === index ? "on" : ""}
            onClick={() => {
              setWeekday(index);
              setPeriodStart(snapToWeekday(periodStart, index));
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <label className="start-date">
        This period started
        <input
          type="date"
          value={periodStart}
          onChange={(event) => {
            const value = event.target.value;
            if (!value) return;
            setPeriodStart(snapToWeekday(value, weekday));
          }}
        />
      </label>

      <div className="setup-preview">
        <b>
          {frequency === "WEEKLY" ? "This week" : "This period"}
        </b>
        <span>{formatRange(preview.start, preview.end)}</span>
        <small>
          Next {frequency === "WEEKLY" ? "week" : "period"} starts{" "}
          {formatDay(next.start, "EEE MMM d")}
        </small>
      </div>

      <button
        type="button"
        className="lock-button lime btn-next-action"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              await savePayrollSetup({
                frequency,
                periodStart,
                actor: ACTOR,
              });
              toast.success("Pay period set.");
              onDone?.();
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Could not save.");
            }
          })
        }
      >
        <span>
          <small>
            {WEEKDAY_LONG[weekday]} · {frequency === "WEEKLY" ? "weekly" : "every 2 weeks"}
          </small>
          <b>USE THIS PERIOD</b>
        </span>
      </button>
    </section>
  );
}
