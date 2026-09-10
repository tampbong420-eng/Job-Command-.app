export function wrapIndex(index: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return (index + delta + length * 10) % length;
}

export function clockLabel(status: "active" | "break" | "off"): string {
  if (status === "active") return "ON THE CLOCK";
  if (status === "break") return "ON BREAK";
  return "CLOCKED OUT";
}

export function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 5) return "Still at it";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function longDate(now = new Date()): string {
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long" })
    .format(now)
    .toUpperCase();
  const month = new Intl.DateTimeFormat("en-US", { month: "short" })
    .format(now)
    .toUpperCase();
  const day = new Intl.DateTimeFormat("en-US", { day: "2-digit" }).format(now);
  return `${weekday} · ${month} ${day}, ${now.getFullYear()}`;
}

export function formatClockTime(iso: string | null): string {
  if (!iso) return "--:--";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatLiveHours(startedAt: string | null, now = Date.now()): string {
  if (!startedAt) return "0h 00m";
  const elapsed = Math.max(0, now - new Date(startedAt).getTime());
  const hours = Math.floor(elapsed / 3_600_000);
  const minutes = Math.floor((elapsed % 3_600_000) / 60_000);
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}
