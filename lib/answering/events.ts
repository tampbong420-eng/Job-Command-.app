/**
 * Read Retell webhook payloads (call_started / call_ended / call_analyzed, call_inbound, custom function
 * calls) into plain values. Pure, defensive: anything missing becomes "" / 0 / null, never a crash.
 * Payload shapes: https://docs.retellai.com/features/webhook-overview and /features/inbound-call-webhook.
 */
import { callSeconds } from "@/lib/answering/metering";

export type TranscriptTurn = { role: "agent" | "user"; text: string };

type Json = Record<string, unknown>;

const obj = (value: unknown): Json => (value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {});
const str = (value: unknown) => (typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "");
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

export function parseJson(raw: string): Json | null {
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
  } catch {
    return null;
  }
}

export function transcriptTurns(call: Json): TranscriptTurn[] {
  const list = Array.isArray(call.transcript_object) ? call.transcript_object : [];
  const turns: TranscriptTurn[] = [];
  for (const item of list) {
    const row = obj(item);
    const text = str(row.content);
    if (!text) continue;
    turns.push({ role: row.role === "agent" ? "agent" : "user", text });
  }
  if (turns.length) return turns;
  // Fallback: the plain "Agent: … / User: …" transcript string.
  const plain = str(call.transcript);
  for (const line of plain.split(/\n+/)) {
    const match = /^(Agent|User)\s*:\s*(.+)$/i.exec(line.trim());
    if (match) turns.push({ role: match[1].toLowerCase() === "agent" ? "agent" : "user", text: match[2].trim() });
  }
  return turns;
}

export type CallEvent = {
  event: string;
  callId: string;
  agentId: string;
  from: string;
  to: string;
  direction: string;
  startedAt: Date | null;
  endedAt: Date | null;
  durationSec: number;
  endReason: string;
  recordingUrl: string;
  transcript: TranscriptTurn[];
  summary: string;
  fields: {
    callerName: string;
    callbackNumber: string;
    address: string;
    jobType: string;
    details: string;
    preferredTime: string;
    urgency: "low" | "normal" | "urgent";
    isSpam: boolean;
  };
  dynamic: Record<string, string>;
};

export function parseCallEvent(payload: Json): CallEvent | null {
  const event = str(payload.event);
  const call = obj(payload.call);
  const callId = str(call.call_id);
  if (!event || !callId) return null;
  const startMs = num(call.start_timestamp);
  const endMs = num(call.end_timestamp);
  const analysis = obj(call.call_analysis);
  const custom = obj(analysis.custom_analysis_data);
  const urgency = str(custom.urgency).toLowerCase();
  const dynamicRaw = obj(call.retell_llm_dynamic_variables);
  const dynamic: Record<string, string> = {};
  for (const [key, value] of Object.entries(dynamicRaw)) dynamic[key] = str(value);
  return {
    event,
    callId,
    agentId: str(call.agent_id),
    from: str(call.from_number),
    to: str(call.to_number),
    direction: str(call.direction) || "inbound",
    startedAt: startMs ? new Date(startMs) : null,
    endedAt: endMs ? new Date(endMs) : null,
    durationSec: callSeconds({ durationMs: num(call.duration_ms), startMs, endMs }),
    endReason: str(call.disconnection_reason),
    recordingUrl: str(call.recording_url),
    transcript: transcriptTurns(call),
    summary: str(analysis.call_summary),
    fields: {
      callerName: str(custom.caller_name),
      callbackNumber: str(custom.callback_number),
      address: str(custom.service_address),
      jobType: str(custom.job_type),
      details: str(custom.job_details),
      preferredTime: str(custom.preferred_time),
      urgency: urgency === "urgent" || urgency === "low" ? urgency : "normal",
      isSpam: custom.is_spam === true || str(custom.is_spam).toLowerCase() === "true",
    },
    dynamic,
  };
}

export type InboundEvent = { callId: string; agentId: string; from: string; to: string };

export function parseInbound(payload: Json): InboundEvent | null {
  if (str(payload.event) !== "call_inbound") return null;
  const inbound = obj(payload.call_inbound);
  const to = str(inbound.to_number);
  if (!to && !str(inbound.call_id)) return null;
  return { callId: str(inbound.call_id), agentId: str(inbound.agent_id), from: str(inbound.from_number), to };
}

export type ToolCall = { name: string; callId: string; from: string; to: string; args: Json; dynamic: Record<string, string> };

/** Custom function request: { name, call, args } (we never turn on "args at root"). */
export function parseToolCall(payload: Json, nameFromPath: string): ToolCall {
  const call = obj(payload.call);
  const dynamicRaw = obj(call.retell_llm_dynamic_variables);
  const dynamic: Record<string, string> = {};
  for (const [key, value] of Object.entries(dynamicRaw)) dynamic[key] = str(value);
  return {
    name: str(payload.name) || nameFromPath,
    callId: str(call.call_id),
    from: str(call.from_number),
    to: str(call.to_number),
    args: obj(payload.args),
    dynamic,
  };
}

export function argText(args: Json, key: string, max = 400) {
  return str(args[key]).slice(0, max);
}
