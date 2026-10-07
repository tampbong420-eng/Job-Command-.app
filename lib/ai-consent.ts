/**
 * AI permission (Apple App Store guideline 5.1.2(i): tell people, and ask, before personal data goes to a
 * third-party AI). Client-safe — no Node APIs.
 *
 * Who gets it: OpenAI (models gpt-4o-mini and whisper-1), reached from the Job Command server through
 * Vercel's AI Gateway. The phone never talks to OpenAI directly.
 * When: the first time voice words, a job photo, or typed notes would go to the AI. One choice per signed-in
 * person per phone (localStorage), reviewable any time in Settings.
 * "Not now": nothing goes to the AI. Voice and typing still work with the on-phone parser (rougher drafts).
 */

export const AI_PROVIDER = "OpenAI";
export const AI_PROVIDER_DETAIL = "OpenAI (GPT-4o mini and Whisper), through Vercel's AI Gateway";
export const AI_CONSENT_VERSION = 1;
export const AI_CONSENT_EVENT = "jc-ai-consent";
/** Sent on AI requests so a server route can refuse when the phone said no (see aiConsentDenied). */
export const AI_CONSENT_HEADER = "x-jc-ai-consent";

export type AiChoice = "granted" | "denied";
export type AiKind = "voice" | "photos" | "text" | "setup";

/** The AI routes and what each one sends. Anything posting to these paths is gated. */
export const AI_ENDPOINTS: Record<string, AiKind> = {
  "/api/jobs/voice": "voice",
  "/api/jobs/photos/analyze": "photos",
  "/api/leads/parse": "text",
  "/api/docs/parse": "text",
  "/api/setup/parse": "setup",
};

/** Plain words for the permission screen and Settings. */
export const AI_SENDS: Array<{ kind: AiKind; title: string; body: string }> = [
  {
    kind: "voice",
    title: "Your voice notes",
    body: "The words you say into the mic (and short site voice clips) so the AI can turn them into notes, line items, and lead details.",
  },
  {
    kind: "photos",
    title: "Job photos",
    body: "Up to 4 site photos per job, with the job name, address, and notes, so it can draft an estimate.",
  },
  {
    kind: "text",
    title: "What you type",
    body: "Lead details (client name, phone, address, the work), estimate and invoice lines, and job notes.",
  },
];

export const AI_NEVER_SENDS =
  "Never sent: PINs, bank or card numbers, Social Security numbers, payroll, or your contacts list.";

export const AI_USE_LINE =
  "OpenAI uses it only to answer Job Command. OpenAI says it does not train its models on data sent through its API.";

export const AI_WITHOUT_LINE =
  "Not now keeps everything on Job Command: the mic still fills in boxes on your phone, just with rougher drafts. Turn the AI on any time in Settings.";

/** Path of a same-origin AI route, or null. */
export function aiKindForUrl(url: string, origin: string): AiKind | null {
  let path = "";
  try {
    const parsed = new URL(url, origin);
    if (parsed.origin !== origin) return null;
    path = parsed.pathname.replace(/\/+$/, "");
  } catch {
    return null;
  }
  return AI_ENDPOINTS[path] || null;
}

export function aiConsentKey(accountKey: string | null | undefined) {
  return `jc-ai-consent:v${AI_CONSENT_VERSION}:${String(accountKey || "guest")}`;
}

type KV = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void };

export type AiConsentRecord = { choice: AiChoice; at: string; v: number };

export function readAiConsent(storage: KV | null | undefined, accountKey: string | null | undefined): AiConsentRecord | null {
  try {
    const raw = storage?.getItem(aiConsentKey(accountKey));
    if (!raw) return null;
    const row = JSON.parse(raw) as Partial<AiConsentRecord>;
    if (row.v !== AI_CONSENT_VERSION) return null;
    if (row.choice !== "granted" && row.choice !== "denied") return null;
    return { choice: row.choice, at: String(row.at || ""), v: AI_CONSENT_VERSION };
  } catch {
    return null;
  }
}

export function writeAiConsent(
  storage: KV | null | undefined,
  accountKey: string | null | undefined,
  choice: AiChoice,
  now = new Date()
) {
  const record: AiConsentRecord = { choice, at: now.toISOString(), v: AI_CONSENT_VERSION };
  try {
    storage?.setItem(aiConsentKey(accountKey), JSON.stringify(record));
  } catch {
    /* private mode: the choice lasts for this visit only */
  }
  return record;
}

export function clearAiConsent(storage: KV | null | undefined, accountKey: string | null | undefined) {
  try {
    storage?.removeItem(aiConsentKey(accountKey));
  } catch {
    /* ignore */
  }
}

/**
 * Server-side gate for every AI route: the model is called only when the request says the person said yes
 * (the phone's fetch gate adds the header only after "Allow"). No header, "denied", or anything else → the
 * route answers with its on-server parser and nothing goes to OpenAI.
 */
export function aiAllowed(headers: { get(name: string): string | null }) {
  return headers.get(AI_CONSENT_HEADER) === "granted";
}

/** Server-side check for a route: true when this phone said no to AI. Routes can skip the model call. */
export function aiConsentDenied(headers: { get(name: string): string | null }) {
  return headers.get(AI_CONSENT_HEADER) === "denied";
}
