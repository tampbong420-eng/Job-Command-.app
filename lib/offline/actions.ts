import {
  clockToday,
  createCustomer,
  saveEstimate,
  saveLead,
  sendEstimate,
  updateCustomer,
  updateJob,
  upsertDayHours,
} from "@/app/actions";
import type { SendEstimateResult } from "@/lib/send-estimate";
import type { JobPhotoDTO } from "@/lib/types";
import { compressPhoto } from "@/lib/compress-photo";
import { fileDelete, fileSet, isLocalId, uid } from "@/lib/offline/idb";
import { browserOnline, isNetworkError, liveOrThrow } from "@/lib/offline/net";
import { dropPhotoUpload, enqueue } from "@/lib/offline/queue";
import { rememberLocalPhotoUrl, revokeLocalPhotoUrl, localPhotoUrl } from "@/lib/offline/cache";
import { flushQueue } from "@/lib/offline/sync";
import type {
  EstimateSavePayload,
  EstimateSendPayload,
  HoursPayload,
  JobPatchPayload,
  LeadSavePayload,
} from "@/lib/offline/types";

export type QueuedSendResult = SendEstimateResult & { queued?: boolean };

async function tryLive<T>(run: () => Promise<T>): Promise<T> {
  return liveOrThrow(run);
}

function queuedSend(estimateId: string, origin: string, channels?: Array<"email" | "sms">): QueuedSendResult {
  const routed = channels?.length ? channels : (["email", "sms"] as const);
  return {
    estimateId,
    url: `${origin.replace(/\/$/, "")}/e/pending`,
    email: routed.includes("email") ? { ok: true, mock: true } : null,
    sms: routed.includes("sms") ? { ok: true, mock: true } : null,
    queued: true,
  };
}

export async function saveEstimateOffline(input: EstimateSavePayload): Promise<string> {
  if (browserOnline()) {
    try {
      let customerId = input.customerId || input.customer?.id || null;
      if (input.customer?.id && !isLocalId(input.customer.id)) {
        if (
          input.customer.email !== undefined ||
          input.customer.phone !== undefined ||
          input.customer.address !== undefined
        ) {
          await tryLive(() =>
            updateCustomer({
              customerId: input.customer!.id!,
              email: input.customer!.email,
              phone: input.customer!.phone,
              address: input.customer!.address,
              actor: input.actor,
            })
          );
        }
        customerId = input.customer.id;
      } else if (input.customer?.name && (input.customer.email || input.customer.phone) && !customerId) {
        customerId =
          (await tryLive(() =>
            createCustomer({
              name: input.customer!.name,
              email: input.customer!.email,
              phone: input.customer!.phone,
              address: input.customer!.address,
              actor: input.actor,
            })
          )) || "";
      }
      const id = await tryLive(() =>
        saveEstimate({
          jobId: input.jobId,
          customerId,
          notes: input.notes,
          terms: input.terms,
          prompt: input.prompt,
          taxRate: input.taxRate,
          lines: input.lines,
          actor: input.actor,
        })
      );
      if (!id) throw new TypeError("Failed to fetch");
      return id;
    } catch (error) {
      if (!isNetworkError(error)) throw error;
    }
  }
  await enqueue({ type: "estimate.save", data: input });
  void flushQueue();
  return `local:est:${input.jobId}`;
}

export async function sendEstimateOffline(input: EstimateSendPayload): Promise<QueuedSendResult> {
  if (browserOnline() && !isLocalId(input.estimateId)) {
    try {
      const result = await tryLive(() => sendEstimate(input));
      if (!result) throw new TypeError("Failed to fetch");
      return result;
    } catch (error) {
      if (!isNetworkError(error)) throw error;
    }
  }
  await enqueue({ type: "estimate.send", data: input });
  void flushQueue();
  return queuedSend(input.estimateId, input.origin, input.channels);
}

