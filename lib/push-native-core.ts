/**
 * Native (iPhone app) push tokens. Stored in the existing PushDevice table so no DB
 * migration is needed: endpoint = "native:<platform>:<token>", p256dh = "native",
 * auth = platform. The web-push sender skips these rows; the APNs sender uses them.
 */
import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import { safeTapPath } from "@/lib/push-tap";

export { safeTapPath };

export type NativePlatform = "ios" | "android";
export const NATIVE_PREFIX = "native:";

export function nativeEndpoint(platform: NativePlatform, token: string) {
  return `${NATIVE_PREFIX}${platform}:${token}`;
}

export function parseNativeEndpoint(endpoint: string): { platform: NativePlatform; token: string } | null {
  const m = /^native:(ios|android):(.+)$/.exec(endpoint || "");
  return m ? { platform: m[1] as NativePlatform, token: m[2] } : null;
}

export function isNativeEndpoint(endpoint: string) {
  return parseNativeEndpoint(endpoint) !== null;
}

/** APNs device tokens are hex (64 chars today). FCM tokens are long URL-safe strings. */
export function cleanNativeToken(platform: unknown, token: unknown): { platform: NativePlatform; token: string } | null {
  const p = platform === "ios" || platform === "android" ? platform : null;
  const t = String(token || "").trim();
  if (!p || !t) return null;
  if (p === "ios") return /^[0-9a-fA-F]{32,200}$/.test(t) ? { platform: p, token: t.toLowerCase() } : null;
  return /^[A-Za-z0-9_:\-.]{20,4096}$/.test(t) ? { platform: p, token: t } : null;
}

export type ApnsConfig = {
  keyId: string;
  teamId: string;
  privateKey: string;
  bundleId: string;
  host: string;
};

/**
 * Needs Eric's Apple key (Apple Developer › Keys › APNs, a .p8 file). Not configured = no sends.
 * APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY (the .p8 text, \n allowed) or APNS_PRIVATE_KEY_BASE64,
 * APNS_BUNDLE_ID (default app.jobcommand.shop), APNS_ENV=development for Xcode/TestFlight-dev builds.
 */
export function apnsConfigFrom(env: Record<string, string | undefined>): ApnsConfig | null {
  const keyId = (env.APNS_KEY_ID || "").trim();
  const teamId = (env.APNS_TEAM_ID || "").trim();
  let privateKey = (env.APNS_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
  if (!privateKey && env.APNS_PRIVATE_KEY_BASE64) {
    privateKey = Buffer.from(env.APNS_PRIVATE_KEY_BASE64.trim(), "base64").toString("utf8").trim();
  }
  if (!keyId || !teamId || !privateKey.includes("PRIVATE KEY")) return null;
  const bundleId = (env.APNS_BUNDLE_ID || "app.jobcommand.shop").trim();
  const host = (env.APNS_ENV || "").trim() === "development" ? "api.sandbox.push.apple.com" : "api.push.apple.com";
  return { keyId, teamId, privateKey, bundleId, host };
}

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

/** Provider token for APNs: ES256 JWT { iss: team, iat }, header { alg, kid }. Valid up to an hour. */
export function apnsJwt(cfg: Pick<ApnsConfig, "keyId" | "teamId" | "privateKey">, nowSec = Math.floor(Date.now() / 1000)) {
  const head = b64url(JSON.stringify({ alg: "ES256", kid: cfg.keyId }));
  const body = b64url(JSON.stringify({ iss: cfg.teamId, iat: nowSec }));
  const key: KeyObject = createPrivateKey(cfg.privateKey);
  const sig = sign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${b64url(sig)}`;
}


export function apnsPayload(input: { title: string; body: string; href: string; tag?: string }) {
  return {
    aps: {
      alert: { title: input.title.slice(0, 120), body: input.body.slice(0, 400) },
      sound: "default",
      ...(input.tag ? { "thread-id": input.tag } : {}),
    },
    href: safeTapPath(input.href),
  };
}
