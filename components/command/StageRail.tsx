"use client";

import { useEffect, type CSSProperties } from "react";
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

/** "#rrggbb" + alpha -> "rgba(r, g, b, a)" */
function hexA(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Archive's fill (#27272a) is near-invisible as a glow on dark skins,
 * so its neon uses slate instead. Every other stage uses its own fill.
 */
/** Neon-bright versions of stage fills for the glow effect (Eric 2026-10-08: dark fills looked muddy) */
const NEON_FILL: Record<number, string> = {
  1: "#ff4444", // New Lead - bright red (was #dc2626 dark)
  2: "#ff8833", // Estimate - bright orange
  3: "#ffdd33", // Schedule - bright yellow
  4: "#44ff88", // Active - bright green
  5: "#22dd55", // Invoice - bright (was #166534 dark)
  6: "#a1a1aa", // Archive - slate (was #27272a invisible)
};

function neonFor(stepId: number, fill: string): string {
  return NEON_FILL[stepId] || fill;
}

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
    <div>
      {/* Neon pulse keyframes only (no classes) — the selected bar's halo reads --neon inline. */}
      <style>{`@keyframes stageNeonPulse{0%,100%{box-shadow:0 0 8px 2px var(--neon),0 0 22px 8px var(--neon);}50%{box-shadow:0 0 12px 4px var(--neon),0 0 40px 16px var(--neon);}}`}</style>
      {onGuide ? (
        <svg aria-hidden style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}>
          <defs>
            <clipPath id="guide-arrow-down" clipPathUnits="objectBoundingBox">
              <path d="M0.34,0.93 C0.34,0.98 0.66,0.98 0.66,0.93 C0.8,0.89 0.94,0.855 0.98,0.832 C0.94,0.802 0.82,0.81 0.74,0.81 L0.74,0.1 C0.74,0.028 0.64,0.008 0.5,0.008 C0.36,0.008 0.26,0.028 0.26,0.1 L0.26,0.81 C0.18,0.81 0.06,0.802 0.02,0.832 C0.06,0.855 0.2,0.89 0.34,0.93 Z" />
            </clipPath>
          </defs>
        </svg>
      ) : null}
      <div style={{ display: "grid", gap: 6, touchAction: "pan-y" }}>
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
          const neon = neonFor(step.id, step.fill);

          // Left dot: completed stages lit solid in the stage color with a glow;
          // partially-done stages half-lit; everything else dim.
          const dotBackground = done ? neon : tone === "partial" ? hexA(neon, 0.6) : "#6b7280";
          const dotShadow = done
            ? `0 0 6px ${neon}, 0 0 14px ${neon}`
            : tone === "partial"
              ? `0 0 6px ${hexA(neon, 0.7)}`
              : "none";

          const barStyle: CSSProperties = {
            width: "100%",
            minHeight: 48,
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "12px 18px",
            textAlign: "left",
            fontWeight: 700,
            position: "relative",
            overflow: "hidden",
            cursor: open ? "pointer" : "not-allowed",
            touchAction: "manipulation",
            opacity: open ? 1 : 0.55,
            border: selected
              ? `2px solid ${neon}`
              : done
                ? `1px solid ${hexA(neon, 0.55)}`
                : "1px solid var(--wb-edge, #333333)",
            background: selected
              ? hexA(neon, 0.16)
              : done
                ? hexA(neon, 0.22)
                : "var(--wb-fill, #ffffff)",
            color: "var(--wb-ink, #f5f5f5)",
            ...(selected
              ? ({ animation: "stageNeonPulse 1.8s ease-in-out infinite", "--neon": neon } as CSSProperties)
              : null),
          };

          const rightStyle: CSSProperties = {
            opacity: 1,
            textAlign: "right",
            flex: "0 0 auto",
            position: "relative",
            zIndex: 1,
            fontSize: 15,
            fontWeight: 800,
            color: "#ffffff",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            display: "flex",
            alignItems: "center",
            gap: 6,
          };

          return (
            <div
              key={step.id}
              style={
                showArrow
                  ? { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 46px", columnGap: 8, alignItems: "stretch" }
                  : undefined
              }
            >
              <button
                type="button"
                style={barStyle}
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
                {selected ? (
                  <>
                    {/* Oil-in-water blobs that ride the phone's tilt (see useTiltLiquid). */}
                    <span
                      aria-hidden
                      style={{
                        position: "absolute",
                        width: 130,
                        height: 130,
                        left: -35,
                        top: -45,
                        borderRadius: "50%",
                        background: hexA(neon, 0.35),
                        filter: "blur(24px)",
                        transform: "translate(var(--tilt-x, 0px), var(--tilt-y, 0px))",
                        pointerEvents: "none",
                      }}
                    />
                    <span
                      aria-hidden
                      style={{
                        position: "absolute",
                        width: 100,
                        height: 100,
                        right: -25,
                        bottom: -40,
                        borderRadius: "50%",
                        background: hexA(neon, 0.3),
                        filter: "blur(20px)",
                        transform: "translate(calc(var(--tilt-x, 0px) * -1), calc(var(--tilt-y, 0px) * -1))",
                        pointerEvents: "none",
                      }}
                    />
                  </>
                ) : null}
                {/* Left status dot — lit solid in the stage color once the stage is done. */}
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: 12,
                    top: "50%",
                    width: 8,
                    height: 8,
                    marginTop: -4,
                    borderRadius: "50%",
                    background: dotBackground,
                    boxShadow: dotShadow,
                    zIndex: 2,
                  }}
                />
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    gap: 8,
                    minWidth: 0,
                    flex: 1,
                    textAlign: "left",
                    position: "relative",
                    zIndex: 1,
                  }}
                >
                  {done ? (
                    <span
                      aria-hidden
                      style={{ color: neon, fontSize: 16, fontWeight: 800, lineHeight: 1, textShadow: `0 0 8px ${neon}` }}
                    >
                      ✓
                    </span>
                  ) : null}
                  <b
                    style={{
                      fontSize: 15,
                      fontWeight: 800,
                      lineHeight: 1.25,
                      color: "#ffffff",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      textShadow: selected ? `0 0 12px ${hexA(neon, 0.8)}` : "none",
                    }}
                  >
                    {step.left}
                  </b>
                </span>
                {step.right ? (
                  <span
                    data-pay-word={step.id === 5 && open && !done ? facts.pay?.state || "none" : undefined}
                    style={rightStyle}
                  >
                    {!open ? <Lock size={14} aria-hidden="true" /> : null}
                    {done ? "Done" : open ? right : "Locked"}
                  </span>
                ) : open ? null : (
                  <span style={rightStyle}>
                    <Lock size={14} aria-hidden="true" />
                    Locked
                  </span>
                )}
              </button>
              {showArrow ? (
                <button
                  type="button"
                  data-guide="1"
                  disabled={!guideReady}
                  aria-label={guideReady ? "Command" : "Command, everything is done"}
                  onClick={() => onGuide?.(job.id)}
                  style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "center",
                    width: "100%",
                    height: "100%",
                    margin: 0,
                    padding: 0,
                    appearance: "none",
                    border: 0,
                    borderRadius: 0,
                    background: guideReady
                      ? "linear-gradient(180deg, #eab308 0%, #facc15 72%, #fff4a8 100%)"
                      : "#3f3f46",
                    color: guideReady ? "#1a1408" : "#a1a1aa",
                    clipPath: "url(#guide-arrow-down)",
                    filter: guideReady
                      ? guideOn
                        ? "drop-shadow(0 0 12px rgba(250, 204, 21, 0.85))"
                        : "drop-shadow(0 0 8px rgba(250, 204, 21, 0.55))"
                      : "none",
                    cursor: guideReady ? "pointer" : "default",
                    touchAction: "manipulation",
                  }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
