import assert from "node:assert/strict";
import test from "node:test";
import { parseOpenMeteo, pickHourly, weatherLabel } from "./weather";

test("WMO codes read like a job-site forecast", () => {
  assert.equal(weatherLabel(0), "Clear");
  assert.equal(weatherLabel(61), "Rain");
  assert.equal(weatherLabel(95), "Thunder");
});

test("hourly strip starts at the current hour and keeps twelve slots", () => {
  const times = [
    "2026-09-18T14:00",
    "2026-09-18T15:00",
    "2026-09-18T16:00",
    "2026-09-18T17:00",
  ];
  const hours = pickHourly(times, [70, 72, 74, 71], [10, 20, 40, 15], [6, 8, 9, 7], [0, 1, 61, 2], "2026-09-18T15:10", 3);
  assert.equal(hours.length, 3);
  assert.equal(hours[0].tempF, 72);
  assert.equal(hours[1].label, "Rain");
});

test("Open-Meteo payload becomes current plus hourly", () => {
  const parsed = parseOpenMeteo("3510 Albert Pike Rd", { lat: 34.5, lng: -93.05 }, {
    current: {
      time: "2026-09-18T15:00",
      temperature_2m: 81.4,
      apparent_temperature: 84,
      weather_code: 2,
      wind_speed_10m: 7.2,
      relative_humidity_2m: 48,
      precipitation: 0,
    },
    hourly: {
      time: ["2026-09-18T15:00", "2026-09-18T16:00"],
      temperature_2m: [81, 79],
      precipitation_probability: [5, 20],
      weather_code: [2, 61],
      wind_speed_10m: [7, 9],
    },
  });
  assert.equal(parsed?.current?.tempF, 81);
  assert.equal(parsed?.current?.label, "Partly cloudy");
  assert.equal(parsed?.hourly.length, 2);
  assert.equal(parsed?.hourly[1].label, "Rain");
});

test("Open-Meteo local times get the site's own offset (any shop, any zone)", async () => {
  const { withUtcOffset, parseOpenMeteo } = await import("./weather");
  assert.equal(withUtcOffset("2026-10-02T14:00", -18000), "2026-10-02T14:00:00-05:00");
  assert.equal(withUtcOffset("2026-10-02T14:00", -25200), "2026-10-02T14:00:00-07:00");
  assert.equal(withUtcOffset("2026-10-02T14:00Z", -18000), "2026-10-02T14:00Z");
  assert.equal(withUtcOffset("2026-10-02T14:00", undefined), "2026-10-02T14:00");
  const parsed = parseOpenMeteo("Fresno, CA", { lat: 36.7, lng: -119.8 }, {
    timezone: "America/Los_Angeles",
    utc_offset_seconds: -25200,
    current: { time: "2026-10-02T14:00", temperature_2m: 88, weather_code: 0 },
    hourly: { time: ["2026-10-02T14:00", "2026-10-02T15:00"], temperature_2m: [88, 89], precipitation_probability: [0, 0], weather_code: [0, 0], wind_speed_10m: [3, 4] },
  });
  assert.equal(parsed?.hourly[0].hour, "2 PM");
  assert.equal(parsed?.hourly[1].hour, "3 PM");
});
