import { STORE_QUEUE, uid, withStore } from "@/lib/offline/idb";
import { setPendingCount } from "@/lib/offline/net";
import type { QueueItem, QueuePayload } from "@/lib/offline/types";

async function readAll(): Promise<QueueItem[]> {
  const items = await withStore<QueueItem[]>(STORE_QUEUE, "readonly", (store) => store.getAll());
  return (items || []).sort((a, b) => a.createdAt - b.createdAt);
}

async function write(item: QueueItem) {
  await withStore(STORE_QUEUE, "readwrite", (store) => store.put(item));
}

export async function listQueue() {
  const items = await readAll();
  setPendingCount(items.length);
  return items;
}

export async function queueCount() {
  const items = await readAll();
  setPendingCount(items.length);
  return items.length;
}

function sameSave(item: QueueItem, payload: Extract<QueuePayload, { type: "estimate.save" }>) {
  return item.type === "estimate.save" && item.data.jobId === payload.data.jobId;
}

function sameLead(item: QueueItem, payload: Extract<QueuePayload, { type: "lead.save" }>) {
  return item.type === "lead.save" && item.data.jobId === payload.data.jobId;
}

function sameNote(item: QueueItem, payload: Extract<QueuePayload, { type: "job.note" }>) {
  return item.type === "job.note" && item.data.jobId === payload.data.jobId;
}

function sameSend(item: QueueItem, payload: Extract<QueuePayload, { type: "estimate.send" }>) {
  return item.type === "estimate.send" && item.data.estimateId === payload.data.estimateId;
}

function samePatch(item: QueueItem, payload: Extract<QueuePayload, { type: "job.patch" }>) {
  return item.type === "job.patch" && item.data.jobId === payload.data.jobId;
}

function sameAnalyze(item: QueueItem, payload: Extract<QueuePayload, { type: "photo.analyze" }>) {
  return item.type === "photo.analyze" && item.data.jobId === payload.data.jobId;
}

export function sameQueuePayload(item: QueueItem, payload: QueuePayload) {
  if (payload.type === "estimate.save") return sameSave(item, payload);
  if (payload.type === "lead.save") return sameLead(item, payload);
  if (payload.type === "job.note") return sameNote(item, payload);
  if (payload.type === "estimate.send") return sameSend(item, payload);
  if (payload.type === "job.patch") return samePatch(item, payload);
  if (payload.type === "photo.analyze") return sameAnalyze(item, payload);
  return false;
}

export function foldQueue(
  items: QueueItem[],
  payload: QueuePayload,
  now = Date.now()
): { items: QueueItem[]; item: QueueItem } {
  const coalesced = items.find((item) => sameQueuePayload(item, payload));
  const item: QueueItem = coalesced
    ? { ...coalesced, ...payload, lastError: undefined }
    : {
        id: uid("q-"),
        createdAt: now,
        attempts: 0,
        ...payload,
      };
  const next = coalesced ? items.map((row) => (row.id === item.id ? item : row)) : [...items, item];
  return { items: next, item };
}

export async function enqueue(payload: QueuePayload): Promise<QueueItem> {
  const items = await readAll();
  const folded = foldQueue(items, payload);
  await write(folded.item);
  await queueCount();
  return folded.item;
}

export async function removeQueueItem(id: string) {
  await withStore(STORE_QUEUE, "readwrite", (store) => store.delete(id));
  await queueCount();
}

export async function markQueueError(id: string, error: string) {
  const items = await readAll();
  const item = items.find((entry) => entry.id === id);
  if (!item) return;
  await write({ ...item, attempts: item.attempts + 1, lastError: error });
}

export async function remapEstimateIds(localId: string, realId: string) {
  const items = await readAll();
  for (const item of items) {
    if (item.type === "estimate.send" && item.data.estimateId === localId) {
      await write({ ...item, data: { ...item.data, estimateId: realId } });
    }
  }
}

export async function dropPhotoUpload(localPhotoId: string) {
  const items = await readAll();
  const match = items.find((item) => item.type === "photo.upload" && item.data.localPhotoId === localPhotoId);
  if (match) await removeQueueItem(match.id);
  return match;
}
