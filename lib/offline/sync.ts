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
import { rememberJobPhoto } from "@/lib/offline/cache";
import { fileDelete, fileGet, isLocalId } from "@/lib/offline/idb";
import { browserOnline, isNetworkError, probeOnline, setNetStatus } from "@/lib/offline/net";
import { enqueue, listQueue, markQueueError, queueCount, remapEstimateIds, removeQueueItem } from "@/lib/offline/queue";
import { shouldAutoFillEstimate } from "@/lib/photo-cache";
import type { JobPhotoDTO } from "@/lib/types";
import type { QueueItem } from "@/lib/offline/types";

let flushing = false;
let started = false;
let timer = 0;

async function flushPhotoUpload(item: Extract<QueueItem, { type: "photo.upload" }>) {
  const file = await fileGet(item.data.fileId);
  if (!file) return;
  const body = new FormData();
  body.set("jobId", item.data.jobId);
  body.set("caption", item.data.caption);
  body.set("file", new File([file.blob], item.data.name, { type: item.data.mime || file.mime || "image/jpeg" }));
  const response = await fetch("/api/jobs/photos", { method: "POST", body });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Photo upload failed.");
  }
  const photo = (await response.json()) as JobPhotoDTO;
  await fileDelete(item.data.fileId);
  rememberJobPhoto(item.data.jobId, photo, item.data.localPhotoId);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("job-command-photo-synced", {
        detail: { jobId: item.data.jobId, localPhotoId: item.data.localPhotoId, photo },
      })
    );
  }
  if (item.data.actor) {
    await enqueue({
      type: "photo.analyze",
      data: { jobId: item.data.jobId, actor: item.data.actor },
    });
  }
}

async function flushPhotoAnalyze(item: Extract<QueueItem, { type: "photo.analyze" }>) {
  const response = await fetch("/api/jobs/photos/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId: item.data.jobId }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Photo estimate failed.");
  }
  const draft = (await response.json()) as {
    skipped?: boolean;
    notes?: string;
    lines?: Array<{ kind: "LABOR" | "MATERIAL" | "OTHER"; description: string; quantity: number; unit: string; rate: number }>;
    status?: string;
  };
  if (draft.skipped || !draft.lines?.length) return;
  if (!shouldAutoFillEstimate(draft.status)) return;
  await saveEstimate({
    jobId: item.data.jobId,
    notes: draft.notes || "",
    lines: draft.lines,
    actor: item.data.actor,
  });
  if (draft.notes) {
    await updateJob({ jobId: item.data.jobId, notes: draft.notes, actor: item.data.actor });
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("job-command-photo-linked", { detail: { jobId: item.data.jobId } }));
  }
}

