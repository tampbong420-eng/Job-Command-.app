export const EMPLOYMENT_STATUSES = [
  { id: "ACTIVE", label: "Active" },
  { id: "TEMPORARY", label: "Temporary" },
  { id: "QUIT", label: "Quit" },
  { id: "FIRED", label: "Fired" },
  { id: "LEAVE", label: "Leave" },
] as const;

export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number]["id"];

export const DEFAULT_EMPLOYMENT_STATUS: EmploymentStatus = "ACTIVE";

export function parseEmploymentStatus(value: string | null | undefined): EmploymentStatus {
  const id = String(value || "").trim().toUpperCase();
  return EMPLOYMENT_STATUSES.some((item) => item.id === id)
    ? (id as EmploymentStatus)
    : DEFAULT_EMPLOYMENT_STATUS;
}

export function employmentStatusLabel(value: string | null | undefined) {
  const id = parseEmploymentStatus(value);
  return EMPLOYMENT_STATUSES.find((item) => item.id === id)?.label || "Active";
}
