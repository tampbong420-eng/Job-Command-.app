import { randomUUID } from "node:crypto";
import { getDb, newLinkToken, toBool, toNum, toStr } from "./db";
import type { Employee, EmployeeInput } from "./types";

type EmployeeRow = Record<string, unknown>;

function mapEmployee(row: EmployeeRow): Employee {
  return {
    id: String(row.id),
    name: String(row.name),
    role: toStr(row.role),
    phone: toStr(row.phone),
    unique_link_token: toStr(row.unique_link_token),
    is_on_clock: toBool(row.is_on_clock),
    current_lat: toNum(row.current_lat),
    current_lng: toNum(row.current_lng),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function listEmployees(): Employee[] {
  const rows = getDb()
    .prepare(
      "SELECT * FROM employees ORDER BY name COLLATE NOCASE ASC, created_at ASC",
    )
    .all() as EmployeeRow[];
  return rows.map(mapEmployee);
}

export function getEmployee(id: string): Employee | undefined {
  const row = getDb()
    .prepare("SELECT * FROM employees WHERE id = ?")
    .get(id) as EmployeeRow | undefined;
  return row ? mapEmployee(row) : undefined;
}

export function getEmployeeByToken(token: string): Employee | undefined {
  const row = getDb()
    .prepare("SELECT * FROM employees WHERE unique_link_token = ?")
    .get(token) as EmployeeRow | undefined;
  return row ? mapEmployee(row) : undefined;
}

export function createEmployee(input: EmployeeInput): Employee {
  const now = new Date().toISOString();
  const employee: Employee = {
    id: randomUUID(),
    name: input.name.trim(),
    role: input.role?.trim() || "Crew",
    phone: input.phone?.trim() || null,
    unique_link_token: newLinkToken(),
    is_on_clock: false,
    current_lat: null,
    current_lng: null,
    created_at: now,
    updated_at: now,
  };

  getDb()
    .prepare(
      `INSERT INTO employees (
        id, name, role, phone, unique_link_token, is_on_clock,
        current_lat, current_lng, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      employee.id,
      employee.name,
      employee.role,
      employee.phone,
      employee.unique_link_token,
      0,
      null,
      null,
      employee.created_at,
      employee.updated_at,
    );

  return employee;
}

export function updateEmployee(
  id: string,
  patch: Partial<
    Pick<
      Employee,
      | "name"
      | "role"
      | "phone"
      | "is_on_clock"
      | "current_lat"
      | "current_lng"
      | "unique_link_token"
    >
  >,
): Employee | undefined {
  const current = getEmployee(id);
  if (!current) return undefined;

  const next: Employee = {
    ...current,
    name: patch.name?.trim() ?? current.name,
    role: patch.role !== undefined ? patch.role?.trim() || null : current.role,
    phone:
      patch.phone !== undefined ? patch.phone?.trim() || null : current.phone,
    is_on_clock: patch.is_on_clock ?? current.is_on_clock,
    current_lat:
      patch.current_lat !== undefined ? patch.current_lat : current.current_lat,
    current_lng:
      patch.current_lng !== undefined ? patch.current_lng : current.current_lng,
    unique_link_token:
      patch.unique_link_token !== undefined
        ? patch.unique_link_token
        : current.unique_link_token,
    updated_at: new Date().toISOString(),
  };

  getDb()
    .prepare(
      `UPDATE employees SET
        name = ?, role = ?, phone = ?, unique_link_token = ?,
        is_on_clock = ?, current_lat = ?, current_lng = ?, updated_at = ?
      WHERE id = ?`,
    )
    .run(
      next.name,
      next.role,
      next.phone,
      next.unique_link_token,
      next.is_on_clock ? 1 : 0,
      next.current_lat,
      next.current_lng,
      next.updated_at,
      id,
    );

  return next;
}

export function clockEmployee(
  id: string,
  onClock: boolean,
  coords?: { lat?: number | null; lng?: number | null },
): Employee | undefined {
  return updateEmployee(id, {
    is_on_clock: onClock,
    current_lat: onClock ? (coords?.lat ?? null) : null,
    current_lng: onClock ? (coords?.lng ?? null) : null,
  });
}

export function pingEmployeeLocation(
  id: string,
  lat: number,
  lng: number,
): Employee | undefined {
  return updateEmployee(id, { current_lat: lat, current_lng: lng });
}

export function rotateEmployeeLink(id: string): Employee | undefined {
  return updateEmployee(id, { unique_link_token: newLinkToken() });
}

export function deleteEmployee(id: string): boolean {
  const result = getDb().prepare("DELETE FROM employees WHERE id = ?").run(id);
  return Number(result.changes) > 0;
}
