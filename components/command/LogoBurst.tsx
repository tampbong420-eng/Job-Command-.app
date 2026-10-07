"use client";

import { usePathname } from "next/navigation";
import { INTRO_BOOT_ENABLED } from "@/lib/intro-boot";
import { IntroBoot } from "@/components/command/IntroBoot";

/** Client-facing pages (invoice /p, estimate /e) carry the shop's brand, not the app splash. */
export function isClientDocumentPath(pathname: string | null | undefined) {
  return /^\/(p|e)\//.test(pathname || "");
}

/**
 * Start-up overlay mount only. The logo fade splash lives in IntroBoot.
 * Instant rollback: set INTRO_BOOT_ENABLED to false in lib/intro-boot.ts.
 */
export function LogoBurst() {
  const pathname = usePathname();
  if (!INTRO_BOOT_ENABLED) return null;
  if (isClientDocumentPath(pathname)) return null;
  return <IntroBoot />;
}
