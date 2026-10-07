"use client";

import { useEffect, useState } from "react";
import { formatDay } from "@/lib/dates";
import {
  hourRingKey,
  shouldRingForHour,
  soonestAppointment,
  upcomingAppointments,
  type AppointmentHit,
} from "@/lib/appointment-notice";
import { formatTimeLabel } from "@/lib/schedule";
import type { EmployeeDTO, JobDTO } from "@/lib/types";

const RING_PREFIX = "jc-appt-ring:";

function playSoftRing() {
  const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  let ctx: AudioContext;
  try {
    ctx = new AudioCtx();
  } catch {
    return;
  }
  let started = false;
  const startTones = () => {
    if (started || ctx.state !== "running") return;
    started = true;
    const master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    const start = ctx.currentTime + 0.05;
    [0, 1.15, 2.3].forEach((burst) => {
      [523, 659].forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const when = start + burst;
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.exponentialRampToValueAtTime(0.08, when + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.7);
        osc.connect(gain);
        gain.connect(master);
        osc.start(when);
        osc.stop(when + 0.75);
      });
    });
    window.setTimeout(() => void ctx.close(), 4200);
  };
  const begin = () => {
    void ctx.resume().then(startTones).catch(() => undefined);
  };
  if (ctx.state === "running") startTones();
  else {
    window.addEventListener("pointerdown", begin, { once: true });
    begin();
  }
}

export type AppointmentNoticeCopy = {
  id: string;
  label: string;
  title: string;
  body: string;
  jobId: string;
};

/** Build the bell-ready copy for an appointment hit (Eric, 2026-10-03: the sentence lives in the bell now). */
export function appointmentNoticeCopy(
  hit: AppointmentHit,
  jobs: JobDTO[],
  employees: EmployeeDTO[],
  nowMs: number,
): AppointmentNoticeCopy {
  const waitMin = Math.max(1, Math.round((hit.at - nowMs) / 60000));
  const soon = hit.at > nowMs && hit.at - nowMs <= 60 * 60 * 1000;
  const when = `${formatDay(hit.date)} · ${formatTimeLabel(hit.start)}${hit.end ? `–${formatTimeLabel(hit.end)}` : ""}`;
  const same = upcomingAppointments(jobs, employees, nowMs).filter((item) => item.at === hit.at);
  const who = same.length > 1 ? `${hit.client} and ${same.length - 1} more` : hit.client;
  return {
    id: `appt-${hit.key}`,
    label: "Appointment",
    title: soon ? `In ${waitMin} min` : hit.at <= nowMs ? "On the schedule" : "Next appointment",
    body: `${when} · ${who}`,
    jobId: hit.jobId,
  };
}

export function AppointmentNotice({
  jobs,
  employees,
  bare,
}: {
  jobs: JobDTO[];
  employees: EmployeeDTO[];
  /** Silent mode: keep the reminder ring, drop the sentence (it lives in the bell now). */
  bare?: boolean;
}) {
  const [hit, setHit] = useState<AppointmentHit | null>(null);
  const [soon, setSoon] = useState(false);

  useEffect(() => {
    let ringing = false;
    const look = () => {
      const nowMs = Date.now();
      const next = soonestAppointment(upcomingAppointments(jobs, employees, nowMs), nowMs);
      setHit(next);
      const due = shouldRingForHour(next, nowMs);
      setSoon(due);
      if (!next || !due || ringing) return;
      const mark = RING_PREFIX + hourRingKey(next);
      try {
        if (window.sessionStorage.getItem(mark)) return;
        window.sessionStorage.setItem(mark, "1");
      } catch {
        /* private mode still gets one ring this visit */
      }
      ringing = true;
      playSoftRing();
    };
    look();
    const timer = window.setInterval(look, 30000);
    return () => window.clearInterval(timer);
  }, [jobs, employees]);

  if (!hit || bare) return null;
  const copy = appointmentNoticeCopy(hit, jobs, employees, Date.now());

  return (
    <p className={`appt-notice${soon ? " soon" : ""}`} role="status">
      {copy.title}
      {" · "}
      {copy.body}
    </p>
  );
}
