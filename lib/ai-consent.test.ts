import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  AI_CONSENT_HEADER,
  AI_ENDPOINTS,
  AI_PROVIDER,
  AI_SENDS,
  aiConsentDenied,
  aiConsentKey,
  aiKindForUrl,
  clearAiConsent,
  readAiConsent,
  writeAiConsent,
} from "./ai-consent";
import { aiOffAnswer } from "./ai-off-fallback";

function memory() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    map,
  };
}

test("only same-origin AI routes are gated", () => {
  const origin = "https://jobcommand.app";
  assert.equal(aiKindForUrl("/api/leads/parse", origin), "text");
  assert.equal(aiKindForUrl("/api/docs/parse", origin), "text");
  assert.equal(aiKindForUrl("/api/jobs/photos/analyze", origin), "photos");
  assert.equal(aiKindForUrl("https://jobcommand.app/api/jobs/voice", origin), "voice");
  assert.equal(aiKindForUrl("/api/setup/parse", origin), "setup");
  assert.equal(aiKindForUrl("/api/jobs/photos", origin), null);
  assert.equal(aiKindForUrl("/api/weather?address=x", origin), null);
  assert.equal(aiKindForUrl("https://evil.example/api/leads/parse", origin), null);
});

test("choice is stored per person per phone, and can be changed or cleared", () => {
  const store = memory();
  assert.equal(readAiConsent(store, "acct1"), null);
  writeAiConsent(store, "acct1", "granted", new Date("2026-10-02T12:00:00Z"));
  assert.equal(readAiConsent(store, "acct1")?.choice, "granted");
  assert.equal(readAiConsent(store, "acct2"), null, "another person on the same phone is asked again");
  writeAiConsent(store, "acct1", "denied");
  assert.equal(readAiConsent(store, "acct1")?.choice, "denied");
  clearAiConsent(store, "acct1");
  assert.equal(readAiConsent(store, "acct1"), null);
  store.setItem(aiConsentKey("acct3"), "{bad json");
  assert.equal(readAiConsent(store, "acct3"), null);
  assert.equal(aiConsentKey(null), "jc-ai-consent:v1:guest");
});

test("every server route that calls the AI is on the gated list", () => {
  const root = new URL("../app/api", import.meta.url).pathname;
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === "route.ts") {
        const source = readFileSync(full, "utf8");
        const usesAi = /generateText|transcribe\(|ingestSiteVoice/.test(source);
        if (usesAi) hits.push("/api/" + path.relative(root, path.dirname(full)).split(path.sep).join("/"));
      }
    }
  };
  walk(root);
  assert.ok(hits.length >= 4);
  for (const route of hits) assert.ok(AI_ENDPOINTS[route], `${route} calls the AI but is not gated`);
});

test("the screen names the provider and what is sent", () => {
  assert.equal(AI_PROVIDER, "OpenAI");
  assert.deepEqual(
    AI_SENDS.map((row) => row.kind),
    ["voice", "photos", "text"]
  );
  const sheet = readFileSync(new URL("../components/command/AiConsent.tsx", import.meta.url), "utf8");
  assert.match(sheet, /Allow/);
  assert.match(sheet, /Not now/);
  assert.match(sheet, /\/privacy/);
});

test("Not now answers on the phone, in each route's own no-AI shape", async () => {
  const lead = await aiOffAnswer("text", "/api/leads/parse", JSON.stringify({ text: "Maya Lopez 555 123 0100 fix the porch" }));
  assert.ok("clientName" in lead && "phone" in lead);
  const doc = (await aiOffAnswer("text", "/api/docs/parse", JSON.stringify({ text: "3 hours labor at 50" }))) as { lines: unknown[] };
  assert.ok(Array.isArray(doc.lines));
  assert.deepEqual(await aiOffAnswer("photos", "/api/jobs/photos/analyze", "{}"), { skipped: true, aiOff: true });
  assert.deepEqual(await aiOffAnswer("setup", "/api/setup/parse", "{}"), {});
  const form = new FormData();
  form.set("transcript", "two gallons primer at 40");
  const voice = (await aiOffAnswer("voice", "/api/jobs/voice", form)) as { transcript: string };
  assert.equal(voice.transcript, "two gallons primer at 40");
});

test("server routes can read the phone's answer", () => {
  assert.equal(aiConsentDenied(new Headers({ [AI_CONSENT_HEADER]: "denied" })), true);
  assert.equal(aiConsentDenied(new Headers({ [AI_CONSENT_HEADER]: "granted" })), false);
  assert.equal(aiConsentDenied(new Headers()), false);
});

test("gate wraps the app; Settings can review it (office Company page and crew home)", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /<AiConsentGate accountKey=/);
  const desk = readFileSync(new URL("../components/command/EmployeeWorkspace.tsx", import.meta.url), "utf8");
  assert.match(desk, /<AiPrivacySettings \/>/);
  const home = readFileSync(new URL("../components/command/EmployeeHome.tsx", import.meta.url), "utf8");
  assert.match(home, /<AiPrivacySettings \/>/);
});
