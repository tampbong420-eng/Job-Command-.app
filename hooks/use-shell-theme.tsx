"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import {
  DEFAULT_SHELL_LOOK,
  DEFAULT_SHELL_THEME,
  parseShellTheme,
  persistShellTheme,
  readStoredShellTheme,
  type ShellLookId,
  type ShellThemeId,
} from "@/lib/shell-theme";
import {
  EMPTY_SHELL_INK,
  parseShellInk,
  persistShellInk,
  readStoredShellInk,
  type ShellInk,
} from "@/lib/shell-ink";
import { useShopPlace } from "@/components/command/ShopPlace";
import {
  AUTO_RECHECK_MS,
  BRIGHTNESS_BANDS,
  EMPTY_SENSOR,
  LUX_BANDS,
  resolveLook,
  sensorStep,
  shopSunSpot,
  sunLook,
  sunSpotFor,
  type Scheme,
  type SensorState,
  type SunSpot,
} from "@/lib/theme-auto";

const ShellThemeContext = createContext<{
  /** What the shop picked: auto, ink (Lime Industrial), or light. */
  id: ShellThemeId;
  setId: (id: ShellThemeId) => void;
  /** What is painted right now. Same as id unless id is "auto". */
  look: ShellLookId;
  ink: ShellInk;
  setInk: (ink: ShellInk) => void;
} | null>(null);

/** NEXT_PUBLIC_SHOP_LAT / _LNG pin the spot for a deployment; otherwise it is the shop's own address. */
const ENV_SPOT = shopSunSpot({
  lat: process.env.NEXT_PUBLIC_SHOP_LAT,
  lng: process.env.NEXT_PUBLIC_SHOP_LNG,
});

/** The shop's sun spot: env override, else the rough spot from its address (root layout), else none. */
function useShopSpot(): SunSpot | null {
  const shop = useShopPlace();
  return useMemo(() => {
    if (ENV_SPOT) return ENV_SPOT;
    if (shop.lat == null || shop.lng == null) return null;
    return { lat: shop.lat, lng: shop.lng, place: shop.place || "Shop" };
  }, [shop.lat, shop.lng, shop.place]);
}

/**
 * First paint for Auto. Uses only the shop's sunrise/sunset, which is the same on the server and the
 * phone, so the server HTML already has the right look (no flash). The phone refines it after mount.
 */
function firstAutoLook(spot: SunSpot | null): ShellLookId {
  if (lastAutoLook) return lastAutoLook;
  return spot ? sunLook(new Date(), spot) : DEFAULT_SHELL_LOOK;
}

/** Last look Auto settled on in this tab, so moving between screens keeps it instead of re-guessing. */
let lastAutoLook: ShellLookId | null = null;

