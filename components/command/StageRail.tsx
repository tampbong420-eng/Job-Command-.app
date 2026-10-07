"use client";

import { useEffect } from "react";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { PIPE_STEPS, canOpenPipeStep, highlightedStageId, invoiceStageWord, lockTalk, stepTone, type PipeFacts } from "@/lib/job-pipeline";
import { stagePathFor, type JobStageKey } from "@/lib/page-theme";
import type { JobDTO } from "@/lib/types";

/**
 * Oil-in-water tilt: the liquid blobs on the active stage bar shift
 * with the phone's tilt (Eric, 2026-10-03).
 */
function useTiltLiquid() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onTilt = (e: DeviceOrientationEvent) => {
      const x = e.gamma || 0; // left-right tilt (-90 to 90)
      const y = e.beta || 0;  // front-back tilt (-180 to 180)
      // Clamp and scale to a subtle shift.
      const tx = Math.max(-20, Math.min(20, x * 0.4));
      const ty = Math.max(-20, Math.min(20, (y - 45) * 0.3));
      document.documentElement.style.setProperty("--tilt-x", `${tx}px`);
      document.documentElement.style.setProperty("--tilt-y", `${ty}px`);
    };
    window.addEventListener("deviceorientation", onTilt);
    return () => window.removeEventListener("deviceorientation", onTilt);
  }, []);
}

const ACTIVE_CLASS: Record<number, string> = {
  1: "active-lead",
  2: "active-appointment",
  3: "active-navigate",
  4: "active-onjob",
  5: "active-invoice",
  6: "active-archive",
};

export function StageRail({
  job,
  facts,
  filled,
  onOpenStage,
  guideReady = false,
  guideOn = false,
  onGuide,
}: {
  job: JobDTO;
  facts: PipeFacts;
  filled: number;
  onOpenStage: (jobId: string, key: JobStageKey) => void;
  guideReady?: boolean;
  guideOn?: boolean;
  /** Gets this rail's job id, so the arrow opens THIS job's step (never another job's). */
  onGuide?: (jobId: string) => void;
}) {
  useTiltLiquid();
  const currentId = highlightedStageId(filled);
  return (
    <div className="stage-with-guide">
      {onGuide ? (
        <svg className="guide-arrow-clip" aria-hidden>
          <defs>
            <clipPath id="guide-arrow-down" clipPathUnits="objectBoundingBox">
              <path d="M0.34,0.93 C0.34,0.98 0.66,0.98 0.66,0.93 C0.8,0.89 0.94,0.855 0.98,0.832 C0.94,0.802 0.82,0.81 0.74,0.81 L0.74,0.1 C0.74,0.028 0.64,0.008 0.5,0.008 C0.36,0.008 0.26,0.028 0.26,0.1 L0.26,0.81 C0.18,0.81 0.06,0.802 0.02,0.832 C0.06,0.855 0.2,0.89 0.34,0.93 Z" />
            </clipPath>
          </defs>
        </svg>
      ) : null}
    <div className="stage-rail">
      {PIPE_STEPS.map((step) => {
        const open = canOpenPipeStep(step.id, filled);
        const tone = open ? stepTone(step.id, facts, filled) : "empty";
        const dest = stagePathFor(step.key);
        const payTone = step.id === 5 ? (facts.paid ? "paid" : facts.invoiceSent ? "sent" : "empty") : undefined;
        const done = step.id <= filled;
        const selected = open && step.id === currentId && !done;
        const showArrow = Boolean(onGuide && selected);
        // Invoice bar: the real money state ("Owes $280", "$1,200 left"), never the bare word "Paid".
        const right = step.id === 5 && open && !done ? invoiceStageWord(facts.pay, facts.invoiceSent) : step.right;
        const label = `${step.left}${right ? ` / ${right}` : ""}`;
        const classes = [
          "stage-bar",
          "pipeline-btn",
          tone,
          selected ? `${ACTIVE_CLASS[step.id]} next-action-button btn-next-action active-workflow-card` : "btn-outline",
          done ? "stage-done" : "",
          open ? "" : "locked panel-locked",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <div key={step.id} className={`stage-row${showArrow ? " live" : ""}`}>
          <button
            type="button"
            className={classes}
            data-edge={dest}
            data-stage-dest={dest}
            data-pay-tone={payTone}
            data-stage-locked={open ? "false" : "true"}
            data-stage-done={done ? "true" : "false"}
            aria-current={selected ? "step" : undefined}
            disabled={!open}
            aria-disabled={!open}
            aria-label={done ? `${label} complete` : open ? label : `${label} locked`}
            onClick={() => {
              if (!open) {
                toast.error(lockTalk(step.id, filled));
                return;
              }
              onOpenStage(job.id, dest);
            }}
          >
            <span className="stage-bar-main">
              {done ? (
                <span className="stage-check" aria-hidden>
                  ✓
                </span>
              ) : null}
              <b>{step.left}</b>
            </span>
            {step.right ? (
              <span data-pay-word={step.id === 5 && open && !done ? facts.pay?.state || "none" : undefined}>
                {!open ? <Lock className="stage-lock" aria-hidden="true" /> : null}
                {done ? "Done" : open ? right : "Locked"}
              </span>
            ) : open ? null : (
              <span>
                <Lock className="stage-lock" aria-hidden="true" />
                Locked
              </span>
            )}
          </button>
          {showArrow ? (
            <button
              type="button"
              className={`guide-arrow${guideOn ? " on" : ""}`}
              data-guide="1"
              disabled={!guideReady}
              aria-label={guideReady ? "Command" : "Command, everything is done"}
              onClick={() => onGuide?.(job.id)}
            />
          ) : null}
          </div>
        );
      })}
    </div>
    </div>
  );
}
