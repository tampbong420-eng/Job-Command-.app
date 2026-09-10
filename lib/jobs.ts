import { randomUUID } from "node:crypto";
import { getDb, toStr } from "./db";
import { resolveStreetViewUrl } from "./street-view";
import type { Job, JobInput } from "./types";

type JobRow = Record<string, unknown>;

function mapJob(row: JobRow): Job {
  return {
    id: String(row.id),
    title: toStr(row.title),
    status: String(row.status ?? "queued"),
    assigned_employee_id: toStr(row.assigned_employee_id),
    customer_name: toStr(row.customer_name),
    customer_phone: toStr(row.customer_phone),
    address: toStr(row.address),
    street_view_url: toStr(row.street_view_url),
    boss_notes: toStr(row.boss_notes),
    required_supplies: toStr(row.required_supplies),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    assigned_employee_name: toStr(row.assigned_employee_name),
  };
}

const JOB_SELECT = `
  SELECT jobs.*, employees.name AS assigned_employee_name
  FROM jobs
  LEFT JOIN employees ON employees.id = jobs.assigned_employee_id
`;

export function listJobs(): Job[] {
  const rows = getDb()
    .prepare(`${JOB_SELECT} ORDER BY jobs.created_at DESC`)
    .all() as JobRow[];
  return rows.map(mapJob);
}

export function listJobsForEmployee(employeeId: string): Job[] {
  const rows = getDb()
    .prepare(
      `${JOB_SELECT} WHERE jobs.assigned_employee_id = ? ORDER BY jobs.created_at DESC`,
    )
    .all(employeeId) as JobRow[];
  return rows.map(mapJob);
}

export function getJob(id: string): Job | undefined {
  const row = getDb()
    .prepare(`${JOB_SELECT} WHERE jobs.id = ?`)
    .get(id) as JobRow | undefined;
  return row ? mapJob(row) : undefined;
}

function normalizeJob(input: JobInput, current?: Job): Omit<Job, "id" | "created_at"> {
  const address =
    input.address !== undefined
      ? input.address?.trim() || null
      : (current?.address ?? null);
  const streetView =
    input.street_view_url !== undefined
      ? input.street_view_url?.trim() || null
      : (current?.street_view_url ?? null);

  return {
    title:
      input.title !== undefined
        ? input.title?.trim() || null
        : (current?.title ?? null),
    status:
      input.status?.trim() ||
      current?.status ||
      (input.assigned_employee_id || current?.assigned_employee_id
        ? "assigned"
        : "queued"),
    assigned_employee_id:
      input.assigned_employee_id !== undefined
        ? input.assigned_employee_id || null
        : (current?.assigned_employee_id ?? null),
    customer_name:
      input.customer_name !== undefined
        ? input.customer_name?.trim() || null
        : (current?.customer_name ?? null),
    customer_phone:
      input.customer_phone !== undefined
        ? input.customer_phone?.trim() || null
        : (current?.customer_phone ?? null),
    address,
    street_view_url: resolveStreetViewUrl(address, streetView),
    boss_notes:
      input.boss_notes !== undefined
        ? input.boss_notes?.trim() || null
        : (current?.boss_notes ?? null),
    required_supplies:
      input.required_supplies !== undefined
        ? input.required_supplies?.trim() || null
        : (current?.required_supplies ?? null),
    updated_at: new Date().toISOString(),
  };
}

export function createJob(input: JobInput): Job {
  const now = new Date().toISOString();
  const fields = normalizeJob(input);
  const job: Job = {
    id: randomUUID(),
    ...fields,
    created_at: now,
  };

  getDb()
    .prepare(
      `INSERT INTO jobs (
        id, title, status, assigned_employee_id,
        customer_name, customer_phone, address, street_view_url,
        boss_notes, required_supplies, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      job.id,
      job.title,
      job.status,
      job.assigned_employee_id,
      job.customer_name,
      job.customer_phone,
      job.address,
      job.street_view_url,
      job.boss_notes,
      job.required_supplies,
      job.created_at,
      job.updated_at,
    );

  return getJob(job.id) ?? job;
}

export function updateJob(id: string, input: JobInput): Job | undefined {
  const current = getJob(id);
  if (!current) return undefined;
  const fields = normalizeJob(input, current);

  getDb()
    .prepare(
      `UPDATE jobs SET
        title = ?, status = ?, assigned_employee_id = ?,
        customer_name = ?, customer_phone = ?, address = ?,
        street_view_url = ?, boss_notes = ?, required_supplies = ?,
        updated_at = ?
      WHERE id = ?`,
    )
    .run(
      fields.title,
      fields.status,
      fields.assigned_employee_id,
      fields.customer_name,
      fields.customer_phone,
      fields.address,
      fields.street_view_url,
      fields.boss_notes,
      fields.required_supplies,
      fields.updated_at,
      id,
    );

  return getJob(id);
}

export function deleteJob(id: string): boolean {
  const result = getDb().prepare("DELETE FROM jobs WHERE id = ?").run(id);
  return Number(result.changes) > 0;
}
