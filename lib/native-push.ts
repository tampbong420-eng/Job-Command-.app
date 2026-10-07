import { PushNotifications } from "@capacitor/push-notifications";
import { hasNativePlugin, nativePlatform } from "@/lib/native-app";
import { safeTapPath } from "@/lib/push-tap";

/** iPhone app: ask, register with APNs, and hand the device token to the server. */
export async function enableNativePush(): Promise<{ ok: boolean; message: string }> {
  if (!hasNativePlugin("PushNotifications")) {
    return { ok: false, message: "This app build has no push yet. Alerts still land in the drawer." };
  }
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") perm = await PushNotifications.requestPermissions();
  if (perm.receive !== "granted") {
    return { ok: false, message: "Notifications are off. Turn them on in iPhone Settings › Job Command." };
  }
  const token = await new Promise<string>((resolve, reject) => {
    let settled = false;
    const handles: Array<Promise<{ remove: () => Promise<void> }>> = [];
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      for (const h of handles) void h.then((x) => x.remove()).catch(() => undefined);
      fn();
    };
    handles.push(PushNotifications.addListener("registration", (t) => finish(() => resolve(t.value))));
    handles.push(PushNotifications.addListener("registrationError", (e) => finish(() => reject(new Error(e.error || "Push sign-up failed.")))));
    setTimeout(() => finish(() => reject(new Error("Push sign-up timed out. Try again."))), 20_000);
    void PushNotifications.register().catch((e) => finish(() => reject(e instanceof Error ? e : new Error("Push sign-up failed."))));
  });
  const res = await fetch("/api/push/native", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, platform: nativePlatform() }),
  });
  if (!res.ok) return { ok: false, message: "Could not save this phone for alerts." };
  return { ok: true, message: "This phone will get dispatch and signed bids." };
}

/** Tapping a notification opens the page it points to (same site only). Returns an unsubscribe. */
export function onNativePushTap(open: (path: string) => void): () => void {
  if (!hasNativePlugin("PushNotifications")) return () => undefined;
  const handle = PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    open(safeTapPath((action.notification?.data as { href?: string } | undefined)?.href));
  });
  return () => void handle.then((h) => h.remove()).catch(() => undefined);
}
