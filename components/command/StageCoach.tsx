"use client";

import { useRef } from "react";
import { toast } from "sonner";
import { useTalkScope } from "@/components/command/OneMic";
import { PhotoBar } from "@/components/command/TalkStrip";
import { useJobPhotos } from "@/hooks/use-job-photos";
import { pipeIdForStage, stageCoachTalk, type PipeFacts } from "@/lib/job-pipeline";
import type { JobStageKey } from "@/lib/page-theme";
import type { JobDTO } from "@/lib/types";

/** Where the helper says a stage’s spoken line lands. */
const TALK_DEST: Record<JobStageKey, string> = {
  lead: "Lead card",
  estimate: "The bid",
  schedule: "Crew & start day",
  active: "Job board",
  field: "The bid",
  invoice: "Invoice lines",
  archive: "Job file",
};

const TALK_EXAMPLES: Record<JobStageKey, string[]> = {
  lead: ["Maya Lopez, 501 555 0100, repaint the porch"],
  estimate: ["Scrape and prime the fascia, two coats Duration"],
  schedule: ["Start Monday, Casey and Jordan, three days"],
  active: ["Tell the crew lunch at noon"],
  field: ["Scrape and prime the fascia, two coats Duration"],
  invoice: ["Add 4 hours labor and 2 gallons primer"],
  archive: ["Note: client paid by check"],
};

export function CoachCue({ copy }: { copy: string }) {
  if (!copy.trim()) return null;
  return (
    <div className="copilot-plate stage-coach" data-stage-coach>
      <p className="card-label">What to do</p>
      <p>{copy}</p>
    </div>
  );
}

/**
 * Read-aloud of the coach line is OFF (Eric, 2026-10-02: no robot voice). The written "What to do" stays on screen.
 * Kept as a no-op so the stage pages don't change.
 */
export function useCoachSpeak(_jobId: string, _stage: string, _copy: string) {
  void _jobId;
  void _stage;
  void _copy;
}

/** Coach line + photo bar on every stage. Talking goes through the one floating mic. */
export function StageTalk({
  job,
  stage,
  facts,
  filled,
  actor,
  onHeard,
}: {
  job: JobDTO;
  stage: JobStageKey;
  facts: PipeFacts;
  filled: number;
  actor: string;
  onHeard?: (text: string) => void;
}) {
  const copy = stageCoachTalk(pipeIdForStage(stage), job.client || "this client", facts, filled);
  const onHeardRef = useRef(onHeard);
  onHeardRef.current = onHeard;
  const photos = useJobPhotos(job, actor);
  useCoachSpeak(job.id, stage, copy);
  useTalkScope({
    id: `stage-${stage}-${job.id}`,
    label: job.client || job.name || "This job",
    dest: TALK_DEST[stage],
    examples: TALK_EXAMPLES[stage],
    parse: onHeard ? (text) => onHeardRef.current?.(text) : undefined,
    snap: photos.snap,
    roll: photos.roll,
  });

  return (
    <>
      <CoachCue copy={copy} />
      <PhotoBar
        photos={photos.photos}
        busy={photos.busy}
        onSnap={photos.snap}
        onRoll={photos.roll}
        onRemove={(id) => void photos.remove(id).catch(() => toast.error("Couldn’t pull that photo."))}
        camRef={photos.camRef}
        rollRef={photos.rollRef}
        onFiles={(list) =>
          void photos.ingest(list).catch((error) => toast.error(error instanceof Error ? error.message : "Couldn’t save that photo."))
        }
      />
    </>
  );
}