export async function cacheJobPhoto(input: {
  jobId: string;
  file: File;
  caption?: string;
  actor: string;
  localPhotoId?: string;
}): Promise<JobPhotoDTO> {
  const file = await compressPhoto(input.file);
  const localPhotoId = input.localPhotoId || uid("local:photo:");
  const fileId = uid("file-");
  const caption = input.caption?.trim() || "On-site photo";
  const existing = localPhotoUrl(localPhotoId);
  const url = existing || URL.createObjectURL(file);
  if (!existing) rememberLocalPhotoUrl(localPhotoId, url);
  await fileSet(fileId, {
    blob: file,
    name: file.name || "site.jpg",
    mime: file.type || "image/jpeg",
  });
  await enqueue({
    type: "photo.upload",
    data: {
      jobId: input.jobId,
      caption,
      fileId,
      name: file.name || "site.jpg",
      mime: file.type || "image/jpeg",
      localPhotoId,
      actor: input.actor,
    },
  });
  void flushQueue();
  return {
    id: localPhotoId,
    url,
    caption,
    createdAt: new Date().toISOString(),
  };
}

export async function uploadJobPhotoOffline(input: {
  jobId: string;
  file: File;
  caption: string;
  actor?: string;
}): Promise<JobPhotoDTO> {
  return cacheJobPhoto({
    jobId: input.jobId,
    file: input.file,
    caption: input.caption,
    actor: input.actor || "Crew",
  });
}

export async function deleteJobPhotoOffline(photoId: string) {
  if (isLocalId(photoId)) {
    const item = await dropPhotoUpload(photoId);
    if (item?.type === "photo.upload") await fileDelete(item.data.fileId);
    revokeLocalPhotoUrl(photoId);
    return;
  }
  if (browserOnline()) {
    try {
      const response = await tryLive(() =>
        fetch(`/api/jobs/photos?id=${encodeURIComponent(photoId)}`, { method: "DELETE" })
      );
      if (!response.ok) throw new Error("Could not remove that photo.");
      return;
    } catch (error) {
      if (!isNetworkError(error)) throw error;
    }
  }
  await enqueue({ type: "photo.delete", data: { photoId } });
  void flushQueue();
}

export async function saveLeadOffline(input: LeadSavePayload) {
  if (browserOnline()) {
    try {
      await tryLive(() => saveLead(input));
      return;
    } catch (error) {
      if (!isNetworkError(error)) throw error;
    }
  }
  await enqueue({ type: "lead.save", data: input });
  void flushQueue();
}

export async function clockTodayOffline(input: {
  employeeId: string;
  action: "IN" | "OUT";
  actor: string;
  jobId?: string | null;
  unpaidHours?: number;
}) {
  if (browserOnline()) {
    try {
      await tryLive(() => clockToday(input));
      return;
    } catch (error) {
      if (!isNetworkError(error)) throw error;
    }
  }
  await enqueue({ type: "clock", data: input });
  void flushQueue();
}

export async function upsertHoursOffline(input: HoursPayload) {
  if (browserOnline()) {
    try {
      await tryLive(() => upsertDayHours(input));
      return;
    } catch (error) {
      if (!isNetworkError(error)) throw error;
    }
  }
  await enqueue({ type: "hours", data: input });
  void flushQueue();
}

export async function updateJobOffline(input: JobPatchPayload) {
  if (browserOnline()) {
    try {
      await tryLive(() => updateJob(input));
      return;
    } catch (error) {
      if (!isNetworkError(error)) throw error;
    }
  }
  await enqueue({ type: "job.patch", data: input });
  void flushQueue();
}

export async function saveJobNoteOffline(input: { jobId: string; notes: string; actor: string }) {
  if (browserOnline()) {
    try {
      await tryLive(() => updateJob(input));
      return;
    } catch (error) {
      if (!isNetworkError(error)) throw error;
    }
  }
  await enqueue({ type: "job.note", data: input });
  void flushQueue();
}
