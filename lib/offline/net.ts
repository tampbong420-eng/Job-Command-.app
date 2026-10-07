import { OFFLINE_EVENT, type NetStatus, type OfflineSnapshot } from "@/lib/offline/types";

let status: NetStatus = typeof navigator === "undefined" || navigator.onLine ? "online" : "offline";
let pending = 0;
const listeners = new Set<(snap: OfflineSnapshot) => void>();

export function getOfflineSnapshot(): OfflineSnapshot {
  return { status, pending };
}

export function setPendingCount(count: number) {
  pending = count;
  emit();
}

export function setNetStatus(next: NetStatus) {
  if (status === next) {
    emit();
    return;
  }
  status = next;
  emit();
}

function emit() {
  const snap = getOfflineSnapshot();
  listeners.forEach((fn) => fn(snap));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OFFLINE_EVENT, { detail: snap }));
  }
}

export function subscribeOffline(listener: (snap: OfflineSnapshot) => void) {
  listeners.add(listener);
  listener(getOfflineSnapshot());
  return () => {
    listeners.delete(listener);
  };
}

export function browserOnline() {
  if (typeof navigator === "undefined") return true;
  if (status === "offline") return false;
  return navigator.onLine !== false;
}

export function isNetworkError(error: unknown) {
  if (error instanceof TypeError) return true;
  const message = error instanceof Error ? error.message : String(error || "");
  return /failed to fetch|networkerror|load failed|offline|fetch failed|network request failed|timeout|aborterror|err_internet|err_name_not_resolved|the internet connection appears to be offline/i.test(
    message
  );
}

export async function probeOnline(timeoutMs = 2500) {
  if (typeof window === "undefined") return true;
  if (!browserOnline()) return false;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("/api/health", {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function liveOrThrow<T>(run: () => Promise<T>): Promise<T> {
  if (!browserOnline()) {
    throw new TypeError("Failed to fetch");
  }
  return run();
}
