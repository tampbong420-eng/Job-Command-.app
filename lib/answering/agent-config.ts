/**
 * Retell agent + LLM config generated from the shop's own details. Pure (no network): the Connect action in
 * lib/answering/retell-client.ts sends these bodies to Retell's documented API (create-retell-llm,
 * create-agent). Dynamic variables in {{double braces}} are filled per call by our inbound webhook.
 */
import {
  FULL_CALL_MAX_MS,
  RETELL_PATHS,
  TOOL_BOOK_ESTIMATE,
  TOOL_CHECK_AVAILABILITY,
} from "@/lib/answering/config";

export type ShopForAgent = {
  shopName: string;
  ownerFirstName: string;
  trade: string; // "painting", "plumbing" …
  services: string[]; // service names the shop offers
  serviceArea: string; // "Hot Springs, AR and about 30 miles out"
  timeZone: string;
  hoursLine: string; // "Monday to Friday, 7 AM to 5 PM"
};

/** Variables our inbound webhook sends for every call (also used as defaults on the LLM). */
export const DYNAMIC_VARIABLES = [
  "shop_name",
  "owner_first_name",
  "answer_mode",
  "today",
  "today_iso",
  "time_zone",
  "shop_hours",
  "caller_number",
  "known_caller_name",
] as const;

export function beginMessage(mode: "full" | "message") {
  if (mode === "message") {
    return "Thanks for calling {{shop_name}}. Nobody can get to the phone right now. I'm the virtual assistant, I'm an AI, and this call is recorded. Can I take your name, number, and a quick message so {{owner_first_name}} can call you back?";
  }
  return "Thanks for calling {{shop_name}}. This is the virtual assistant. I'm an AI, and this call is recorded so we get your details right. How can I help you today?";
}

export function buildPrompt(shop: ShopForAgent) {
  const services = shop.services.length ? shop.services.join(", ") : `${shop.trade || "contracting"} work`;
  return [
    `## Who you are`,
    `You answer the phone for {{shop_name}}, a local ${shop.trade || "contracting"} company. The owner is {{owner_first_name}}.`,
    `You are an AI assistant. Say so if anyone asks. Sound like a friendly, relaxed person from the front office: short sentences, plain words, one question at a time. Never read lists out loud.`,
    `Today is {{today}} ({{today_iso}}). Shop time zone: {{time_zone}}. Shop hours: {{shop_hours}}.`,
    `The caller's number is {{caller_number}}. Known customer name, if any: {{known_caller_name}}.`,
    ``,
    `## What the shop does`,
    `Services: ${services}. Service area: ${shop.serviceArea || "the local area"}.`,
    ``,
    `## Mode: {{answer_mode}}`,
    `If answer_mode is "message": do NOT offer or book appointments and do not call ${TOOL_CHECK_AVAILABILITY} or ${TOOL_BOOK_ESTIMATE}. Take the caller's name, best callback number, address, and a short message, read it back, tell them {{owner_first_name}} will call them back, and end the call. Keep it under two minutes.`,
    `If answer_mode is "full": follow the steps below and book a free estimate visit.`,
    ``,
    `## Steps (full mode)`,
    `1. Find out what they need. If it's not something the shop does, say so kindly and offer to take a message.`,
    `2. Get their name. If {{known_caller_name}} is filled in, confirm it instead of asking.`,
    `3. Confirm the best callback number. Offer {{caller_number}} first.`,
    `4. Get the job address: street, city. Read it back once.`,
    `5. Get the job type and a few details (for example rooms, size, inside or outside, anything urgent).`,
    `6. Ask what day and time of day works best for a free estimate visit.`,
    `7. Call ${TOOL_CHECK_AVAILABILITY} with their preferred date (YYYY-MM-DD, work it out from today's date) and part of day. Offer at most two or three of the returned times, using the spoken labels. Never make up a time that the tool did not return.`,
    `8. When they pick one, call ${TOOL_BOOK_ESTIMATE} with that slot_id and everything you collected. If it says the time was just taken, offer the alternatives it returns.`,
    `9. Read back the booked day and time and the address. Tell them {{owner_first_name}} will see them then, and that the estimate is free.`,
    `10. Ask if there's anything else, then say goodbye and end the call.`,
    ``,
    `## Rules`,
    `- Never quote prices or say how much a job will cost. Say "${shop.ownerFirstName || "The owner"} gives free written estimates at the visit."`,
    `- Never take card numbers or payments by phone.`,
    `- Don't promise licensing, insurance, warranties, or start dates.`,
    `- Emergencies (fire, gas, flooding with power on, injury): tell them to hang up and call 911.`,
    `- Sales calls, robocalls, and spam: say the owner isn't interested, and end the call.`,
    `- If they insist on talking to a person, take a message and say {{owner_first_name}} will call back as soon as possible.`,
  ].join("\n");
}

const AVAILABILITY_PARAMETERS = {
  type: "object",
  properties: {
    preferred_date: {
      type: "string",
      description: "The day the caller would like, as YYYY-MM-DD. Leave empty for the soonest openings.",
    },
    part_of_day: {
      type: "string",
      enum: ["morning", "afternoon", "any"],
      description: "Morning, afternoon, or any.",
    },
  },
  required: [],
} as const;

