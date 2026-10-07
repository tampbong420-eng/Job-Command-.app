import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_SENSOR,
  LUX_BANDS,
  TWILIGHT_MS,
  resolveLook,
  sensorStep,
  shopSunSpot,
  sunLook,
  sunSpotFor,
  sunTimes,
  type SensorState,
  type SunSpot,
} from "./theme-auto";

/** Test fixture only: a real town with published sun tables. The app takes the spot from each shop's address. */
const HOT_SPRINGS_AR: SunSpot = { lat: 34.5037, lng: -93.0552, place: "Hot Springs, AR" };

const central = (date: Date) =>
  date.toLocaleString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit", hour12: false });
const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const near = (actual: Date, expected: string, tolerance = 5) =>
  assert.ok(
    Math.abs(minutes(central(actual)) - minutes(expected)) <= tolerance,
    `${central(actual)} should be within ${tolerance} min of ${expected}`
  );

test("sunrise and sunset in Hot Springs match the published tables", () => {
  // timeanddate.com, Hot Springs AR: Oct 2 2026 7:07 / 18:54 CDT; Jun 21 ~6:01 / 20:27 CDT; Dec 21 ~7:15 / 17:06 CST.
  const cases: [string, string, string][] = [
    ["2026-10-02T12:00:00-05:00", "7:07", "18:54"],
    ["2026-06-21T12:00:00-05:00", "6:01", "20:27"],
    ["2026-12-21T12:00:00-06:00", "7:15", "17:06"],
  ];
  for (const [day, rise, set] of cases) {
    const times = sunTimes(new Date(day), HOT_SPRINGS_AR.lat, HOT_SPRINGS_AR.lng);
    assert.equal(times.kind, "normal", day);
    if (times.kind !== "normal") continue;
    near(times.sunrise, rise);
    near(times.sunset, set);
  }
});

test("polar day and polar night have no sunrise", () => {
  assert.equal(sunTimes(new Date("2026-06-21T12:00:00Z"), 78.2, 15.6).kind, "polar-day");
  assert.equal(sunTimes(new Date("2026-12-21T12:00:00Z"), 78.2, 15.6).kind, "polar-night");
  assert.equal(sunLook(new Date("2026-06-21T03:00:00Z"), { lat: 78.2, lng: 15.6, place: "x" }), "light");
  assert.equal(sunLook(new Date("2026-12-21T12:00:00Z"), { lat: 78.2, lng: 15.6, place: "x" }), "ink");
});

test("sun look: Light by day, Lime Industrial at night, phone setting only near dawn and dusk", () => {
  const noon = new Date("2026-10-02T12:00:00-05:00");
  const midnight = new Date("2026-10-02T23:30:00-05:00");
  assert.equal(sunLook(noon, HOT_SPRINGS_AR), "light");
  assert.equal(sunLook(midnight, HOT_SPRINGS_AR), "ink");
  // Broad daylight / dead of night: the phone's dark-mode setting doesn't override the sun.
  assert.equal(sunLook(noon, HOT_SPRINGS_AR, "dark"), "light");
  assert.equal(sunLook(midnight, HOT_SPRINGS_AR, "light"), "ink");
  // Ten minutes after sunset: the phone setting breaks the tie either way.
  const times = sunTimes(noon, HOT_SPRINGS_AR.lat, HOT_SPRINGS_AR.lng);
  assert.equal(times.kind, "normal");
  if (times.kind !== "normal") return;
  const dusk = new Date(times.sunset.valueOf() + 10 * 60_000);
  assert.equal(sunLook(dusk, HOT_SPRINGS_AR), "ink");
  assert.equal(sunLook(dusk, HOT_SPRINGS_AR, "light"), "light");
  assert.equal(sunLook(dusk, HOT_SPRINGS_AR, "dark"), "ink");
  const pastDusk = new Date(times.sunset.valueOf() + TWILIGHT_MS + 60_000);
  assert.equal(sunLook(pastDusk, HOT_SPRINGS_AR, "light"), "ink");
});

