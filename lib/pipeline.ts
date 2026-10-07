import { can } from "@/lib/access";
import { mergeNotes, mergeTalkLines, parseSiteTalk } from "@/lib/site-talk";
import { estimateFromSitePhotos } from "@/lib/photo-estimate";
import { shouldAutoFillEstimate } from "@/lib/photo-cache";
import { attachJobCosts, costForJob } from "@/lib/job-cost-core";
import { applyQueueOverlay } from "@/lib/offline/cache";
import { foldQueue } from "@/lib/offline/queue";
import { hashPin, normalizePin, pinFromPhone, verifyPin } from "@/lib/pin";
import { encodeSession, decodeSession } from "@/lib/session";
import type { QueueItem, QueuePayload } from "@/lib/offline/types";
import type {
  EmployeeDTO,
  EstimateDTO,
  InvoiceDTO,
  JobDTO,
  JobPhotoDTO,
  SessionDTO,
} from "@/lib/types";

export function unlockWithPin(input: { pin: string; phone?: string | null; fallback?: string }) {
  const expected = pinFromPhone(input.phone, input.fallback || "1001");
  const pin = normalizePin(input.pin);
  const stored = hashPin(expected);
  return pin === expected && verifyPin(pin, stored);
}

export async function sessionAfterPin(input: {
  pin: string;
  storedHash: string;
  account: SessionDTO;
  now?: number;
}) {
  if (!verifyPin(normalizePin(input.pin), input.storedHash)) return null;
  const token = await encodeSession(input.account, input.now || Date.now());
  return decodeSession(token, (input.now || Date.now()) + 1);
}

export function voiceOntoJob(input: {
  session: SessionDTO;
  job: JobDTO;
  estimate: EstimateDTO | null;
  transcript: string;
  actor: string;
}) {
  if (!can(input.session, "estimate")) return { ok: false as const, reason: "denied" as const };
  const draft = parseSiteTalk(input.transcript);
  const notes = mergeNotes(input.job.notes || input.estimate?.notes || "", draft.notes);
  const lines = mergeTalkLines(input.estimate?.lines || [], draft.lines);
  const queue: QueuePayload[] = [
    {
      type: "voice.ingest",
      data: {
        jobId: input.job.id,
        fileId: "file-voice",
        name: "driveway.webm",
        mime: "audio/webm",
        transcript: input.transcript,
        actor: input.actor,
      },
    },
    { type: "job.note", data: { jobId: input.job.id, notes, actor: input.actor } },
  ];
  if (lines.length) {
    queue.push({
      type: "estimate.save",
      data: {
        jobId: input.job.id,
        customerId: input.estimate?.customerId || null,
        notes,
        lines,
        actor: input.actor,
      },
    });
  }
  return { ok: true as const, draft, notes, lines, queue };
}

export function photosOntoJob(input: {
  session: SessionDTO;
  job: JobDTO;
  estimate: EstimateDTO | null;
  photos: JobPhotoDTO[];
  actor: string;
}) {
  if (!can(input.session, "photos")) return { ok: false as const, reason: "denied" as const };
  const queue: QueuePayload[] = input.photos.map((photo, index) => ({
    type: "photo.upload" as const,
    data: {
      jobId: input.job.id,
      caption: photo.caption || "On-site photo",
      fileId: `file-photo-${index}`,
      name: "site.jpg",
      mime: "image/jpeg",
      localPhotoId: photo.id,
      actor: input.actor,
    },
  }));
  queue.push({ type: "photo.analyze", data: { jobId: input.job.id, actor: input.actor } });
  if (!shouldAutoFillEstimate(input.estimate?.status)) {
    return { ok: true as const, filled: false, notes: input.job.notes, lines: input.estimate?.lines || [], queue };
  }
  const draft = estimateFromSitePhotos({
    jobName: input.job.name,
    client: input.job.client,
    address: input.job.address,
    notes: input.estimate?.notes || input.job.notes,
    photoCount: input.photos.length,
  });
  const notes = mergeNotes(input.job.notes, draft.notes);
  const lines = mergeTalkLines(input.estimate?.lines || [], draft.lines);
  queue.push({
    type: "estimate.save",
    data: {
      jobId: input.job.id,
      customerId: input.estimate?.customerId || null,
      notes,
      lines,
      actor: input.actor,
    },
  });
  return { ok: true as const, filled: true, notes, lines, queue };
}

export function drainPipeline(payloads: QueuePayload[], now = Date.now()) {
  let items: QueueItem[] = [];
  for (const payload of payloads) {
    items = foldQueue(items, payload, now).items;
  }
  return items;
}

export function fieldStateAfterQueue(input: {
  job: JobDTO;
  estimate: EstimateDTO | null;
  employees: EmployeeDTO[];
  invoices?: InvoiceDTO[];
  queue: QueueItem[];
  photos?: Record<string, JobPhotoDTO[]>;
  now?: Date;
}) {
  const overlay = applyQueueOverlay(
    {
      jobs: [input.job],
      customers: [],
      estimates: input.estimate ? [input.estimate] : [],
      employees: input.employees,
    },
    input.queue,
    input.photos || {}
  );
  const jobs = attachJobCosts({
    jobs: overlay.jobs,
    employees: overlay.employees || input.employees,
    estimates: overlay.estimates,
    invoices: input.invoices || [],
    now: input.now,
  });
  return {
    job: jobs[0],
    estimate: overlay.estimates.find((item) => item.jobId === input.job.id) || null,
    employees: overlay.employees || input.employees,
    cost: jobs[0]?.cost || costForJob({
      job: input.job,
      employees: input.employees,
      estimate: input.estimate,
      invoices: input.invoices || [],
      now: input.now,
    }),
  };
}
