import { createHmac, timingSafeEqual } from "crypto";

/**
 * Resend webhooks are signed with Svix: headers svix-id, svix-timestamp, svix-signature ("v1,<base64>" ...),
 * signature = base64(HMAC-SHA256(base64-decoded secret after "whsec_", `${id}.${timestamp}.${rawBody}`)).
 */
export function svixSignatureValid(input: {
  secret: string;
  id: string;
  timestamp: string;
  signature: string;
  rawBody: string;
  nowSec?: number;
  toleranceSec?: number;
}) {
  if (!input.secret || !input.id || !input.timestamp || !input.signature) return false;
  const now = input.nowSec ?? Math.floor(Date.now() / 1000);
  if (!/^\d+$/.test(input.timestamp) || Math.abs(now - Number(input.timestamp)) > (input.toleranceSec ?? 300)) return false;
  const key = Buffer.from(input.secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${input.id}.${input.timestamp}.${input.rawBody}`).digest();
  return input.signature.split(" ").some((part) => {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) return false;
    try {
      const given = Buffer.from(value, "base64");
      return given.length === expected.length && timingSafeEqual(given, expected);
    } catch {
      return false;
    }
  });
}
