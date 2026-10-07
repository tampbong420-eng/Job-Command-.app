import { cookies } from "next/headers";
import type { Role, SessionDTO } from "@/lib/types";

export const SESSION_COOKIE = "jc_session";
const MAX_AGE = 15 * 60; // 15 minutes (Eric, 2026-10-03): kick everyone off after 15 min.
const encoder = new TextEncoder();

type Token = SessionDTO & { exp: number; v: 2 };

export function sessionSecret() {
  const set = process.env.SESSION_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  if (set) return set;
  // Go-public: a production sign-in must never be signed with a key that's printed in the source code (anyone could
  // forge an office login for any shop). Until SESSION_SECRET is set, use the private database URL as the key.
  const db = process.env.DATABASE_URL?.trim() || "";
  if (process.env.NODE_ENV === "production" && db && !db.startsWith("file:")) return `jc-session-fallback|${db}`;
  return "job-command-local-session-v1";
}

function bytesToB64url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlToBytes(value: string) {
  const pad = "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob(value.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function hmac(payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
  return bytesToB64url(signature);
}

export async function encodeSession(session: SessionDTO, now = Date.now()) {
  const token: Token = { ...session, v: 2, exp: now + MAX_AGE * 1000 };
  const payload = bytesToB64url(encoder.encode(JSON.stringify(token)));
  const signature = await hmac(payload);
  return `${payload}.${signature}`;
}

export async function decodeSession(value?: string | null, now = Date.now()): Promise<SessionDTO | null> {
  if (!value || !value.includes(".")) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = await hmac(payload);
  if (expected.length !== signature.length) return null;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  if (mismatch) return null;
  try {
    const json = JSON.parse(new TextDecoder().decode(b64urlToBytes(payload))) as Token;
    if (json.v !== 2 || typeof json.exp !== "number" || json.exp <= now) return null;
    if (json.role !== "ADMIN" && json.role !== "CREW") return null;
    if (!json.accountId || !json.name) return null;
    return {
      accountId: json.accountId,
      role: json.role as Role,
      name: json.name,
      employeeId: json.employeeId || null,
      // Multi-shop: older cookies have no shopId (they are all the first shop, "default").
      ...(typeof json.shopId === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(json.shopId) ? { shopId: json.shopId } : {}),
    };
  } catch {
    return null;
  }
}

export function cookieFromHeader(header?: string | null) {
  if (!header) return "";
  const parts = header.split(/;\s*/);
  const row = parts.find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return row ? decodeURIComponent(row.slice(SESSION_COOKIE.length + 1)) : "";
}

export async function sessionFromCookieHeader(header?: string | null) {
  return decodeSession(cookieFromHeader(header));
}

export function cookieSecureFlag(
  env: { NODE_ENV?: string; VERCEL?: string } = process.env
) {
  return env.NODE_ENV === "production" || env.VERCEL === "1";
}

export function sessionCookieOptions() {
  return {
    httpOnly: true as const,
    secure: cookieSecureFlag(),
    sameSite: "strict" as const,
    path: "/",
    maxAge: MAX_AGE,
  };
}

export async function getSession(): Promise<SessionDTO | null> {
  try {
    return decodeSession(cookies().get(SESSION_COOKIE)?.value);
  } catch {
    return null;
  }
}

export async function writeSessionCookie(session: SessionDTO) {
  cookies().set(SESSION_COOKIE, await encodeSession(session), sessionCookieOptions());
}

export function clearSessionCookie() {
  cookies().set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
}
