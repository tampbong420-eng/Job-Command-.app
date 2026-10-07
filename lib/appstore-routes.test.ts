import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { AI_CONSENT_HEADER, AI_ENDPOINTS, aiAllowed } from "./ai-consent";
import { PRIVACY_SECTIONS } from "./legal";

const root = path.join(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");
const headers = (value?: string) => ({ get: (name: string) => (name === AI_CONSENT_HEADER ? value ?? null : null) });

test("server AI gate: only an explicit yes lets a route call the model", () => {
  assert.equal(aiAllowed(headers("granted")), true);
  assert.equal(aiAllowed(headers("denied")), false);
  assert.equal(aiAllowed(headers()), false);
  assert.equal(aiAllowed(headers("GRANTED ")), false);
});

test("every AI route checks the person's yes before any model call", () => {
  for (const route of Object.keys(AI_ENDPOINTS)) {
    const src = read(`app${route}/route.ts`);
    assert.match(src, /aiAllowed\(request\.headers\)/, `${route} must check aiAllowed`);
    if (/generateText\(|transcribe\(/.test(src)) {
      assert.ok(src.indexOf("aiAllowed(request.headers)") < src.search(/generateText\(|transcribe\(/), `${route}: gate before the model call`);
    }
  }
  const voice = read("lib/site-voice-store.ts");
  assert.match(voice, /async function speechToText\(audio: Uint8Array, ai: boolean\) \{\n  if \(!ai\) return "";/);
  assert.match(voice, /async function enrichTalk\(local: SiteTalkDraft, ai: boolean\) \{\n  if \(!ai\) return local;/);
  assert.match(voice, /const ai = input\.ai === true;/);
});

test("privacy policy names OpenAI, what is sent, Not now, and in-app delete", () => {
  const ai = PRIVACY_SECTIONS.find((s) => s.title === "AI assistant");
  assert.ok(ai);
  const text = ai.paragraphs.join(" ");
  assert.match(text, /OpenAI/);
  assert.match(text, /GPT-4o mini/);
  assert.match(text, /Whisper/);
  assert.match(text, /Not now, nothing goes to OpenAI/);
  assert.match(text, /Never sent to OpenAI: PINs, bank or card numbers, Social Security numbers/);
  const all = PRIVACY_SECTIONS.flatMap((s) => s.paragraphs).join(" ");
  assert.match(all, /delete the whole shop/);
  assert.match(all, /delete their own login/);
  assert.match(read("app/privacy/page.tsx"), /OpenAI/);
});

test("a deleted login stops working on server actions and API routes, not just the page", () => {
  for (const rel of [
    "app/actions.ts",
    "app/signup-actions.ts",
    "app/billing-trial-actions.ts",
    "app/api/session/route.ts",
    "app/api/crew-ping/route.ts",
    "app/api/jobs/voice/route.ts",
    "app/api/export/year-end/route.ts",
    "app/api/setup/card-check/route.ts",
    "app/j/[token]/page.tsx",
  ]) {
    const src = read(rel);
    assert.doesNotMatch(src, /\bgetSession\(\)/, `${rel} must use getLiveSession`);
    assert.match(src, /getLiveSession\(\)/, rel);
  }
  // Routes that only had the edge middleware cookie check now re-check the login in Node, in every handler.
  for (const rel of [
    "alerts/quiet", "alerts", "docs/parse", "drive", "export/document", "export/payslip", "export/quickbooks",
    "export/time-activities", "jobs/photos/analyze", "jobs/photos", "leads/parse", "push/subscribe",
    "schedule/pack", "upload",
  ]) {
    const src = read(`app/api/${rel}/route.ts`);
    const handlers = src.match(/^export async function (GET|POST|PUT|DELETE|PATCH)\(/gm) || [];
    const guards = src.match(/const removed = await rejectRemovedLogin\(\);\n  if \(removed\) return removed;/g) || [];
    assert.ok(handlers.length > 0, rel);
    assert.equal(guards.length, handlers.length, `${rel}: every handler re-checks the login`);
  }
  // Go-public: receipts are office-only on the server (officeOnlyApi = live login + ADMIN), in every handler.
  const receipts = read("app/api/receipts/route.ts");
  const receiptHandlers = receipts.match(/^export async function (GET|POST|PUT|DELETE|PATCH)\(/gm) || [];
  const officeGuards = receipts.match(/const denied = await officeOnlyApi\(\);\n  if \(denied\) return denied;/g) || [];
  assert.ok(receiptHandlers.length >= 3);
  assert.equal(officeGuards.length, receiptHandlers.length, "receipts: every handler is office-only");
  assert.match(read("lib/office-guard.ts"), /getLiveSession\(\)/);
  const live = read("lib/live-session.ts");
  assert.match(live, /export async function rejectRemovedLogin\(\): Promise<Response \| null>/);
  assert.match(live, /status: 403/);
});
