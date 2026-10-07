/**
 * Format a phone number as the user types: (555) 123-4567.
 * Strips non-digits, formats progressively.
 */
export function formatPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  const len = digits.length;
  if (len === 0) return "";
  if (len <= 3) return `(${digits}`;
  if (len <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * Strip formatting for storage: (555) 123-4567 -> 5551234567.
 * Returns the formatted display version for consistency.
 */
export function normalizePhoneNumber(value: string): string {
  return formatPhoneNumber(value);
}
