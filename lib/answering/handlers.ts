import "server-only";

import { prisma } from "@/lib/prisma";
import { phoneKey } from "@/lib/clients";
import { checkRetellSignature, RETELL_SIGNATURE_HEADER } from "@/lib/answering/signature";
import { parseCallEvent, parseInbound, parseJson, parseToolCall } from "@/lib/answering/events";
import { planCall } from "@/lib/answering/metering";
import { beginMessage } from "@/lib/answering/agent-config";
import { spokenDay } from "@/lib/answering/slots";
import { isAnsweringTool, TOOL_BOOK_ESTIMATE, TOOL_CHECK_AVAILABILITY } from "@/lib/answering/config";
import { applyCallEvent, getAnsweringSettings, loadShopContext, meterCall, openCard, pingBoss, shopIdForNumber, usageNow } from "@/lib/answering/store";
import { bookEstimate, checkAvailability } from "@/lib/answering/booking";

/**
 * Request handlers behind the three Retell routes (app/api/webhooks/retell/**). Every one reads the raw body,
 * verifies X-Retell-Signature with Retell's SDK, and only then parses JSON. Kept here (not in the route files)
 * so the simulator script drives the exact same code.
 */

type Verified = { ok: true; payload: Record<string, unknown> } | { ok: false; response: Response };

async function verified(request: Request): Promise<Verified> {
  const raw = await request.text();
  const check = await checkRetellSignature(raw, request.headers.get(RETELL_SIGNATURE_HEADER));
  if (!check.ok) return { ok: false, response: Response.json({ error: check.reason }, { status: check.status }) };
  const payload = parseJson(raw);
  if (!payload) return { ok: false, response: Response.json({ error: "Bad JSON." }, { status: 400 }) };
  return { ok: true, payload };
}

const SIM_PREFIX = "sim_";

/** call_inbound: pick full AI vs message-only for this call (cap, add-on, on/off), and fill the agent's variables. */
export async function handleInbound(request: Request, now = new Date()) {
  const check = await verified(request);
  if (!check.ok) return check.response;
  const inbound = parseInbound(check.payload);
  if (!inbound) return Response.json({ error: "Not a call_inbound event." }, { status: 400 });
  const shopId = await shopIdForNumber(inbound.to);
  const [settings, shop] = await Promise.all([getAnsweringSettings(shopId), loadShopContext(shopId)]);
  const usage = await usageNow(shopId, shop.timeZone, now);
  const plan = planCall({ addonActive: shop.addonActive, enabled: settings.enabled, usedSeconds: usage.seconds, capMinutes: settings.minutesCap });
  if (plan.reject) {
    await prisma.auditLog.create({ data: { actor: "AI answering", action: "Declined a call: monthly minute ceiling reached", field: "answering", newValue: inbound.from } });
    return Response.json({ call_inbound: { reject: true } });
  }
  const key = phoneKey(inbound.from);
  const known = key ? (await prisma.customer.findMany({ select: { name: true, phone: true } })).find((c) => phoneKey(c.phone) === key) : null;
  if (inbound.callId) {
    await openCard({ shopId, callId: inbound.callId, from: inbound.from, to: inbound.to, agentId: inbound.agentId, mode: plan.mode, simulated: inbound.callId.startsWith(SIM_PREFIX) });
  }
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: shop.timeZone }).format(now);
  const voiceEnv = settings.voice === "female" ? process.env.RETELL_VOICE_FEMALE?.trim() : process.env.RETELL_VOICE_MALE?.trim();
  return Response.json({
    call_inbound: {
      dynamic_variables: {
        shop_name: shop.agent.shopName,
        owner_first_name: shop.agent.ownerFirstName,
        answer_mode: plan.mode,
        today: `${spokenDay(todayIso)}, ${todayIso.slice(0, 4)}`,
        today_iso: todayIso,
        time_zone: shop.timeZone,
        shop_hours: shop.agent.hoursLine,
        caller_number: inbound.from,
        known_caller_name: known?.name || "",
      },
      metadata: { shop_id: shopId, answer_mode: plan.mode, plan_reason: plan.reason },
      agent_override: {
        agent: { max_call_duration_ms: plan.maxCallMs, ...(voiceEnv ? { voice_id: voiceEnv } : {}) },
        retell_llm: { begin_message: beginMessage(plan.mode) },
      },
    },
  });
}

/** call_started / call_ended / call_analyzed → Call Card, minutes, and the boss's push. Always 2xx once verified. */
export async function handleCallEvent(request: Request) {
  const check = await verified(request);
  if (!check.ok) return check.response;
  const event = parseCallEvent(check.payload);
  if (!event) return new Response(null, { status: 204 });
  if (!["call_started", "call_ended", "call_analyzed"].includes(event.event)) return new Response(null, { status: 204 });
  const shopId = await shopIdForNumber(event.to);
  const card = await applyCallEvent(shopId, event, event.callId.startsWith(SIM_PREFIX));
  if (event.event !== "call_started") {
    const shop = await loadShopContext(shopId);
    await meterCall(card.id, shop.timeZone);
    await pingBoss(card.id);
  }
  return new Response(null, { status: 204 });
}

/** Custom functions: check_availability and book_estimate. The reply JSON is what the agent hears back. */
export async function handleTool(request: Request, toolName: string, now = new Date()) {
  if (!isAnsweringTool(toolName)) return Response.json({ error: "Unknown tool." }, { status: 404 });
  const check = await verified(request);
  if (!check.ok) return check.response;
  const call = parseToolCall(check.payload, toolName);
  const shopId = await shopIdForNumber(call.to);
  try {
    if (toolName === TOOL_CHECK_AVAILABILITY) return Response.json(await checkAvailability(shopId, call, now));
    if (toolName === TOOL_BOOK_ESTIMATE) return Response.json(await bookEstimate(shopId, call, now));
  } catch (error) {
    console.error("[answering tool]", toolName, error);
    return Response.json({ booked: false, result: "The schedule had a hiccup. Take a message and say the owner will call back to set a time." });
  }
  return Response.json({ error: "Unknown tool." }, { status: 404 });
}
