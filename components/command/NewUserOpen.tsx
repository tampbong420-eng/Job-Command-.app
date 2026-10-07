"use client";

import { useEffect } from "react";
import { clearFreshClientGuides, isFreshStartRequest } from "@/lib/new-user-open";

export function NewUserOpen() {
  useEffect(() => {
    if (!isFreshStartRequest()) return;
    clearFreshClientGuides();
  }, []);
  return null;
}
