"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { clearCrewAlarm, crewAlarmName, playCrewAlarm, saveCrewAlarm } from "@/lib/crew-alarm";
import {
  BREAK_MS,
  LUNCH_MS,
  activePause,
  endPause,
  readStoredPauses,
  startPause,
  type ShiftPause,
  writeStoredPauses,
} from "@/lib/shift-pause";

type TimerKind = "break" | "lunch";

const TIMERS: Record<TimerKind, { label: string; ms: number; done: string }> = {
  break: { label: "10-min break", ms: BREAK_MS, done: "Break’s over. Time to get back on it." },
  lunch: { label: "30-min lunch", ms: LUNCH_MS, done: "Lunch is up. Clock’s running." },
};

function clock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

async function phoneAlert(title: string, body: string) {
  toast.success(body);
  try {
    navigator.vibrate?.([240, 80, 240, 80, 480]);
  } catch {
    /* vibration is best-effort */
  }
  try {
    await playCrewAlarm();
  } catch {
    /* custom file is optional */
  }
  if (typeof Notification === "undefined") return;
  try {
    if (Notification.permission === "default") await Notification.requestPermission();
    if (Notification.permission !== "granted") return;
    const ready = "serviceWorker" in navigator ? await navigator.serviceWorker.ready.catch(() => null) : null;
    if (ready?.showNotification) {
      await ready.showNotification(title, { body, tag: "job-command-shift-timer" });
      return;
    }
    new Notification(title, { body });
  } catch {
    /* toast already fired */
  }
}

export function ShiftTimers({
  employeeId,
  date,
  live = false,
  onPauses,
}: {
  employeeId: string;
  date: string;
  live?: boolean;
  onPauses?: (pauses: ShiftPause[]) => void;
}) {
  const [kind, setKind] = useState<TimerKind | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [left, setLeft] = useState(0);
  const [tone, setTone] = useState("");
  const fired = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTone(crewAlarmName());
  }, []);

  useEffect(() => {
    if (!live || kind !== "lunch") return;
    const current = readStoredPauses(employeeId, date);
    if (activePause(current, "lunch")) return;
    const next = startPause(current, "lunch");
    writeStoredPauses(employeeId, date, next);
    onPauses?.(next);
  }, [live, kind, employeeId, date, onPauses]);

  useEffect(() => {
    if (!endsAt) return;
    function tick() {
      const remain = Math.max(0, (endsAt || 0) - Date.now());
      setLeft(remain);
      if (remain <= 0 && !fired.current && kind) {
        fired.current = true;
        const spec = TIMERS[kind];
        finishPause(kind);
        void phoneAlert(spec.label, spec.done);
        setKind(null);
        setEndsAt(null);
      }
    }
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [endsAt, kind]);

  function emit(next: ShiftPause[]) {
    writeStoredPauses(employeeId, date, next);
    onPauses?.(next);
  }

  function finishPause(next: TimerKind) {
    if (next !== "lunch") return;
    emit(endPause(readStoredPauses(employeeId, date), "lunch"));
  }

  function start(next: TimerKind) {
    fired.current = false;
    if (kind && kind !== next) finishPause(kind);
    setKind(next);
    setEndsAt(Date.now() + TIMERS[next].ms);
    setLeft(TIMERS[next].ms);
    if (next === "lunch" && live) {
      emit(startPause(readStoredPauses(employeeId, date), "lunch"));
    }
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }

  function stop() {
    if (kind) finishPause(kind);
    fired.current = true;
    setKind(null);
    setEndsAt(null);
    setLeft(0);
  }

  return (
    <section className="shift-timers" data-shift-timers="1">
      <p className="card-label">Break / lunch</p>
      <div className="shift-timer-row">
        <button
          type="button"
          className={`ghost-action hours${kind === "break" ? " on" : ""}`}
          onClick={() => (kind === "break" ? stop() : start("break"))}
        >
          {kind === "break" ? `Break ${clock(left)}` : "10-min break"}
        </button>
        <button
          type="button"
          className={`ghost-action hours${kind === "lunch" ? " on" : ""}`}
          onClick={() => (kind === "lunch" ? stop() : start("lunch"))}
        >
          {kind === "lunch" ? `Lunch ${clock(left)}` : "30-min lunch"}
        </button>
      </div>
      <p className="command-empty">
        {kind === "lunch"
          ? live
            ? "Lunch is unpaid. Hours are paused until this timer ends."
            : "Lunch timer running. Clock in first if you need hours paused."
          : kind === "break"
            ? "Break is paid. Hours keep running."
            : "10-min break stays paid. 30-min lunch pauses the clock."}
      </p>
      <div className="crew-alarm" data-crew-alarm="1">
        <p className="card-label">Alarm tone</p>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            void saveCrewAlarm(file)
              .then(() => {
                setTone(file.name);
                toast.success("That tone will play when lunch or break ends.");
              })
              .catch(() => toast.error("Could not save that audio file."));
          }}
        />
        <div className="shift-timer-row">
          <button type="button" className="ghost-action slim" onClick={() => fileRef.current?.click()}>
            {tone ? "Change alarm" : "Pick alarm"}
          </button>
          {tone ? (
            <button
              type="button"
              className="ghost-action slim"
              onClick={() => {
                void clearCrewAlarm().then(() => {
                  setTone("");
                  toast.success("Phone alert only.");
                });
              }}
            >
              Clear
            </button>
          ) : null}
        </div>
        <p className="command-empty">{tone ? tone : "Use a ringtone or any audio file from this phone."}</p>
      </div>
    </section>
  );
}
