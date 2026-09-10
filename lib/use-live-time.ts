import { useSyncExternalStore } from "react";
import { formatClockTime, greeting, longDate } from "./format";

function subscribeNow(onChange: () => void) {
  const id = window.setInterval(onChange, 1000);
  return () => window.clearInterval(id);
}

export function useLiveNow(): number {
  return useSyncExternalStore(
    subscribeNow,
    () => Date.now(),
    () => 0,
  );
}

export function useLiveDate(): string {
  return useSyncExternalStore(
    () => () => {},
    () => longDate(),
    () => "FIELD DATE",
  );
}

export function useLiveGreeting(): string {
  return useSyncExternalStore(
    () => () => {},
    () => greeting(),
    () => "Hello",
  );
}

export function useLiveClockTime(iso: string | null): string {
  return useSyncExternalStore(
    () => () => {},
    () => formatClockTime(iso),
    () => "--:--",
  );
}
