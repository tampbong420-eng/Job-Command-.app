import { fileGet, kvGet, kvSet } from "@/lib/offline/idb";
import { listQueue } from "@/lib/offline/queue";
import { keepPendingPhotos } from "@/lib/photo-cache";
import type { CachedWorkspace, EstimateSavePayload, QueueItem } from "@/lib/offline/types";
import { isPricedLine, type DocLineDraft } from "@/lib/documents";
import type { CustomerDTO, EmployeeDTO, EstimateDTO, JobDTO, JobPhotoDTO, TimeEntryDTO } from "@/lib/types";
import { todayString } from "@/lib/dates";

const WORKSPACE_KEY = "workspace";
const blobUrls = new Map<string, string>();
const shotsByJob = new Map<string, JobPhotoDTO[]>();
const replacedLocalIds = new Set<string>();

export async function cacheWorkspace(input: Omit<CachedWorkspace, "cachedAt">) {
  const payload: CachedWorkspace = { ...input, cachedAt: new Date().toISOString() };
  await kvSet(WORKSPACE_KEY, payload);
}

export async function readWorkspaceCache() {
  return kvGet<CachedWorkspace>(WORKSPACE_KEY);
}

function lineDTOs(lines: DocLineDraft[]) {
  return lines.filter(isPricedLine).map((line, index) => ({
    id: line.id || `local-line-${index}`,
    kind: line.kind,
    description: line.description,
    quantity: line.quantity,
    unit: line.unit,
    rate: line.rate,
    amount: Math.round((Number(line.quantity) || 0) * (Number(line.rate) || 0) * 100) / 100,
  }));
}

function draftEstimate(payload: EstimateSavePayload, sent: boolean): EstimateDTO {
  return {
    id: `local:est:${payload.jobId}`,
    number: "EST-draft",
    jobId: payload.jobId,
    customerId: payload.customerId || payload.customer?.id || null,
    status: sent ? "SENT" : "DRAFT",
    notes: payload.notes,
    terms: payload.terms || "",
    taxRate: payload.taxRate || 0,
    publicToken: null,
    sentAt: sent ? new Date().toISOString() : null,
    viewedAt: null,
    acceptedAt: null,
    changesAt: null,
    signedName: "",
    clientNote: "",
    sentEmail: sent,
    sentSms: sent,
    lastFollowUpAt: null,
    followUpCount: 0,
    createdAt: new Date().toISOString(),
    lines: lineDTOs(payload.lines),
    deliveries: sent
      ? [
          {
            id: `local:del:${payload.jobId}:email`,
            estimateId: `local:est:${payload.jobId}`,
            customerId: payload.customerId || payload.customer?.id || null,
            channel: "email",
            status: "queued",
            provider: "mock",
            toAddress: payload.customer?.email || "",
            createdAt: new Date().toISOString(),
          },
        ]
      : [],
  };
}

function mergeCustomer(current: CustomerDTO | undefined, patch: EstimateSavePayload["customer"], fallbackName: string): CustomerDTO | null {
  if (!patch && !current) return null;
  return {
    id: patch?.id || current?.id || `local:cust:${fallbackName}`,
    name: patch?.name || current?.name || fallbackName,
    email: patch?.email ?? current?.email ?? "",
    phone: patch?.phone ?? current?.phone ?? "",
    address: patch?.address || current?.address || "",
  };
}

export async function localPhotosByJob(): Promise<Record<string, JobPhotoDTO[]>> {
  const items = await listQueue();
  const out: Record<string, JobPhotoDTO[]> = {};
  for (const item of items) {
    if (item.type !== "photo.upload") continue;
    const file = await fileGet(item.data.fileId);
    if (!file) continue;
    let url = blobUrls.get(item.data.localPhotoId);
    if (!url) {
      url = URL.createObjectURL(file.blob);
      blobUrls.set(item.data.localPhotoId, url);
    }
    const photo: JobPhotoDTO = {
      id: item.data.localPhotoId,
      url,
      caption: item.data.caption,
      createdAt: new Date(item.createdAt).toISOString(),
    };
    out[item.data.jobId] = [...(out[item.data.jobId] || []), photo];
  }
  return out;
}

export function rememberLocalPhotoUrl(localPhotoId: string, url: string) {
  blobUrls.set(localPhotoId, url);
}

export function localPhotoUrl(localPhotoId: string) {
  return blobUrls.get(localPhotoId);
}

