/**
 * Paint window — can the crew put an exterior coat on right now, and until when?
 *
 * Rule (painting trade; the exterior-coat rule Job Command shipped with):
 *   - air (stand-in for surface) at least 50°F
 *   - relative humidity under 85%
 *   - surface at least 5°F above the dew point (we read air temp as the surface temp)
 *   - no rain in the 4 hours after a coat goes on (rain = 40%+ chance that hour)
 *
 * Hours come straight from the Open-Meteo hourly strip (`at` is the site's local wall time,
 * "YYYY-MM-DDTHH:mm", optionally followed by the site's UTC offset; the hour is read from the text).
 * Missing humidity / dew point just skips that check instead of guessing.
 */

export type PaintHour = {
  at: string;
  tempF: number;
  precipPct: number;
  humidity?: number | null;
  dewPointF?: number | null;
};

export type PaintRules = {
  minTempF: number;
  maxHumidity: number;
  minDewSpreadF: number;
  dryHours: number;
  rainPct: number;
  /** Last hour of the work day we bother calling (24h clock). */
  dayEndHour: number;
};

export const PAINT_RULES: PaintRules = {
  minTempF: 50,
  maxHumidity: 85,
  minDewSpreadF: 5,
  dryHours: 4,
  rainPct: 40,
  dayEndHour: 19,
};

export type PaintCall = "go" | "caution" | "stop";

export type PaintHourCall = {
  at: string;
  hour: number;
  label: string;
  tempF: number;
  precipPct: number;
  call: PaintCall;
  /** Plain-words reasons this hour fails on its own (empty for go / caution). */
  problems: string[];
};

export type PaintWindow = {
  call: PaintCall | "unknown";
  headline: string;
  detail: string;
  /** Last hour a coat can still go on and get its dry hours. */
  lastCoat: string | null;
  hours: PaintHourCall[];
};

export function hourOf(at: string): number {
  const match = /T(\d{2}):/.exec(at);
  if (match) return Number(match[1]);
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? 0 : date.getHours();
}

export function hourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

function dayOf(at: string) {
  return at.slice(0, 10);
}

/** Why this single hour is not paintable, in words a painter would say. */
export function hourProblems(row: PaintHour, rules: PaintRules = PAINT_RULES): string[] {
  const out: string[] = [];
  const temp = Math.round(row.tempF);
  if (temp < rules.minTempF) out.push(`Too cold: ${temp}° (needs ${rules.minTempF}°)`);
  if (row.humidity != null && Math.round(row.humidity) >= rules.maxHumidity) {
    out.push(`Too humid: ${Math.round(row.humidity)}% (needs under ${rules.maxHumidity}%)`);
  }
  if (row.dewPointF != null) {
    const spread = Math.round(row.tempF - row.dewPointF);
    if (spread < rules.minDewSpreadF) {
      out.push(`Walls may sweat: only ${Math.max(0, spread)}° above dew point (needs ${rules.minDewSpreadF}°)`);
    }
  }
  if (Math.round(row.precipPct) >= rules.rainPct) out.push(`Rain ${Math.round(row.precipPct)}%`);
  return out;
}

export function paintWindow(hours: PaintHour[], rules: PaintRules = PAINT_RULES): PaintWindow {
  const sorted = hours.filter((row) => row && typeof row.at === "string" && Number.isFinite(row.tempF));
  if (!sorted.length) {
    return {
      call: "unknown",
      headline: "Forecast not in yet",
      detail: "It loads when the phone has signal.",
      lastCoat: null,
      hours: [],
    };
  }
  const today = dayOf(sorted[0].at);
  const rows = sorted.filter((row) => dayOf(row.at) === today && hourOf(row.at) <= rules.dayEndHour);
  if (!rows.length) {
    return {
      call: "unknown",
      headline: "Work day is over",
      detail: "Tomorrow’s paint window shows up in the morning.",
      lastCoat: null,
      hours: [],
    };
  }

  // Rain anywhere in the 4-hour dry window counts against starting a coat — even past quitting time.
  const all = sorted;
  const rainSoon = (index: number) => {
    const start = all.indexOf(rows[index]);
    for (let k = start; k < Math.min(all.length, start + rules.dryHours); k += 1) {
      if (Math.round(all[k].precipPct) >= rules.rainPct) return all[k];
    }
    return null;
  };

  const calls: PaintHourCall[] = rows.map((row, index) => {
    const problems = hourProblems(row, rules);
    const call: PaintCall = problems.length ? "stop" : rainSoon(index) ? "caution" : "go";
    const hour = hourOf(row.at);
    return {
      at: row.at,
      hour,
      label: hourLabel(hour),
      tempF: Math.round(row.tempF),
      precipPct: Math.round(row.precipPct),
      call,
      problems,
    };
  });

  const first = calls[0];
  const lastGoIndex = (() => {
    let index = -1;
    for (let i = 0; i < calls.length; i += 1) {
      if (calls[i].call !== "go") break;
      index = i;
    }
    return index;
  })();
  const lastCoat = lastGoIndex >= 0 ? calls[lastGoIndex].label : null;

  if (first.call === "go") {
    const stopAt = calls.findIndex((row) => row.call === "stop");
    if (stopAt < 0 && lastGoIndex === calls.length - 1) {
      return {
        call: "go",
        headline: "Good to paint all day",
        detail: "No rain, cold, or damp in the forecast for today.",
        lastCoat,
        hours: calls,
      };
    }
    const stopRow = stopAt >= 0 ? calls[stopAt] : null;
    const rain = rainSoon(lastGoIndex + 1 < calls.length ? lastGoIndex + 1 : lastGoIndex);
    const until = stopRow ? stopRow.label : rain ? hourLabel(hourOf(rain.at)) : calls[calls.length - 1].label;
    const why = stopRow ? stopRow.problems[0] : rain ? `Rain ${Math.round(rain.precipPct)}%` : "";
    return {
      call: "go",
      headline: `Good to paint until ${until}`,
      detail: `${why ? `${why} at ${until}. ` : ""}Last coat on by ${lastCoat}.`,
      lastCoat,
      hours: calls,
    };
  }

  const nextGo = calls.find((row) => row.call === "go");
  if (first.call === "caution") {
    const rain = rainSoon(0);
    const at = rain ? hourLabel(hourOf(rain.at)) : "soon";
    return {
      call: "caution",
      headline: `Rain by ${at} — don’t start a coat`,
      detail: `Paint needs ${rules.dryHours} dry hours.${nextGo ? ` Next good start: ${nextGo.label}.` : " Do prep, caulk, or inside work."}`,
      lastCoat: null,
      hours: calls,
    };
  }
  return {
    call: "stop",
    headline: "Don’t paint outside now",
    detail: `${first.problems[0]}.${nextGo ? ` Good again at ${nextGo.label}.` : " Not a paint day — do prep or inside work."}`,
    lastCoat: null,
    hours: calls,
  };
}

/** Interior jobs don’t care about rain. */
export function isInteriorJob(name: string) {
  return /\binterior\b|\bcabinet|\bkitchen\b|\binside\b|\bbathroom|\bbedroom/i.test(name) && !/\bexterior\b/i.test(name);
}