function readScheme(): Scheme {
  if (typeof window === "undefined" || !window.matchMedia) return null;
  if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
  if (window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
  return null;
}

type LightSensor = EventTarget & { illuminance?: number | null; start: () => void; stop: () => void };
type BrightnessPlugin = { getBrightness: () => Promise<number | { brightness?: number }> };

/** Live Auto look: sensor, then screen brightness, then sun + phone setting. Idle unless choice is "auto". */
function useAutoLook(active: boolean): ShellLookId {
  const shopSpot = useShopSpot();
  const [look, setLook] = useState<ShellLookId>(() => firstAutoLook(shopSpot));
  const lookRef = useRef(look);
  lookRef.current = look;

  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    let stopped = false;
    let lux: SensorState = EMPTY_SENSOR;
    let bright: SensorState = EMPTY_SENSOR;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (fn: () => void, ms: number) => {
      const t = setTimeout(() => {
        timers.delete(t);
        if (!stopped) fn();
      }, ms);
      timers.add(t);
    };
    const spot = sunSpotFor({
      shop: shopSpot,
      deviceTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      offsetMinutes: new Date().getTimezoneOffset(),
    });

    const apply = (next: ShellLookId) => {
      lastAutoLook = next;
      if (next === lookRef.current) return;
      lookRef.current = next;
      const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
      const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (doc.startViewTransition && !calm && document.visibilityState === "visible") {
        // Cross-fade between the two looks instead of a hard cut.
        doc.startViewTransition(() => flushSync(() => setLook(next)));
      } else {
        setLook(next);
      }
    };

    const check = () => {
      if (stopped) return;
      apply(
        resolveLook({
          choice: "auto",
          sensor: lux.look,
          brightness: bright.look,
          sun: sunLook(new Date(), spot, readScheme()),
        })
      );
    };

    // 1. Ambient light sensor (Chrome/Android with the Generic Sensor API; not in Safari or iOS).
    let sensor: LightSensor | null = null;
    let lastLux = NaN;
    const SensorCtor = (window as unknown as { AmbientLightSensor?: new (opts: { frequency: number }) => LightSensor })
      .AmbientLightSensor;
    const takeLux = (value: number) => {
      lux = sensorStep(lux, value, Date.now(), LUX_BANDS);
      check();
      // A steady reading after a jump doesn't fire again, so confirm the change once the debounce is over.
      if (lux.pending) later(() => takeLux(lastLux), LUX_BANDS.debounceMs + 100);
    };
    if (SensorCtor) {
      try {
        sensor = new SensorCtor({ frequency: 1 });
        sensor.addEventListener("reading", () => {
          lastLux = Number(sensor?.illuminance);
          takeLux(lastLux);
        });
        sensor.addEventListener("error", () => {
          lux = EMPTY_SENSOR;
          check();
        });
        sensor.start();
      } catch {
        sensor = null;
      }
    }

    // 2. Screen brightness, only if the native app ships a ScreenBrightness plugin (none installed today).
    const plugin = (window as unknown as { Capacitor?: { Plugins?: { ScreenBrightness?: BrightnessPlugin } } }).Capacitor
      ?.Plugins?.ScreenBrightness;
    const readBrightness = async () => {
      if (!plugin?.getBrightness) return;
      try {
        const raw = await plugin.getBrightness();
        const value = typeof raw === "number" ? raw : Number(raw?.brightness);
        bright = sensorStep(bright, value, Date.now(), BRIGHTNESS_BANDS);
        check();
        if (bright.pending) later(() => void readBrightness(), BRIGHTNESS_BANDS.debounceMs + 100);
      } catch {
        /* plugin present but unusable: fall through to the sun */
      }
    };

    const recheck = () => {
      check();
      void readBrightness();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") recheck();
    };
    const dark = window.matchMedia?.("(prefers-color-scheme: dark)");
    recheck();
    const every = setInterval(recheck, AUTO_RECHECK_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", recheck);
    window.addEventListener("pageshow", recheck);
    dark?.addEventListener?.("change", recheck);
    return () => {
      stopped = true;
      clearInterval(every);
      timers.forEach((t) => clearTimeout(t));
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", recheck);
      window.removeEventListener("pageshow", recheck);
      dark?.removeEventListener?.("change", recheck);
      try {
        sensor?.stop();
      } catch {
        /* already stopped */
      }
    };
  }, [active, shopSpot]);

  return look;
}

export function ShellThemeProvider({
  initial,
  initialInk,
  children,
}: {
  initial?: string | null;
  initialInk?: string | null;
  children: ReactNode;
}) {
  const [id, setTheme] = useState<ShellThemeId>(() =>
    parseShellTheme(initial || (typeof window !== "undefined" ? readStoredShellTheme() : null) || DEFAULT_SHELL_THEME)
  );
  const [ink, setInkState] = useState<ShellInk>(() =>
    initialInk != null ? parseShellInk(initialInk) : readStoredShellInk()
  );
  const autoLook = useAutoLook(id === "auto");
  const look: ShellLookId = id === "auto" ? autoLook : id;

  useEffect(() => {
    persistShellTheme(id);
  }, [id]);

  useEffect(() => {
    persistShellInk(ink);
  }, [ink]);

  // Eric 2026-10-07: Do NOT overwrite user-selected theme when initial changes.
  // The initial prop is for first render only; user selections persist via localStorage.

  const setId = useCallback((next: ShellThemeId) => {
    setTheme(parseShellTheme(next));
  }, []);

  const setInk = useCallback((next: ShellInk) => {
    setInkState(parseShellInk(`${next.dark},${next.light}`));
  }, []);

  const value = useMemo(() => ({ id, setId, look, ink, setInk }), [id, setId, look, ink, setInk]);
  return <ShellThemeContext.Provider value={value}>{children}</ShellThemeContext.Provider>;
}

export function useShellTheme() {
  const ctx = useContext(ShellThemeContext);
  if (!ctx) {
    return {
      id: DEFAULT_SHELL_THEME,
      setId: (_id: ShellThemeId) => undefined,
      look: DEFAULT_SHELL_LOOK,
      ink: EMPTY_SHELL_INK,
      setInk: (_ink: ShellInk) => undefined,
    };
  }
  return ctx;
}
