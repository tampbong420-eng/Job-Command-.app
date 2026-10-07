"use client";

import { useEffect, useState } from "react";
import { getOfflineSnapshot, subscribeOffline } from "@/lib/offline/net";
import { startOfflineSync } from "@/lib/offline/sync";
import { queueCount } from "@/lib/offline/queue";
import type { OfflineSnapshot } from "@/lib/offline/types";

export function useOffline(): OfflineSnapshot {
  const [snap, setSnap] = useState<OfflineSnapshot>(() => getOfflineSnapshot());

  useEffect(() => {
    startOfflineSync();
    void queueCount();
    return subscribeOffline(setSnap);
  }, []);

  return snap;
}

export function useOfflineSync() {
  useEffect(() => {
    startOfflineSync();
    void queueCount();
  }, []);
}
