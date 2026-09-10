"use client";

import { activeJobs } from "@/lib/assign";
import { wrapIndex } from "@/lib/format";
import type { CrewMember, Job } from "@/lib/types";
import { useSwipe } from "@/lib/use-swipe";
import { useMemo } from "react";

export default function JobTumbler({
  jobs,
  jobIndex,
  member,
  ticking,
  onIndexChange,
  onLock,
}: {
  jobs: Job[];
  jobIndex: number;
  member: CrewMember;
  ticking: boolean;
  onIndexChange: (index: number) => void;
  onLock: () => void;
}) {
  const stack = useMemo(() => activeJobs(jobs), [jobs]);
  const current = stack[jobIndex] ?? null;
  const swipe = useSwipe((delta) => {
    onIndexChange(wrapIndex(jobIndex, delta, stack.length));
  }, "y", 52);

  if (!current) {
    return (
      <section className="plate tumbler-shell">
        <p className="card-label">Job assignment</p>
        <p>No active jobs to lock.</p>
      </section>
    );
  }

  const lockedToThis = current.workerId === member.id;

  return (
    <section className="plate tumbler-shell">
      <div className="tumbler-head">
        <div>
          <p className="card-label">Job tumbler</p>
          <p className="swipe-hint">Flick to cycle · lock to this crew</p>
        </div>
        <span className="shift-tag shock">
          {jobIndex + 1} / {stack.length}
        </span>
      </div>
      <div
        className="tumbler-body"
        aria-label="Active jobs tumbler"
        onPointerDown={swipe.onPointerDown}
        onPointerMove={swipe.onPointerMove}
        onPointerUp={swipe.onPointerUp}
        onPointerCancel={swipe.onPointerUp}
      >
        <span className="tumbler-knurl left" aria-hidden="true" />
        <span className="tumbler-knurl right" aria-hidden="true" />
        <span className="tumbler-notch" aria-hidden="true" />
        <span className="tumbler-window" aria-hidden="true" />
        <div className="tumbler-track">
          {[-2, -1, 0, 1, 2].map((offset) => {
            const slotIndex = wrapIndex(jobIndex, offset, stack.length);
            const job = stack[slotIndex];
            if (!job) return null;
            const y = offset * 56 + swipe.drag * 0.42;
            const abs = Math.abs(offset);
            return (
              <article
                key={`${job.id}-${offset}`}
                className={`tumbler-slot${offset === 0 ? " is-center" : ""}${
                  offset === 0 && ticking ? " is-ticking" : ""
                }`}
                style={{
                  transform: `translateY(${y}px)`,
                  opacity: abs === 0 ? 1 : abs === 1 ? 0.5 : 0.18,
                  filter: abs === 0 ? "none" : "blur(0.35px)",
                }}
              >
                <div className="slot-copy">
                  <small>
                    {job.scheduledTime} · {job.status.replace("_", " ")}
                  </small>
                  <b>{job.jobTitle}</b>
                  <span>
                    {job.customerName} · {job.worker}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      </div>
      <button
        type="button"
        className={`lock-button${lockedToThis ? " locked" : ""}`}
        onClick={onLock}
      >
        <span className="button-icon" aria-hidden="true">
          {lockedToThis ? "●" : "◎"}
        </span>
        <span>
          <small>
            {lockedToThis
              ? "Locked to this crew"
              : `Assign to ${member.name.split(" ")[0]}`}
          </small>
          <b>{lockedToThis ? "LOCKED" : "LOCK JOB"}</b>
        </span>
      </button>
    </section>
  );
}
