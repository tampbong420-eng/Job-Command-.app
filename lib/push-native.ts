import "server-only";

import { connect } from "node:http2";
import { prisma } from "@/lib/prisma";
import { apnsConfigFrom, apnsJwt, apnsPayload, parseNativeEndpoint, type ApnsConfig } from "@/lib/push-native-core";

let jwtCache: { token: string; at: number } | null = null;

function providerToken(cfg: ApnsConfig) {
  const now = Math.floor(Date.now() / 1000);
  // Apple wants the same token reused for 20–60 minutes.
  if (jwtCache && now - jwtCache.at < 40 * 60) return jwtCache.token;
  jwtCache = { token: apnsJwt(cfg, now), at: now };
  return jwtCache.token;
}

function postApns(cfg: ApnsConfig, token: string, payload: unknown): Promise<{ status: number; reason: string }> {
  return new Promise((resolve) => {
    const client = connect(`https://${cfg.host}`);
    const done = (status: number, reason: string) => {
      client.close();
      resolve({ status, reason });
    };
    client.on("error", (e) => done(0, e.message));
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${providerToken(cfg)}`,
      "apns-topic": cfg.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });
    let status = 0;
    let body = "";
    req.setTimeout(10_000, () => {
      req.close();
      done(0, "timeout");
    });
    req.on("response", (headers) => {
      status = Number(headers[":status"] || 0);
    });
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      let reason = "";
      try {
        reason = body ? String(JSON.parse(body).reason || "") : "";
      } catch {
        reason = body.slice(0, 80);
      }
      done(status, reason);
    });
    req.on("error", (e) => done(0, e.message));
    req.end(JSON.stringify(payload));
  });
}

/**
 * Push to the iPhone app. Without Eric's APNs key in env this sends nothing and says so (mock).
 * Untested against Apple from this box (no key); see native/ios/MAC-BUILD.md.
 */
export async function sendNativePush(
  devices: Array<{ id: string; endpoint: string }>,
  input: { title: string; body: string; href: string; tag?: string }
) {
  const native = devices.map((d) => ({ ...d, parsed: parseNativeEndpoint(d.endpoint) })).filter((d) => d.parsed);
  if (!native.length) return { sent: 0, mock: false, reason: "no native devices" };
  const cfg = apnsConfigFrom(process.env);
  if (!cfg) return { sent: 0, mock: true, reason: "APNs key not set (APNS_KEY_ID / APNS_TEAM_ID / APNS_PRIVATE_KEY)" };
  const payload = apnsPayload(input);
  let sent = 0;
  for (const device of native) {
    if (device.parsed!.platform !== "ios") continue; // Android (FCM) is not wired yet.
    const res = await postApns(cfg, device.parsed!.token, payload);
    if (res.status === 200) sent += 1;
    else if (res.status === 410 || (res.status === 400 && /BadDeviceToken|DeviceTokenNotForTopic/.test(res.reason))) {
      await prisma.pushDevice.delete({ where: { id: device.id } }).catch(() => undefined);
    }
  }
  return { sent, mock: false, reason: "" };
}
