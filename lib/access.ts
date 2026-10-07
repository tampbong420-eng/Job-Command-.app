import type { Role, SessionDTO } from "@/lib/types";

export type Permission =
  | "admin"
  | "payroll"
  | "company"
  | "cost"
  | "dispatch"
  | "lead"
  | "invoice"
  | "estimate"
  | "photos"
  | "clock"
  | "alerts";

const CREW: Permission[] = ["estimate", "photos", "clock", "alerts"];
const ADMIN: Permission[] = [
  "admin",
  "payroll",
  "company",
  "cost",
  "dispatch",
  "lead",
  "invoice",
  "estimate",
  "photos",
  "clock",
  "alerts",
];

export function can(session: SessionDTO | null | undefined, permission: Permission) {
  if (!session) return false;
  const allowed = session.role === "ADMIN" ? ADMIN : CREW;
  return allowed.includes(permission);
}

export function isAdmin(session: SessionDTO | null | undefined) {
  return session?.role === "ADMIN";
}

export function isCrew(session: SessionDTO | null | undefined) {
  return session?.role === "CREW";
}

export function ownsEmployee(session: SessionDTO | null | undefined, employeeId?: string | null) {
  if (!session || !employeeId) return false;
  if (session.role === "ADMIN") return true;
  return session.employeeId === employeeId;
}

export function fieldDock(role: Role | undefined) {
  if (role === "CREW") return ["command", "crew", "schedule"] as const;
  return ["command", "crew", "schedule", "pay", "company"] as const;
}

export function silentDeny() {
  return undefined;
}
