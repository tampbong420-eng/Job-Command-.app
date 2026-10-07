"use client";

import type { ReactNode } from "react";
import { toast } from "sonner";
import { DeckPane } from "@/components/command/DeckPane";
import { StageTalk } from "@/components/command/StageCoach";
import { useSwipeNav } from "@/hooks/use-swipe-nav";
import { filledThrough, pipeIdForStage, stageKeyForPipeId, type PipeFacts } from "@/lib/job-pipeline";
import type { JobStageKey } from "@/lib/page-theme";
import type { JobDTO } from "@/lib/types";

export function useStageDeckSwipe({
  stage,
  filled,
  onClose,
  onAdvance,
  enabled = true,
}: {
  stage: JobStageKey;
  filled: number;
  onClose: () => void;
  onAdvance?: (key: JobStageKey) => void;
  enabled?: boolean;
}) {
  function go(dir: -1 | 1) {
    const id = pipeIdForStage(stage);
    const nextId = id + dir;
    if (nextId < 1) {
      onClose();
      return;
    }
    if (nextId > 6) return;
    // No hard lock (Eric, 2026-10-03): swipe anywhere, the Guide still suggests the next step.
    onAdvance?.(stageKeyForPipeId(nextId));
  }
  return useSwipeNav(() => go(-1), () => go(1), { enabled, threshold: 64, shell: true, axis: "y" });
}

export function StageFrame({
  job,
  stage,
  facts,
  kicker,
  who,
  actor,
  onClose,
  onAdvance,
  onHeard,
  plain = false,
  children,
}: {
  job: JobDTO;
  stage: JobStageKey;
  facts: PipeFacts;
  kicker: string;
  who: string;
  actor: string;
  onClose: () => void;
  onAdvance?: (key: JobStageKey) => void;
  onHeard?: (text: string) => void;
  /** The page draws its own header and photos (Active on job). */
  plain?: boolean;
  children: ReactNode;
}) {
  const filled = filledThrough(job.pipeline, facts);
  const swipe = useStageDeckSwipe({ stage, filled, onClose, onAdvance });
  return (
    <section className={`lead-stage pipe-stage pipe-${stage}`} data-stage={stage} data-stage-isolated={stage} {...swipe.bind}>
      <DeckPane axis="y">
        {plain ? (
          <div className="stage-body plain" data-stage-body>
            {children}
          </div>
        ) : (
          <>
        <div className="stage-ai-pin" data-stage-ai>
          <StageTalk job={job} stage={stage} facts={facts} filled={filled} actor={actor} onHeard={onHeard} />
        </div>
        <div className="stage-body" data-stage-body>
          <div className="folder-top">
            <button type="button" className="ghost-action slim" onClick={onClose}>
              Back
            </button>
            <p className="card-label">{job.code}</p>
          </div>
          <p className={`pipe-kicker ${stage}`}>{kicker}</p>
          <h1 className="lead-who client-name">{who}</h1>
          {children}
        </div>
          </>
        )}
      </DeckPane>
    </section>
  );
}
