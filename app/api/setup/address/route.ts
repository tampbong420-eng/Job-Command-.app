import { NextResponse } from "next/server";
import { mapsKey } from "@/lib/maps-server";
import { prisma } from "@/lib/prisma";
import { sessionFromCookieHeader } from "@/lib/session";
import { can } from "@/lib/access";
import { addressHitsFromGoogle, addressHitsFromPhoton, type AddressHit } from "@/lib/address-suggest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cache = new Map<string, { at: number; hits: AddressHit[] }>();

async function fetchJson(url: string, init: RequestInit = {}, ms = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Signup "Shop address" suggestions: Google Places when a Maps key is set, else OSM Photon (no key). */
export async function GET(request: Request) {
  // Public only while the shop is being set up; afterwards owner/office only (keeps the Maps key from being a free proxy).
  const settings = await prisma.appSettings.findUnique({ where: { id: "default" }, select: { setupComplete: true } });
  if (settings?.setupComplete) {
    const session = await sessionFromCookieHeader(request.headers.get("cookie"));
    if (!session || !can(session, "admin")) return NextResponse.json({ hits: [] }, { status: 403 });
  }
  const q = (new URL(request.url).searchParams.get("q") || "").trim().slice(0, 120);
  if (q.length < 5 || !/\d/.test(q)) return NextResponse.json({ hits: [] });
  const key = q.toLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < 10 * 60_000) return NextResponse.json({ hits: cached.hits });

  let hits: AddressHit[] = [];
  const google = mapsKey();
  if (google) {
    const data = await fetchJson("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": google },
      body: JSON.stringify({ input: q, includedRegionCodes: ["us"] }),
    });
    hits = addressHitsFromGoogle(data);
  }
  if (!hits.length) {
    const data = await fetchJson(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en&layer=house&layer=street`,
      { headers: { "User-Agent": "JobCommand/1.0 (signup address)" } }
    );
    hits = addressHitsFromPhoton(data, q);
  }
  if (cache.size > 500) cache.clear();
  if (hits.length) cache.set(key, { at: Date.now(), hits }); // a slow or empty lookup is retried next keystroke
  return NextResponse.json({ hits });
}
