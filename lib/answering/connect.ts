import "server-only";

import { appOrigin } from "@/lib/origin";
import { buildAgentConfig, buildLlmConfig, buildPhoneBinding } from "@/lib/answering/agent-config";
import { phoneNumbersFrom, pickVoiceId, retell, retellConnected } from "@/lib/answering/retell-client";
import { getAnsweringSettings, loadShopContext, saveAnsweringSettings } from "@/lib/answering/store";
import { parsePhoneVoice } from "@/lib/answering/config";
import { prettyUs } from "@/lib/answering/forwarding";

export type ConnectStep = { label: string; ok: boolean; detail?: string };
export type ConnectResult = { ok: boolean; message: string; steps: ConnectStep[] };

/** Is this address reachable by Retell? (Retell refuses localhost, private IPs, and plain http.) */
export function publicBaseProblem(base: string) {
  if (!/^https:\/\//i.test(base)) return "The app address must start with https:// so Retell can reach it.";
  if (/\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(base)) return "Retell can't reach a local address. Set APP_ORIGIN to the live app address.";
  return "";
}

/**
 * Create (or update) the Retell LLM + agent from the shop's details and bind them, plus our inbound webhook,
 * to the shop's Retell number. Needs RETELL_API_KEY, a number bought in Retell, and a public https APP_ORIGIN.
 * Honest about every step; nothing is saved as "connected" unless Retell said yes.
 */
export async function connectRetell(shopId: string): Promise<ConnectResult> {
  const steps: ConnectStep[] = [];
  if (!retellConnected()) {
    return { ok: false, message: "Not connected yet. The Retell API key isn't on the server.", steps: [{ label: "Retell API key", ok: false, detail: "Add RETELL_API_KEY to the server settings." }] };
  }
  steps.push({ label: "Retell API key", ok: true });
  const base = process.env.APP_ORIGIN?.replace(/\/$/, "") || appOrigin();
  const baseProblem = publicBaseProblem(base);
  if (baseProblem) return { ok: false, message: baseProblem, steps: [...steps, { label: "Public app address", ok: false, detail: base }] };
  steps.push({ label: "Public app address", ok: true, detail: base });

  const [settings, shop] = await Promise.all([getAnsweringSettings(shopId), loadShopContext(shopId)]);
  if (!settings.retellNumber) {
    return { ok: false, message: "Type the 501 number you bought in Retell first.", steps: [...steps, { label: "Retell number", ok: false }] };
  }
  const numbers = await retell.listPhoneNumbers();
  if (!numbers.ok) return { ok: false, message: numbers.error, steps: [...steps, { label: "Retell number", ok: false, detail: numbers.error }] };
  const owned = phoneNumbersFrom(numbers.data).find((n) => n.phone_number === settings.retellNumber);
  if (!owned) {
    return { ok: false, message: `${prettyUs(settings.retellNumber)} isn't in your Retell account. Check the number.`, steps: [...steps, { label: "Retell number", ok: false }] };
  }
  steps.push({ label: "Retell number", ok: true, detail: prettyUs(settings.retellNumber) });

  const voices = await retell.listVoices();
  const voiceId = pickVoiceId(parsePhoneVoice(settings.voice), voices.ok && Array.isArray(voices.data) ? voices.data : []);

  const llmBody = buildLlmConfig(shop.agent, base, process.env.RETELL_LLM_MODEL?.trim() || undefined);
  const llm = settings.retellLlmId ? await retell.updateLlm(settings.retellLlmId, llmBody) : await retell.createLlm(llmBody);
  if (!llm.ok) return { ok: false, message: llm.error, steps: [...steps, { label: "AI script and tools", ok: false, detail: llm.error }] };
  const llmId = llm.data.llm_id || settings.retellLlmId;
  steps.push({ label: "AI script and tools", ok: true });

  const agentBody = buildAgentConfig({ shop: shop.agent, llmId, voiceId, baseUrl: base });
  const agent = settings.retellAgentId ? await retell.updateAgent(settings.retellAgentId, agentBody) : await retell.createAgent(agentBody);
  if (!agent.ok) {
    await saveAnsweringSettings(shopId, { retellLlmId: llmId });
    return { ok: false, message: agent.error, steps: [...steps, { label: "Phone agent", ok: false, detail: agent.error }] };
  }
  const agentId = agent.data.agent_id || settings.retellAgentId;
  steps.push({ label: `Phone agent (${parsePhoneVoice(settings.voice)} voice)`, ok: true });
  if (typeof agent.data.version === "number") {
    const published = await retell.publishAgent(agentId, agent.data.version);
    steps.push({ label: "Publish agent", ok: published.ok, detail: published.ok ? undefined : "Publish it in the Retell dashboard if calls use an old version." });
  }

  const bind = await retell.updatePhoneNumber(settings.retellNumber, buildPhoneBinding({ agentId, baseUrl: base, nickname: `${shop.agent.shopName} · Job Command` }));
  await saveAnsweringSettings(shopId, { retellLlmId: llmId, retellAgentId: agentId, connectedAt: bind.ok ? new Date() : null });
  if (!bind.ok) return { ok: false, message: bind.error, steps: [...steps, { label: "Number answers with this agent", ok: false, detail: bind.error }] };
  steps.push({ label: "Number answers with this agent", ok: true });
  return { ok: true, message: `Connected. Calls to ${prettyUs(settings.retellNumber)} are answered by the AI.`, steps };
}

/** Voice switch while connected: update the live agent's voice too (best effort, honest result). */
export async function pushVoiceToRetell(shopId: string) {
  const settings = await getAnsweringSettings(shopId);
  if (!retellConnected() || !settings.retellAgentId) return { ok: false, message: "Saved. It goes live when Retell is connected." };
  const voices = await retell.listVoices();
  const voiceId = pickVoiceId(parsePhoneVoice(settings.voice), voices.ok && Array.isArray(voices.data) ? voices.data : []);
  const result = await retell.updateAgent(settings.retellAgentId, { voice_id: voiceId });
  if (!result.ok) return { ok: false, message: result.error };
  if (typeof result.data.version === "number") await retell.publishAgent(settings.retellAgentId, result.data.version);
  return { ok: true, message: "Voice updated on the live line." };
}