async function flushPhotoDelete(item: Extract<QueueItem, { type: "photo.delete" }>) {
  if (isLocalId(item.data.photoId)) return;
  const response = await fetch(`/api/jobs/photos?id=${encodeURIComponent(item.data.photoId)}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404) {
    throw new Error("Could not remove that photo.");
  }
}

async function flushVoiceIngest(item: Extract<QueueItem, { type: "voice.ingest" }>) {
  const file = await fileGet(item.data.fileId);
  const form = new FormData();
  form.set("jobId", item.data.jobId);
  if (item.data.transcript) form.set("transcript", item.data.transcript);
  if (file) {
    form.set("file", new File([file.blob], item.data.name, { type: item.data.mime || file.mime || "audio/webm" }));
  }
  const response = await fetch("/api/jobs/voice", { method: "POST", body: form });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Voice ingest failed.");
  }
  if (file) await fileDelete(item.data.fileId);
}

async function flushEstimateSave(item: Extract<QueueItem, { type: "estimate.save" }>) {
  let customerId = item.data.customerId || item.data.customer?.id || null;
  const customer = item.data.customer;
  if (customer?.id && !isLocalId(customer.id)) {
    await updateCustomer({
      customerId: customer.id,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      actor: item.data.actor,
    });
    customerId = customer.id;
  } else if (customer?.name && (customer.email || customer.phone)) {
    customerId =
      (await createCustomer({
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        actor: item.data.actor,
      })) || customerId;
  }
  const id = await saveEstimate({
    jobId: item.data.jobId,
    customerId,
    notes: item.data.notes,
    terms: item.data.terms,
    prompt: item.data.prompt,
    taxRate: item.data.taxRate,
    lines: item.data.lines,
    actor: item.data.actor,
  });
  if (!id) throw new TypeError("Failed to fetch");
  await remapEstimateIds(`local:est:${item.data.jobId}`, id);
}

async function flushOne(item: QueueItem) {
  switch (item.type) {
    case "photo.upload":
      await flushPhotoUpload(item);
      return;
    case "photo.delete":
      await flushPhotoDelete(item);
      return;
    case "photo.analyze":
      await flushPhotoAnalyze(item);
      return;
    case "estimate.save":
      await flushEstimateSave(item);
      return;
    case "estimate.send":
      if (isLocalId(item.data.estimateId)) {
        throw new Error("Estimate is still waiting to save.");
      }
      await sendEstimate({
        estimateId: item.data.estimateId,
        actor: item.data.actor,
        channels: item.data.channels,
        origin: item.data.origin,
      });
      return;
    case "job.note":
      await updateJob({ jobId: item.data.jobId, notes: item.data.notes, actor: item.data.actor });
      return;
    case "lead.save":
      await saveLead(item.data);
      return;
    case "clock":
      await clockToday(item.data);
      return;
    case "hours":
      await upsertDayHours(item.data);
      return;
    case "job.patch":
      await updateJob(item.data);
      return;
    case "voice.ingest":
      await flushVoiceIngest(item);
      return;
  }
}

export async function flushQueue() {
  if (flushing || typeof window === "undefined") return;
  if (!browserOnline()) {
    setNetStatus("offline");
    return;
  }
  const reachable = await probeOnline();
  if (!reachable) {
    setNetStatus("offline");
    return;
  }
  const items = await listQueue();
  if (!items.length) {
    setNetStatus("online");
    return;
  }
  flushing = true;
  setNetStatus("syncing");
  const skipped = new Set<string>();
  let progressed = false;
  try {
    while (true) {
      const items = (await listQueue()).filter((item) => !skipped.has(item.id));
      if (!items.length) break;
      const waitingSend = (item: QueueItem) =>
        item.type === "estimate.send" && isLocalId(item.data.estimateId);
      const waitingPhotos = (item: QueueItem) =>
        item.type === "photo.analyze" &&
        items.some((entry) => entry.type === "photo.upload" && entry.data.jobId === item.data.jobId);
      const item = items.find((entry) => !waitingSend(entry) && !waitingPhotos(entry)) || items[0];
      if (waitingSend(item) || waitingPhotos(item)) break;
      try {
        await flushOne(item);
        await removeQueueItem(item.id);
        progressed = true;
      } catch (error) {
        if (isNetworkError(error)) {
          setNetStatus("offline");
          break;
        }
        await markQueueError(item.id, error instanceof Error ? error.message : "Sync failed.");
        const latest = (await listQueue()).find((entry) => entry.id === item.id);
        if ((latest?.attempts || 0) >= 8) await removeQueueItem(item.id);
        else skipped.add(item.id);
      }
    }
    const left = await queueCount();
    if (browserOnline()) setNetStatus("online");
    if (!left && browserOnline()) {
      window.dispatchEvent(new Event("job-command-synced"));
    }
  } finally {
    flushing = false;
    await queueCount();
  }
  if (progressed && browserOnline() && (await queueCount())) {
    window.setTimeout(() => void flushQueue(), 0);
  }
}

export function startOfflineSync() {
  if (started || typeof window === "undefined") return;
  started = true;
  void queueCount().then(() => {
    if (browserOnline()) void flushQueue();
    else setNetStatus("offline");
  });
  window.addEventListener("online", () => {
    setNetStatus("syncing");
    void flushQueue();
  });
  window.addEventListener("offline", () => setNetStatus("offline"));
  window.addEventListener("pageshow", () => void flushQueue());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void flushQueue();
  });
  timer = window.setInterval(() => {
    if (browserOnline()) void flushQueue();
  }, 20000);
  void timer;
}

export function stopOfflineSync() {
  if (timer) window.clearInterval(timer);
  started = false;
}
