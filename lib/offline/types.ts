import type { DocLineDraft } from "@/lib/documents";
import type { CustomerDTO, EmployeeDTO, EstimateDTO, InvoiceDTO, JobDTO, PayrollSettingsDTO } from "@/lib/types";

export type NetStatus = "online" | "offline" | "syncing";

export type OfflineSnapshot = {
  status: NetStatus;
  pending: number;
};

export type CachedWorkspace = {
  employees: EmployeeDTO[];
  jobs: JobDTO[];
  customers: CustomerDTO[];
  invoices: InvoiceDTO[];
  estimates: EstimateDTO[];
  settings: PayrollSettingsDTO;
  cachedAt: string;
};

export type CustomerPatch = {
  id?: string;
  name: string;
  email: string;
  phone: string;
  address?: string;
};

export type EstimateSavePayload = {
  jobId: string;
  customerId?: string | null;
  customer?: CustomerPatch | null;
  notes: string;
  terms?: string;
  prompt?: string;
  taxRate?: number;
  lines: DocLineDraft[];
  actor: string;
};

export type EstimateSendPayload = {
  estimateId: string;
  jobId?: string;
  actor: string;
  channels?: Array<"email" | "sms">;
  origin: string;
};

export type PhotoUploadPayload = {
  jobId: string;
  caption: string;
  fileId: string;
  name: string;
  mime: string;
  localPhotoId: string;
  actor: string;
};

export type PhotoAnalyzePayload = {
  jobId: string;
  actor: string;
};

export type PhotoDeletePayload = {
  photoId: string;
};

export type JobNotePayload = {
  jobId: string;
  notes: string;
  actor: string;
};

export type LeadSavePayload = {
  jobId: string;
  clientName: string;
  phone: string;
  address: string;
  scopeOfWork: string;
  timeline: string;
  actor: string;
  appointment?: {
    employeeId: string;
    date: string;
    start: string;
    end: string;
  } | null;
};

export type ClockPayload = {
  employeeId: string;
  action: "IN" | "OUT";
  actor: string;
  jobId?: string | null;
  unpaidHours?: number;
};

export type HoursPayload = {
  employeeId: string;
  date: string;
  scheduledHours: number;
  actualHours: number;
  jobId: string | null;
  serviceCodeId: string | null;
  notes?: string | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  actor: string;
  entryId?: string;
  clockIn?: string | null;
  /** Missed punch-out fix from the Active page mic (“Casey left at 3”). */
  clockOut?: string | null;
  /** JOB | ESTIMATE from the Schedule add flow; queued with the rest of the row. */
  kind?: "JOB" | "ESTIMATE";
};

export type VoiceIngestPayload = {
  jobId: string;
  fileId: string;
  name: string;
  mime: string;
  transcript: string;
  actor: string;
};

export type JobPatchPayload = {
  jobId: string;
  name?: string;
  client?: string;
  address?: string;
  notes?: string;
  timeline?: string;
  dueDate?: string | null;
  prepChecklist?: string;
  actor: string;
};

export type QueuePayload =
  | { type: "photo.upload"; data: PhotoUploadPayload }
  | { type: "photo.delete"; data: PhotoDeletePayload }
  | { type: "photo.analyze"; data: PhotoAnalyzePayload }
  | { type: "estimate.save"; data: EstimateSavePayload }
  | { type: "estimate.send"; data: EstimateSendPayload }
  | { type: "job.note"; data: JobNotePayload }
  | { type: "lead.save"; data: LeadSavePayload }
  | { type: "clock"; data: ClockPayload }
  | { type: "hours"; data: HoursPayload }
  | { type: "job.patch"; data: JobPatchPayload }
  | { type: "voice.ingest"; data: VoiceIngestPayload };

export type QueueItem = {
  id: string;
  createdAt: number;
  attempts: number;
  lastError?: string;
} & QueuePayload;

export const OFFLINE_EVENT = "job-command-offline";