export function revokeLocalPhotoUrl(localPhotoId: string) {
  const url = blobUrls.get(localPhotoId);
  if (url) {
    URL.revokeObjectURL(url);
    blobUrls.delete(localPhotoId);
  }
}

export function rememberJobPhoto(jobId: string, photo: JobPhotoDTO, replacesId?: string) {
  const current = shotsByJob.get(jobId) || [];
  const drop = new Set<string>([photo.id]);
  if (replacesId) {
    drop.add(replacesId);
    replacedLocalIds.add(replacesId);
  }
  shotsByJob.set(jobId, [photo, ...current.filter((item) => !drop.has(item.id))]);
}

export function isReplacedLocalPhoto(photoId: string) {
  return replacedLocalIds.has(photoId);
}

export function forgetJobPhoto(jobId: string, photoId: string) {
  const next = (shotsByJob.get(jobId) || []).filter((photo) => photo.id !== photoId);
  if (next.length) shotsByJob.set(jobId, next);
  else shotsByJob.delete(jobId);
}

export function rememberedPhotosForJob(jobId: string) {
  return shotsByJob.get(jobId) || [];
}

export function rememberedPhotosByJob() {
  const out: Record<string, JobPhotoDTO[]> = {};
  for (const [jobId, photos] of shotsByJob) out[jobId] = photos;
  return out;
}

function applyClocks(employees: EmployeeDTO[], items: QueueItem[]): EmployeeDTO[] {
  const today = todayString();
  return employees.map((employee) => {
    const clocks = items.filter((item) => item.type === "clock" && item.data.employeeId === employee.id);
    const hours = items.filter((item) => item.type === "hours" && item.data.employeeId === employee.id);
    if (!clocks.length && !hours.length) return employee;
    const entries: TimeEntryDTO[] = employee.timeEntries.map((entry) => ({ ...entry }));
    for (const item of hours) {
      if (item.type !== "hours") continue;
      const existing =
        entries.find((entry) => entry.id === item.data.entryId) ||
        entries.find((entry) => entry.date === item.data.date && entry.jobId === item.data.jobId);
      if (existing) {
        existing.scheduledHours = item.data.scheduledHours;
        existing.scheduledStart = item.data.scheduledStart || existing.scheduledStart;
        existing.scheduledEnd = item.data.scheduledEnd || existing.scheduledEnd;
        existing.jobId = item.data.jobId;
      } else {
        entries.push({
          id: `local:hours:${item.id}`,
          date: item.data.date,
          scheduledHours: item.data.scheduledHours,
          actualHours: item.data.actualHours,
          clockIn: null,
          clockOut: null,
          scheduledStart: item.data.scheduledStart || null,
          scheduledEnd: item.data.scheduledEnd || null,
          status: "SCHEDULED",
          jobId: item.data.jobId,
          serviceCodeId: item.data.serviceCodeId,
          notes: item.data.notes || null,
          job: null,
          serviceCode: null,
        });
      }
    }
    for (const item of clocks) {
      if (item.type !== "clock") continue;
      const now = new Date(item.createdAt).toISOString();
      const byJob = item.data.jobId
        ? entries.find((entry) => entry.date === today && entry.jobId === item.data.jobId)
        : null;
      const live = entries.find((entry) => entry.date === today && entry.clockIn && !entry.clockOut);
      const todayRow = live || byJob || entries.find((entry) => entry.date === today);
      if (!todayRow) continue;
      if (item.data.action === "IN") {
        todayRow.clockIn = now;
        todayRow.clockOut = null;
        todayRow.status = "IN_PROGRESS";
        if (item.data.jobId) todayRow.jobId = item.data.jobId;
      } else {
        todayRow.clockOut = now;
        todayRow.status = "COMPLETE";
      }
    }
    return { ...employee, timeEntries: entries };
  });
}

