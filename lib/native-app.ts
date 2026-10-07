import { Capacitor } from "@capacitor/core";

/**
 * True only inside the iPhone/Android app shell (Capacitor). The website and the
 * phone browser are "web" and keep their web paths (Web Speech, web push).
 */
export function isNativeApp() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function nativePlatform(): "ios" | "android" | "web" {
  try {
    const p = Capacitor.getPlatform();
    return p === "ios" || p === "android" ? p : "web";
  } catch {
    return "web";
  }
}

/** The native side has this plugin compiled in (it was installed before `npx cap sync`). */
export function hasNativePlugin(name: string) {
  try {
    return isNativeApp() && Capacitor.isPluginAvailable(name);
  } catch {
    return false;
  }
}
