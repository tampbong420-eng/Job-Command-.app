import "server-only";

import { verify } from "retell-sdk";

/**
 * Retell signs every webhook and custom-function request with the X-Retell-Signature header
 * (v=<ms timestamp>,d=<HMAC-SHA256 hex of raw body + timestamp>, keyed with the Retell API key that has the
 * webhook badge). We check it with Retell's own SDK (retell-sdk `verify`), on the exact raw body, before
 * reading anything. No key set = not connected = every request is refused (never trusted unsigned).
 */
export const RETELL_SIGNATURE_HEADER = "x-retell-signature";

export function retellApiKey() {
  return process.env.RETELL_API_KEY?.trim() || "";
}

export type SignatureCheck = { ok: true } | { ok: false; status: 401 | 503; reason: string };

export async function checkRetellSignature(rawBody: string, signature: string | null): Promise<SignatureCheck> {
  const key = retellApiKey();
  if (!key) return { ok: false, status: 503, reason: "AI answering is not connected yet (no RETELL_API_KEY)." };
  if (!signature) return { ok: false, status: 401, reason: "Missing X-Retell-Signature." };
  try {
    const valid = await verify(rawBody, key, signature);
    return valid ? { ok: true } : { ok: false, status: 401, reason: "Bad signature." };
  } catch {
    return { ok: false, status: 401, reason: "Bad signature." };
  }
}