export function applyQueueOverlay(
  workspace: { jobs: JobDTO[]; customers: CustomerDTO[]; estimates: EstimateDTO[]; employees?: EmployeeDTO[] },
  items: QueueItem[],
  photos: Record<string, JobPhotoDTO[]>
) {
  const jobs = workspace.jobs.map((job) => {
    const extra = photos[job.id] || [];
    const note = items.find((item) => item.type === "job.note" && item.data.jobId === job.id);
    const lead = items.find((item) => item.type === "lead.save" && item.data.jobId === job.id);
    const patch = items.find((item) => item.type === "job.patch" && item.data.jobId === job.id);
    return {
      ...job,
      notes: note?.type === "job.note" ? note.data.notes : lead?.type === "lead.save" ? lead.data.scopeOfWork : patch?.type === "job.patch" && patch.data.notes !== undefined ? patch.data.notes : job.notes,
      address: lead?.type === "lead.save" ? lead.data.address : patch?.type === "job.patch" && patch.data.address !== undefined ? patch.data.address : job.address,
      client: lead?.type === "lead.save" ? lead.data.clientName : patch?.type === "job.patch" && patch.data.client !== undefined ? patch.data.client : job.client,
      dueDate: patch?.type === "job.patch" && patch.data.dueDate !== undefined ? patch.data.dueDate : job.dueDate,
      prepChecklist: patch?.type === "job.patch" && patch.data.prepChecklist !== undefined ? patch.data.prepChecklist : job.prepChecklist,
      customerId:
        lead?.type === "lead.save"
          ? workspace.customers.find((customer) => customer.name === lead.data.clientName)?.id || job.customerId
          : job.customerId,
      photos: [...extra, ...job.photos.filter((photo) => !extra.some((item) => item.id === photo.id))],
    };
  });

  const customers = [...workspace.customers];
  const estimates = [...workspace.estimates];

  for (const item of items) {
    if (item.type !== "estimate.save") continue;
    const sent = items.some((entry) => entry.type === "estimate.send" && (entry.data.estimateId === `local:est:${item.data.jobId}` || entry.data.jobId === item.data.jobId));
    const existing = estimates.find((estimate) => estimate.jobId === item.data.jobId);
    const job = jobs.find((entry) => entry.id === item.data.jobId);
    const merged = existing
      ? {
          ...existing,
          notes: item.data.notes,
          terms: item.data.terms || existing.terms,
          taxRate: item.data.taxRate ?? existing.taxRate,
          status: sent && existing.status === "DRAFT" ? "SENT" : existing.status,
          lines: lineDTOs(item.data.lines).length ? lineDTOs(item.data.lines) : existing.lines,
        }
      : draftEstimate(item.data, sent);
    if (!merged) continue;
    const index = estimates.findIndex((estimate) => estimate.jobId === item.data.jobId);
    if (index >= 0) estimates[index] = merged;
    else estimates.push(merged);

    const patch = mergeCustomer(
      customers.find((customer) => customer.id === item.data.customerId || customer.name === item.data.customer?.name),
      item.data.customer,
      job?.client || item.data.customer?.name || ""
    );
    if (patch) {
      const customerIndex = customers.findIndex((customer) => customer.id === patch.id || customer.name === patch.name);
      if (customerIndex >= 0) customers[customerIndex] = { ...customers[customerIndex], ...patch };
      else customers.push(patch);
    }
  }

  for (const item of items) {
    if (item.type !== "lead.save") continue;
    const existing = customers.find((customer) => customer.name === item.data.clientName);
    const next: CustomerDTO = {
      id: existing?.id || `local:cust:${item.data.jobId}`,
      name: item.data.clientName,
      phone: item.data.phone,
      email: existing?.email || "",
      address: item.data.address,
    };
    if (existing) {
      const index = customers.findIndex((customer) => customer.id === existing.id);
      customers[index] = { ...existing, ...next, id: existing.id };
    } else customers.push(next);
    const jobIndex = jobs.findIndex((job) => job.id === item.data.jobId);
    if (jobIndex >= 0) jobs[jobIndex] = { ...jobs[jobIndex], customerId: next.id, client: next.name };
  }

  return { jobs, customers, estimates, employees: applyClocks(workspace.employees || [], items) };
}

export async function overlayWorkspace(workspace: {
  jobs: JobDTO[];
  customers: CustomerDTO[];
  estimates: EstimateDTO[];
  employees?: EmployeeDTO[];
}) {
  const items = await listQueue();
  const queued = await localPhotosByJob();
  const remembered = rememberedPhotosByJob();
  const photos: Record<string, JobPhotoDTO[]> = {};
  for (const jobId of new Set([...Object.keys(queued), ...Object.keys(remembered)])) {
    photos[jobId] = keepPendingPhotos([], queued[jobId] || [], remembered[jobId] || []);
  }
  return applyQueueOverlay(workspace, items, photos);
}