const BOOKING_PARAMETERS = {
  type: "object",
  properties: {
    slot_id: { type: "string", description: `The slot_id of the time the caller picked, exactly as ${TOOL_CHECK_AVAILABILITY} returned it.` },
    caller_name: { type: "string", description: "Caller's full name." },
    caller_phone: { type: "string", description: "Best callback number." },
    address: { type: "string", description: "Job address: street and city." },
    job_type: { type: "string", description: "Short job type, for example Interior repaint." },
    details: { type: "string", description: "A few details about the job in one or two sentences." },
    preferred_time: { type: "string", description: "What the caller said about when works for them." },
  },
  required: ["slot_id", "caller_name", "caller_phone", "address", "job_type"],
} as const;

/** Body for POST /create-retell-llm (or PATCH /update-retell-llm/{id}). */
export function buildLlmConfig(shop: ShopForAgent, baseUrl: string, model?: string) {
  const base = baseUrl.replace(/\/$/, "");
  return {
    ...(model ? { model } : {}),
    model_temperature: 0.2,
    start_speaker: "agent",
    begin_message: beginMessage("full"),
    general_prompt: buildPrompt(shop),
    default_dynamic_variables: {
      shop_name: shop.shopName || "the shop",
      owner_first_name: shop.ownerFirstName || "the owner",
      answer_mode: "message",
      today: "",
      today_iso: "",
      time_zone: shop.timeZone,
      shop_hours: shop.hoursLine,
      caller_number: "",
      known_caller_name: "",
    },
    general_tools: [
      { type: "end_call", name: "end_call", description: "End the call after saying goodbye, or for spam." },
      {
        type: "custom",
        name: TOOL_CHECK_AVAILABILITY,
        description: "Find open times for a free estimate visit. Call before offering any time.",
        url: `${base}${RETELL_PATHS.tool(TOOL_CHECK_AVAILABILITY)}`,
        method: "POST",
        parameters: AVAILABILITY_PARAMETERS,
        speak_during_execution: true,
        execution_message_description: "Okay, let me look at the schedule.",
        execution_message_type: "static_text",
        speak_after_execution: true,
        timeout_ms: 10000,
      },
      {
        type: "custom",
        name: TOOL_BOOK_ESTIMATE,
        description: "Book the free estimate visit at the slot the caller picked, with their details.",
        url: `${base}${RETELL_PATHS.tool(TOOL_BOOK_ESTIMATE)}`,
        method: "POST",
        parameters: BOOKING_PARAMETERS,
        speak_during_execution: true,
        execution_message_description: "Great, I'm putting that on the schedule now.",
        execution_message_type: "static_text",
        speak_after_execution: true,
        timeout_ms: 15000,
      },
    ],
  };
}

/** Fields Retell pulls out of every call after it ends (call_analyzed → call_analysis.custom_analysis_data). */
export const POST_CALL_FIELDS = [
  { type: "string", name: "caller_name", description: "The caller's full name.", examples: ["Linda Parker"] },
  { type: "string", name: "callback_number", description: "Best number to call them back.", examples: ["501-555-0199"] },
  { type: "string", name: "service_address", description: "Job address, street and city.", examples: ["412 Whittington Ave, Hot Springs"] },
  { type: "string", name: "job_type", description: "Short job type.", examples: ["Exterior repaint"] },
  { type: "string", name: "job_details", description: "One or two sentences about the job.", examples: ["Two-story house, peeling trim."] },
  { type: "string", name: "preferred_time", description: "When the caller said works for them.", examples: ["Weekday mornings"] },
  { type: "enum", name: "urgency", description: "How urgent the job is.", choices: ["low", "normal", "urgent"] },
  { type: "boolean", name: "is_spam", description: "True for sales calls, robocalls, or spam." },
] as const;

/** Body for POST /create-agent (or PATCH /update-agent/{id}). */
export function buildAgentConfig(input: { shop: ShopForAgent; llmId: string; voiceId: string; baseUrl: string }) {
  const base = input.baseUrl.replace(/\/$/, "");
  return {
    agent_name: `Job Command · ${input.shop.shopName || "Shop"}`,
    response_engine: { type: "retell-llm", llm_id: input.llmId },
    voice_id: input.voiceId,
    language: "en-US",
    webhook_url: `${base}${RETELL_PATHS.events}`,
    webhook_events: ["call_started", "call_ended", "call_analyzed"],
    post_call_analysis_data: POST_CALL_FIELDS,
    max_call_duration_ms: FULL_CALL_MAX_MS,
    end_call_after_silence_ms: 30000,
    interruption_sensitivity: 0.8,
    enable_backchannel: true,
    data_storage_setting: "everything",
    timezone: input.shop.timeZone,
  };
}

/** Body for PATCH /update-phone-number/{number}: bind our agent and our inbound webhook to the Retell number. */
export function buildPhoneBinding(input: { agentId: string; baseUrl: string; nickname: string }) {
  return {
    inbound_agents: [{ agent_id: input.agentId, weight: 1 }],
    inbound_webhook_url: `${input.baseUrl.replace(/\/$/, "")}${RETELL_PATHS.inbound}`,
    nickname: input.nickname,
  };
}
