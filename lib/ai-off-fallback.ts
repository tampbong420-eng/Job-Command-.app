/**
 * What an AI route answers when the phone said "Not now" — computed on the phone, nothing leaves it.
 * Shapes match each route's own no-AI-key branch, so callers need no changes.
 */
import { parseLeadTalk } from "@/lib/lead-parse";
import { parseDocumentTalk } from "@/lib/document-parse";
import { parseSiteTalk } from "@/lib/site-talk";
import type { AiKind } from "@/lib/ai-consent";

async function bodyText(body: BodyInit | null | undefined): Promise<Record<string, unknown>> {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    const out: Record<string, unknown> = {};
    body.forEach((value, key) => {
      if (typeof value === "string") out[key] = value;
    });
    return out;
  }
  return {};
}

export async function aiOffAnswer(kind: AiKind, path: string, body: BodyInit | null | undefined) {
  const data = await bodyText(body);
  if (kind === "photos") return { skipped: true, aiOff: true };
  if (kind === "setup") return {};
  if (kind === "voice") return { ...parseSiteTalk(String(data.transcript || "")), aiOff: true };
  if (path.startsWith("/api/leads/parse")) return parseLeadTalk(String(data.text || ""));
  // /api/docs/parse
  return { ...parseDocumentTalk(String(data.text || "")), market: null, aiOff: true };
}
