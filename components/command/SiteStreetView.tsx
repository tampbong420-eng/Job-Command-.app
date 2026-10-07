"use client";

import { SiteMap } from "@/components/command/SiteMap";
import type { SiteCoords } from "@/lib/weather";

/** @deprecated Use SiteMap — kept so older imports still render the Active site view. */
export function SiteStreetView({
  address,
  coords,
  origin,
}: {
  address: string;
  coords?: SiteCoords | null;
  origin?: string;
}) {
  return <SiteMap address={address} coords={coords} origin={origin} />;
}
