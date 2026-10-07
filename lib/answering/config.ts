/**
 * AI call answering — shared constants. Client-safe (no Node APIs, no secrets).
 *
 * Plan (Eric, Oct 2 2026): the shop keeps its own number. Missed calls conditionally forward to a new local
 * 501 number that Retell provides. A natural voice (male default, female option) answers with the shop name,
 * takes the caller's details, books an estimate visit on the combined schedule, and pings the boss with a
 * push alert and a Call Card. $59/mo add-on, 200 AI minutes a month; past the cap it only takes messages.
 */

export const DEFAULT_SHOP_ID = "default";

/** $59/mo add-on includes this many AI minutes per shop per month (shop calendar). */
export const ANSWERING_MINUTES_CAP = 200;
/** Spend guard: past this many minutes in a month, new calls are declined (spam flood protection). */
export const ANSWERING_HARD_CEILING_MINUTES = 400;

/** Longest call the AI will hold when it can book (Retell max_call_duration_ms). */
export const FULL_CALL_MAX_MS = 10 * 60 * 1000;
/** Longest call in message-only mode (cap hit, add-on off, or AI switched off). */
export const MESSAGE_CALL_MAX_MS = 2 * 60 * 1000;

export const DEFAULT_ESTIMATE_MINUTES = 60;
export const DEFAULT_BUFFER_MINUTES = 30;
/** How many open slots the AI offers at once. */
export const SLOTS_OFFERED = 3;
/** How far ahead the AI looks for an open estimate slot. */
export const BOOKING_HORIZON_DAYS = 14;
/** Nothing is booked sooner than this from now (a same-day slot needs this much notice). */
export const MIN_NOTICE_MINUTES = 120;

export type PhoneVoice = "male" | "female";
export const DEFAULT_PHONE_VOICE: PhoneVoice = "male";

export function parsePhoneVoice(value: unknown): PhoneVoice {
  return value === "female" ? "female" : "male";
}

/**
 * Fallback Retell voice ids. Eric auditions voices in the Retell dashboard and can set
 * RETELL_VOICE_MALE / RETELL_VOICE_FEMALE; otherwise Connect picks the first ElevenLabs voice of that gender
 * from Retell's own voice list. "11labs-Adrian" is the male ElevenLabs voice in Retell's API docs.
 */
export const FALLBACK_VOICE_IDS: Record<PhoneVoice, string> = {
  male: "11labs-Adrian",
  female: "",
};

export type AnswerMode = "full" | "message";

export const TOOL_CHECK_AVAILABILITY = "check_availability";
export const TOOL_BOOK_ESTIMATE = "book_estimate";
export const ANSWERING_TOOLS = [TOOL_CHECK_AVAILABILITY, TOOL_BOOK_ESTIMATE] as const;
export type AnsweringTool = (typeof ANSWERING_TOOLS)[number];

export function isAnsweringTool(value: string): value is AnsweringTool {
  return (ANSWERING_TOOLS as readonly string[]).includes(value);
}

/** Webhook paths on our server (all under /api/webhooks, which middleware leaves public; each verifies the Retell signature). */
export const RETELL_PATHS = {
  events: "/api/webhooks/retell",
  inbound: "/api/webhooks/retell/inbound",
  tool: (name: AnsweringTool) => `/api/webhooks/retell/tools/${name}`,
};

export type CallOutcome = "NEW" | "BOOKED" | "MESSAGE" | "NO_BOOKING" | "SPAM";

export function parseOutcome(value: unknown): CallOutcome {
  return value === "BOOKED" || value === "MESSAGE" || value === "NO_BOOKING" || value === "SPAM" ? value : "NEW";
}

/** Words on the Call Card status chip. */
export const OUTCOME_LABEL: Record<CallOutcome, string> = {
  NEW: "New call",
  BOOKED: "Estimate booked",
  MESSAGE: "Call back",
  NO_BOOKING: "Call back",
  SPAM: "Spam",
};
