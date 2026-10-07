import { DEFAULT_ESTIMATE_TERMS, isPricedLine, type DocLineDraft } from "@/lib/documents";
import { estimateFromSitePhotos, type PhotoEstimateDraft, type PhotoMeasure } from "@/lib/photo-estimate";
import { shouldAutoFillEstimate } from "@/lib/photo-cache";
import { mergeNotes, mergeTalkLines } from "@/lib/site-talk";
import { saveEstimateOffline, saveJobNoteOffline } from "@/lib/offline/actions";
import { isLocalId } from "@/lib/offline/idb";
import { browserOnline } from "@/lib/offline/net";
import type { CustomerDTO, EstimateDTO, JobDTO, JobPhotoDTO } from "@/lib/types";

export type PhotoLinkDraft = {
  notes: string;
  measurements: PhotoMeasure[];
  lines: DocLineDraft[];
  source: PhotoEstimateDraft["source"];
};

export async function draftFromPhotos(input: {
  job: JobDTO;
  estimate?: EstimateDTO | null;
  notes: string;
  lines: DocLineDraft[];
  photos: JobPhotoDTO[];
  stage?: string;
  speech?: string;
}): Promise<(PhotoLinkDraft & { marketCopy?: string }) | null> {
  if (!shouldAutoFillEstimate(input.estimate?.status)) return null;
  if (!input.photos.length) return null;

  let draft: (PhotoEstimateDraft & { market?: { copy?: string } }) | null = null;
  const serverIds = input.photos.filter((photo) => !isLocalId(photo.id)).map((photo) => photo.id);
  if (browserOnline() && serverIds.length) {
    try {
      const response = await fetch("/api/jobs/photos/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: input.job.id,
          photoIds: serverIds,
          stage: input.stage,
          speech: input.speech,
        }),
      });
      if (response.ok) {
        const payload = (await response.json()) as PhotoEstimateDraft & {
          skipped?: boolean;
          market?: { copy?: string };
        };
        if (!payload.skipped) draft = payload;
      }
    } catch {
      draft = null;
    }
  }
  if (!draft) {
    draft = estimateFromSitePhotos({
      jobName: input.job.name,
      client: input.job.client,
      address: input.job.address,
      notes: [input.notes || input.job.notes, input.speech].filter(Boolean).join(" "),
      photoCount: input.photos.length,
    });
  }

  const notes = mergeNotes(input.notes || input.job.notes, draft.notes);
  const lines = mergeTalkLines(input.lines.filter(isPricedLine), draft.lines.filter(isPricedLine));
  if (!lines.length) return null;
  return {
    notes,
    measurements: draft.measurements || [],
    lines,
    source: draft.source,
    marketCopy: draft.market?.copy,
  };
}

export async function persistPhotoDraft(input: {
  job: JobDTO;
  customer?: CustomerDTO | null;
  estimate?: EstimateDTO | null;
  actor: string;
  draft: PhotoLinkDraft;
}) {
  await saveJobNoteOffline({ jobId: input.job.id, notes: input.draft.notes, actor: input.actor });
  return saveEstimateOffline({
    jobId: input.job.id,
    customerId: input.customer?.id || input.estimate?.customerId || null,
    customer: input.customer
      ? {
          id: input.customer.id,
          name: input.customer.name,
          email: input.customer.email,
          phone: input.customer.phone,
          address: input.customer.address || input.job.address,
        }
      : null,
    notes: input.draft.notes,
    terms: input.estimate?.terms || DEFAULT_ESTIMATE_TERMS,
    taxRate: input.estimate?.taxRate || 0,
    lines: input.draft.lines,
    actor: input.actor,
  });
}