test("where the sun is computed: shop, then phone time zone, then UTC offset", () => {
  // No address and no override: no shop spot (no hard-coded town), so the phone's zone decides.
  assert.equal(shopSunSpot({}), null);
  assert.equal(shopSunSpot({ address: "" }), null);
  assert.equal(shopSunSpot({ address: "12 Texas Ave" }), null);
  // The spot comes from each shop's own address.
  const tulsa = shopSunSpot({ address: "118 Main St, Tulsa, OK 74103" });
  assert.equal(tulsa?.place, "Tulsa, OK");
  assert.ok(tulsa && Math.abs(tulsa.lng - -96.8) < 0.01);
  const ar = shopSunSpot({ address: "Hot Springs, AR" });
  assert.equal(ar?.place, "Hot Springs, AR");
  assert.equal(shopSunSpot({ address: "Fresno, CA 93721" })?.lng, -119.4);
  assert.equal(shopSunSpot({ address: "97201" })?.place, "Oregon");
  assert.deepEqual(shopSunSpot({ lat: "40.1", lng: "-75.2" }), { lat: 40.1, lng: -75.2, place: "Shop" });
  assert.deepEqual(sunSpotFor({ shop: HOT_SPRINGS_AR, deviceTimeZone: "America/Denver" }), HOT_SPRINGS_AR);
  assert.equal(sunSpotFor({ shop: null, deviceTimeZone: "America/Denver" }).lng, -105);
  const guess = sunSpotFor({ shop: null, deviceTimeZone: "Mars/Olympus", offsetMinutes: 300 });
  assert.equal(guess.lng, -75);
});

test("lux hysteresis: thresholds, dead band, and a few seconds of debounce", () => {
  const t0 = 1_000_000;
  let s: SensorState = sensorStep(EMPTY_SENSOR, 50, t0, LUX_BANDS);
  assert.equal(s.look, "ink", "first dark reading lands at once");
  s = sensorStep(s, 600, t0 + 1000, LUX_BANDS);
  assert.equal(s.look, "ink", "dead band keeps the current look");
  s = sensorStep(s, 5000, t0 + 2000, LUX_BANDS);
  assert.equal(s.look, "ink", "bright, but not for long enough yet");
  assert.equal(s.pending, "light");
  s = sensorStep(s, 5000, t0 + 2000 + LUX_BANDS.debounceMs - 1, LUX_BANDS);
  assert.equal(s.look, "ink");
  s = sensorStep(s, 5000, t0 + 2000 + LUX_BANDS.debounceMs, LUX_BANDS);
  assert.equal(s.look, "light", "held bright past the debounce");
  // A passing shadow (dip under 200 for a second) does not flip back.
  s = sensorStep(s, 120, t0 + 10_000, LUX_BANDS);
  s = sensorStep(s, 900, t0 + 11_000, LUX_BANDS);
  s = sensorStep(s, 900, t0 + 20_000, LUX_BANDS);
  assert.equal(s.look, "light");
  assert.equal(s.pending, null);
  // Dead-band first reading uses the midpoint.
  assert.equal(sensorStep(EMPTY_SENSOR, 700, t0, LUX_BANDS).look, "light");
  assert.equal(sensorStep(EMPTY_SENSOR, 500, t0, LUX_BANDS).look, "ink");
  assert.deepEqual(sensorStep(s, Number.NaN, t0, LUX_BANDS), s);
});

test("a hand-picked look always beats Auto's signals", () => {
  assert.equal(resolveLook({ choice: "ink", sensor: "light", brightness: "light", sun: "light" }), "ink");
  assert.equal(resolveLook({ choice: "light", sensor: "ink", brightness: "ink", sun: "ink" }), "light");
  assert.equal(resolveLook({ choice: "auto", sensor: "light", brightness: "ink", sun: "ink" }), "light");
  assert.equal(resolveLook({ choice: "auto", sensor: null, brightness: "ink", sun: "light" }), "ink");
  assert.equal(resolveLook({ choice: "auto", sun: "light" }), "light");
  assert.equal(resolveLook({ choice: "auto" }), "ink");
});

test("a state-level spot keeps sunrise within ~10 minutes of the town (Hot Springs vs Arkansas center)", () => {
  const ar = shopSunSpot({ address: "Hot Springs, AR" });
  assert.ok(ar);
  const day = new Date("2026-10-02T12:00:00-05:00");
  const town = sunTimes(day, HOT_SPRINGS_AR.lat, HOT_SPRINGS_AR.lng);
  const state = sunTimes(day, ar!.lat, ar!.lng);
  assert.ok(town.kind === "normal" && state.kind === "normal");
  if (town.kind !== "normal" || state.kind !== "normal") return;
  assert.ok(Math.abs(town.sunrise.valueOf() - state.sunrise.valueOf()) < 10 * 60_000);
  assert.ok(Math.abs(town.sunset.valueOf() - state.sunset.valueOf()) < 10 * 60_000);
});
