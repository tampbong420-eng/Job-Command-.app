"use client";

import { useEffect, useState } from "react";
import type { SiteWeatherDTO } from "@/lib/weather";
import { useShopPlace } from "@/components/command/ShopPlace";

const KEY = "jc-site-weather:";

/** Last good forecast per address, so the paint window still shows offline or when the API is busy. */
function remembered(place: string): SiteWeatherDTO | null {
  try {
    const raw = window.localStorage.getItem(KEY + place);
    if (!raw) return null;
    const row = JSON.parse(raw) as { at: number; data: SiteWeatherDTO };
    return Date.now() - row.at < 6 * 3_600_000 && row.data?.current ? row.data : null;
  } catch {
    return null;
  }
}

function remember(place: string, data: SiteWeatherDTO) {
  try {
    if (data.current) window.localStorage.setItem(KEY + place, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* storage full or private mode */
  }
}

export function useSiteWeather(address: string) {
  // The shop's town helps place a job address typed without one, and stands in when the job has no address yet
  // (never a hard-coded town — each shop's own sign-up address).
  const near = useShopPlace().place;
  const target = address.trim() || near.trim();
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(target ? "loading" : "idle");
  const [data, setData] = useState<SiteWeatherDTO | null>(null);

  useEffect(() => {
    const place = target;
    if (!place) {
      setStatus("idle");
      setData(null);
      return;
    }
    let live = true;
    setStatus("loading");
    const nearQuery = near ? `&near=${encodeURIComponent(near)}` : "";
    fetch(`/api/weather?address=${encodeURIComponent(place)}${nearQuery}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("weather"))))
      .then((next: SiteWeatherDTO) => {
        if (!live) return;
        const kept = next?.coords && !next.current ? remembered(place) : null;
        if (next?.coords && next.current) remember(place, next);
        setData(kept || (next?.coords ? next : null));
        setStatus(next?.coords ? "ready" : "error");
      })
      .catch(() => {
        if (!live) return;
        const kept = remembered(place);
        setData(kept);
        setStatus(kept ? "ready" : "error");
      });
    return () => {
      live = false;
    };
  }, [target, near]);

  return { status, data };
}
