import { NextResponse } from "next/server";
import { geocodeAddress } from "@/lib/drive";
import { parseOpenMeteo } from "@/lib/weather";
import { stateForAddress } from "@/lib/shop-place";

export const dynamic = "force-dynamic";

async function fetchForecast(lat: number, lng: number) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("current", "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,precipitation,dew_point_2m");
  url.searchParams.set("hourly", "temperature_2m,precipitation_probability,weather_code,wind_speed_10m,relative_humidity_2m,dew_point_2m");
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("precipitation_unit", "inch");
  // The site's own zone (any shop, anywhere); times come back with utc_offset_seconds.
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "2");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    return (await response.json()) as Parameters<typeof parseOpenMeteo>[2];
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** "210 Harbor Point Dr, Springfield, IL 62701" → "Springfield, IL 62701". Town-level is plenty for a forecast. */
function townOf(address: string) {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length >= 2 ? parts.slice(1).join(", ") : "";
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const address = params.get("address")?.trim() || "";
  // The shop's own town ("Tulsa, OK"), for a job address typed without one ("14 Oak St").
  const near = params.get("near")?.trim() || "";
  if (!address) {
    return NextResponse.json({ error: "Need a job-site address." }, { status: 400 });
  }
  // New streets and private drives often aren't on the free map yet; fall back to the town for weather.
  const town = townOf(address);
  const bare = !stateForAddress(address);
  const coords =
    (bare && near ? await geocodeAddress(`${address}, ${near}`) : null) ||
    (await geocodeAddress(address)) ||
    (town ? await geocodeAddress(town) : null) ||
    (bare && near ? await geocodeAddress(near) : null);
  if (!coords) {
    return NextResponse.json({ error: "Could not place that address." }, { status: 404 });
  }
  const raw = await fetchForecast(coords.lat, coords.lng);
  const weather = raw ? parseOpenMeteo(address, coords, raw) : null;
  if (!weather) {
    return NextResponse.json({ place: address, coords, current: null, hourly: [] }, { status: 200 });
  }
  return NextResponse.json(weather);
}
