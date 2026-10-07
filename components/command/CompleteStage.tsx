"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { setJobPipeline } from "@/app/actions";
import { StageFrame } from "@/components/command/StageFrame";
import { canArchiveJob, type PipeFacts } from "@/lib/job-pipeline";
import type { JobStageKey } from "@/lib/page-theme";
import type { CustomerDTO, JobDTO } from "@/lib/types";

export function CompleteStage({
  job,
  customer,
  facts,
  actor,
  onClose,
  onAdvance,
}: {
  job: JobDTO;
  customer: CustomerDTO | null;
  facts: PipeFacts;
  actor: string;
  onClose: () => void;
  onAdvance?: (key: JobStageKey) => void;
}) {
  const [, startTransition] = useTransition();
  const who = customer?.name || job.client;
  const ready = canArchiveJob(job.pipeline, facts);

  function closeOut() {
    if (!ready) {
      toast.error("Payment has to clear on Invoice / Paid first. Swipe back to Command.");
      return;
    }
    startTransition(async () => {
      try {
        await setJobPipeline({ jobId: job.id, pipeline: 6, actor });
        toast.success("Job file closed.");
        onClose();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not archive.");
      }
    });
  }

  return (
    <StageFrame job={job} stage="archive" facts={facts} kicker="Step 6 of 6 · Done" who={who} actor={actor} onClose={onClose} onAdvance={onAdvance}>
      {ready ? (
        <>
          <p className="pipe-copy">They paid. Tap to close the job.</p>
          <button type="button" className="lead-advance archive btn-next-action" onClick={closeOut}>
            Close out job
          </button>
        </>
      ) : (
        <p className="pipe-copy">
          This page only closes the file after they pay. Swipe down to go back to pay.
        </p>
      )}
      <p className="lead-swipe-hint">This is done. Swipe down to go back to pay.</p>
    </StageFrame>
  );
}
