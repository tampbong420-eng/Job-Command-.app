import { createHash, createHmac, timingSafeEqual } from "crypto";

/**
 * Twilio X-Twilio-Signature check (same as twilio.validateRequest / validateRequestWithBody):
 * base64(HMAC-SHA1(authToken, fullUrl + every POST param name+value, sorted by name)).
 * JSON bodies: the URL carries bodySHA256 = hex SHA-256 of the raw body, and the URL alone is signed.
 */
export function twilioSignatureFor(authToken: string, url: string, params: Record<string, string> = {}) {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return createHmac("sha1", authToken).update(Buffer.from(data, "utf8")).digest("base64");
}

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Twilio signs the exact public URL it called. Behind a proxy that may differ from request.url, so try both. */
export function candidateUrls(requestUrl: string, publicOrigin?: string | null) {
  const urls = new Set<string>([requestUrl]);
  try {
    const parsed = new URL(requestUrl);
    if (publicOrigin) urls.add(`${publicOrigin.replace(/\/$/, "")}${parsed.pathname}${parsed.search}`);
    // Twilio drops the port for https URLs on 443 and keeps it otherwise.
    if (parsed.port) {
      const noPort = new URL(requestUrl);
      noPort.port = "";
      urls.add(noPort.toString());
    }
  } catch {
    /* keep request.url only */
  }
  return [...urls];
}

export function twilioRequestValid(input: {
  authToken: string;
  signature: string;
  urls: string[];
  rawBody: string;
  contentType: string;
}) {
  if (!input.authToken || !input.signature) return false;
  const json = input.contentType.includes("application/json");
  for (const url of input.urls) {
    if (json) {
      let bodyHash = "";
      try {
        bodyHash = new URL(url).searchParams.get("bodySHA256") || "";
      } catch {
        bodyHash = "";
      }
      if (!bodyHash) continue;
      const actual = createHash("sha256").update(input.rawBody).digest("hex");
      if (same(actual, bodyHash) && same(twilioSignatureFor(input.authToken, url), input.signature)) return true;
      continue;
    }
    const params = Object.fromEntries(new URLSearchParams(input.rawBody));
    if (same(twilioSignatureFor(input.authToken, url, params), input.signature)) return true;
  }
  return false;
}
