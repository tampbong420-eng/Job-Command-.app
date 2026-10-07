import { shopTimeZone } from "@/lib/dates";

export type SiteCoords = { lat: number; lng: number };

export type WeatherNow = {
  tempF: number;
  feelsF: number;
  windMph: number;
  humidity: number;
  precipIn: number;
  code: number;
  label: string;
  at: string;
  /** Dew point (°F) for the paint-window check. Optional for older cached payloads. */
  dewPointF?: number;
};

export type WeatherHour = {
  at: string;
  hour: string;
  tempF: number;
  precipPct: number;
  windMph: number;
  code: number;
  label: string;
  /** Optional extras for the paint window (lib/paint-window.ts). */
  humidity?: number;
  dewPointF?: number;
};

export type SiteWeatherDTO = {
  place: string;
  coords: SiteCoords;
  current: WeatherNow | null;
  hourly: WeatherHour[];
};

export function weatherLabel(code: number) {
  if (code === 0) return "Clear";
  if (code === 1) return "Mostly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Showers";
  if (code === 85 || code === 86) return "Snow showers";
  if (code >= 95) return "Thunder";
  return "Outdoor weather";
}

function round(value: number) {
  return Math.round(Number(value) || 0);
}

/** Hour label on the site's clock (Open-Meteo's zone for that spot), else the shop's clock. */
function hourLabel(iso: string, timeZone?: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return date.toLocaleTimeString("en-US", { hour: "numeric", timeZone: timeZone || shopTimeZone() });
  } catch {
    return date.toLocaleTimeString("en-US", { hour: "numeric", timeZone: shopTimeZone() });
  }
}

/** Open-Meteo local times ("2026-10-02T14:00") → an exact instant using the spot's UTC offset. */
export function withUtcOffset(iso: string, offsetSeconds?: number | null) {
  if (!iso || offsetSeconds == null || !Number.isFinite(offsetSeconds)) return iso;
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(iso)) return iso;
  const sign = offsetSeconds < 0 ? "-" : "+";
  const abs = Math.abs(Math.round(offsetSeconds / 60));
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${iso}${iso.length === 16 ? ":00" : ""}${sign}${hh}:${mm}`;
}

export function pickHourly(
  times: string[],
  temps: number[],
  precip: number[],
  wind: number[],
  codes: number[],
  fromIso: string,
  count = 12,
  humidity: number[] = [],
  dewPoint: number[] = [],
  timeZone?: string
): WeatherHour[] {
  const start = new Date(fromIso).getTime();
  const rows: WeatherHour[] = [];
  for (let i = 0; i < times.length && rows.length < count; i += 1) {
    const at = times[i];
    if (!at) continue;
    const stamp = new Date(at).getTime();
    if (Number.isNaN(stamp) || stamp < start - 30 * 60 * 1000) continue;
    const code = Number(codes[i]) || 0;
    rows.push({
      at,
      hour: hourLabel(at, timeZone),
      tempF: round(temps[i]),
      precipPct: Math.max(0, Math.min(100, round(precip[i]))),
      windMph: round(wind[i]),
      code,
      label: weatherLabel(code),
      ...(humidity[i] != null ? { humidity: round(humidity[i]) } : {}),
      ...(dewPoint[i] != null ? { dewPointF: round(dewPoint[i]) } : {}),
    });
  }
  return rows;
}

export function parseOpenMeteo(
  place: string,
  coords: SiteCoords,
  payload: {
    /** IANA zone of the spot (we ask Open-Meteo for timezone=auto). */
    timezone?: string;
    utc_offset_seconds?: number;
    current?: {
      time?: string;
      temperature_2m?: number;
      apparent_temperature?: number;
      weather_code?: number;
      wind_speed_10m?: number;
      relative_humidity_2m?: number;
      precipitation?: number;
      dew_point_2m?: number;
    };
    hourly?: {
      time?: string[];
      temperature_2m?: number[];
      precipitation_probability?: number[];
      weather_code?: number[];
      wind_speed_10m?: number[];
      relative_humidity_2m?: number[];
      dew_point_2m?: number[];
    };
  }
): SiteWeatherDTO | null {
  const current = payload.current;
  if (!current || current.temperature_2m == null) return null;
  const code = Number(current.weather_code) || 0;
  const offset = payload.utc_offset_seconds;
  const at = current.time ? withUtcOffset(current.time, offset) : new Date().toISOString();
  return {
    place,
    coords,
    current: {
      tempF: round(current.temperature_2m),
      feelsF: round(current.apparent_temperature ?? current.temperature_2m),
      windMph: round(current.wind_speed_10m || 0),
      humidity: round(current.relative_humidity_2m || 0),
      precipIn: Math.round((Number(current.precipitation) || 0) * 100) / 100,
      code,
      label: weatherLabel(code),
      at,
      ...(current.dew_point_2m != null ? { dewPointF: round(current.dew_point_2m) } : {}),
    },
    hourly: pickHourly(
      (payload.hourly?.time || []).map((time) => withUtcOffset(time, offset)),
      payload.hourly?.temperature_2m || [],
      payload.hourly?.precipitation_probability || [],
      payload.hourly?.wind_speed_10m || [],
      payload.hourly?.weather_code || [],
      at,
      12,
      payload.hourly?.relative_humidity_2m || [],
      payload.hourly?.dew_point_2m || [],
      payload.timezone
    ),
  };
}
