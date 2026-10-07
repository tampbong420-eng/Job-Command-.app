import "server-only";

import { retellApiKey } from "@/lib/answering/signature";
import { FALLBACK_VOICE_IDS, type PhoneVoice } from "@/lib/answering/config";

/**
 * Thin wrapper over Retell's documented REST API (https://docs.retellai.com/api-references).
 * Mock mode: with no RETELL_API_KEY every call returns { ok: false, notConnected: true } — it never pretends a
 * call went through, never invents ids, and the screens say "Not connected yet".
 */
export const RETELL_API_BASE = process.env.RETELL_API_BASE?.trim() || "https://api.retellai.com";

export type RetellResult<T> =
  | { ok: true; data: T }
  | { ok: false; notConnected: true; error: string }
  | { ok: false; notConnected: false; status: number; error: string };

export function retellConnected() {
  return Boolean(retellApiKey());
}

export function retellStatus() {
  return retellConnected()
    ? { connected: true as const, label: "Retell key is set" }
    : { connected: false as const, label: "Not connected yet. Add your Retell API key to finish setup." };
}

async function call<T>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<RetellResult<T>> {
  const key = retellApiKey();
  if (!key) return { ok: false, notConnected: true, error: "Not connected yet: RETELL_API_KEY is not set." };
  try {
    const response = await fetch(`${RETELL_API_BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const text = await response.text();
    const data = text ? (JSON.parse(text) as T) : ({} as T);
    if (!response.ok) {
      const message = (data as { message?: string; error_message?: string })?.message || (data as { error_message?: string })?.error_message || text.slice(0, 200);
      return { ok: false, notConnected: false, status: response.status, error: `Retell ${response.status}: ${message}` };
    }
    return { ok: true, data };
  } catch (error) {
    return { ok: false, notConnected: false, status: 0, error: `Retell unreachable: ${(error as Error).message}` };
  }
}

export type RetellVoice = { voice_id: string; voice_name?: string; provider?: string; gender?: string };
export type RetellPhoneNumber = { phone_number: string; phone_number_pretty?: string; nickname?: string; area_code?: number; inbound_agents?: Array<{ agent_id: string }> | null; inbound_webhook_url?: string | null };

export const retell = {
  createLlm: (body: unknown) => call<{ llm_id: string; version?: number }>("POST", "/create-retell-llm", body),
  updateLlm: (llmId: string, body: unknown) => call<{ llm_id: string }>("PATCH", `/update-retell-llm/${encodeURIComponent(llmId)}`, body),
  createAgent: (body: unknown) => call<{ agent_id: string; version?: number }>("POST", "/create-agent", body),
  updateAgent: (agentId: string, body: unknown) => call<{ agent_id: string; version?: number }>("PATCH", `/update-agent/${encodeURIComponent(agentId)}`, body),
  publishAgent: (agentId: string, version: number) => call<unknown>("POST", `/publish-agent-version/${encodeURIComponent(agentId)}`, { version }),
  listVoices: () => call<RetellVoice[]>("GET", "/list-voices"),
  listPhoneNumbers: () => call<{ items: RetellPhoneNumber[] } | RetellPhoneNumber[]>("GET", "/v2/list-phone-numbers?limit=100"),
  updatePhoneNumber: (number: string, body: unknown) => call<RetellPhoneNumber>("PATCH", `/update-phone-number/${encodeURIComponent(number)}`, body),
  getCall: (callId: string) => call<Record<string, unknown>>("GET", `/v2/get-call/${encodeURIComponent(callId)}`),
};

export function phoneNumbersFrom(data: { items: RetellPhoneNumber[] } | RetellPhoneNumber[]) {
  return Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
}

/** Voice for the phone agent: env override → first ElevenLabs voice of that gender in Retell's list → fallback id. */
export function pickVoiceId(voice: PhoneVoice, voices: RetellVoice[] = []) {
  const env = voice === "female" ? process.env.RETELL_VOICE_FEMALE?.trim() : process.env.RETELL_VOICE_MALE?.trim();
  if (env) return env;
  const match =
    voices.find((v) => v.gender === voice && /eleven/i.test(v.provider || "")) || voices.find((v) => v.gender === voice);
  return match?.voice_id || FALLBACK_VOICE_IDS[voice] || FALLBACK_VOICE_IDS.male;
}
