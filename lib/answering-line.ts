/**
 * Go-public B4: the old signup "reserved" a made-up (312) 555-xxxx line. 555 numbers are fictional and no
 * phone service exists behind them, so they are never shown as the shop's AI line.
 */
export function isPlaceholderLine(value: string | null | undefined) {
  const digits = String(value || "").replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return !local || (local.length === 10 && local.slice(3, 6) === "555");
}

/** A real AI answering line to show, or "" (placeholder / none). */
export function realAnsweringLine(value: string | null | undefined) {
  return isPlaceholderLine(value) ? "" : String(value || "").trim();
}

/** @deprecated made-up 555 number; signup no longer uses it. */
export function assignAnsweringLine(seed: string): string {
  let value = 0;
  for (const char of seed || "job-command") {
    value = (value * 33 + char.charCodeAt(0)) >>> 0;
  }
  const last = String(1000 + (value % 9000));
  return `(312) 555-${last}`;
}

export function prettyPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (local.length !== 10) return value.trim();
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}
