import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { nativeSpeechAdapter, type NativeSpeechPlugin } from "./native-speech";
import {
  apnsConfigFrom,
  apnsJwt,
  apnsPayload,
  cleanNativeToken,
  isNativeEndpoint,
  nativeEndpoint,
  parseNativeEndpoint,
  safeTapPath,
} from "./push-native-core";

const tick = () => new Promise((r) => setImmediate(r));
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

function fakePlugin(opts: { available?: boolean; perm?: "granted" | "denied"; askTo?: "granted" | "denied" } = {}) {
  const listeners: Record<string, (data: never) => void> = {};
  const calls: string[] = [];
  let removed = 0;
  const plugin: NativeSpeechPlugin = {
    available: async () => ({ available: opts.available ?? true }),
    checkPermissions: async () => ({ speechRecognition: opts.perm ?? "granted" }),
    requestPermissions: async () => {
      calls.push("request");
      return { speechRecognition: opts.askTo ?? "granted" };
    },
    start: async (o) => {
      calls.push(`start:${o?.language}:${o?.partialResults}`);
      return {};
    },
    stop: async () => {
      calls.push("stop");
    },
    addListener: (async (name: string, fn: (data: never) => void) => {
      listeners[name] = fn;
      return { remove: async () => void (removed += 1) };
    }) as NativeSpeechPlugin["addListener"],
  };
  return { plugin, listeners, calls, removed: () => removed };
}
const now = { set: (fn: () => void) => fn() };

test("iPhone mic: native recognizer looks like Web Speech to the one mic", async () => {
  const f = fakePlugin();
  const rec = nativeSpeechAdapter(f.plugin, now);
  const heard: string[] = [];
  let ended = 0;
  rec.onresult = (e) => heard.push(e.results[0][0].transcript);
  rec.onend = () => (ended += 1);
  rec.start();
  for (let i = 0; i < 6; i++) await tick();
  assert.deepEqual(f.calls, ["start:en-US:true"]);
  // iOS sends the whole utterance so far each time.
  (f.listeners.partialResults as (d: { matches: string[] }) => void)({ matches: ["two coats"] });
  (f.listeners.partialResults as (d: { matches: string[] }) => void)({ matches: ["two coats on the trim"] });
  assert.deepEqual(heard, ["two coats", "two coats on the trim"]);
  rec.stop();
  for (let i = 0; i < 4; i++) await tick();
  assert.equal(ended, 1);
  assert.ok(f.calls.includes("stop"));
  assert.equal(f.removed(), 2, "listeners removed after the take");
  (f.listeners.listeningState as (d: { status: string }) => void)({ status: "stopped" });
  assert.equal(ended, 1, "onend fires once");
});

test("iPhone mic: asks for permission once, says 'not-allowed' when refused", async () => {
  const f = fakePlugin({ perm: "denied", askTo: "denied" });
  const rec = nativeSpeechAdapter(f.plugin, now);
  const errors: string[] = [];
  let ended = 0;
  rec.onerror = (e) => errors.push(String(e?.error));
  rec.onend = () => (ended += 1);
  rec.start();
  for (let i = 0; i < 6; i++) await tick();
  assert.deepEqual(errors, ["not-allowed"]);
  assert.equal(ended, 1);
  assert.deepEqual(f.calls, ["request"]);
});

test("iPhone mic: no recognizer on this phone ends cleanly", async () => {
  const f = fakePlugin({ available: false });
  const rec = nativeSpeechAdapter(f.plugin, now);
  const errors: string[] = [];
  rec.onerror = (e) => errors.push(String(e?.error));
  rec.start();
  for (let i = 0; i < 6; i++) await tick();
  assert.deepEqual(errors, ["service-not-allowed"]);
});

test("one mic only: OneMic picks the native engine first, then Web Speech", () => {
  const mic = read("components/command/OneMic.tsx");
  const body = mic.slice(mic.indexOf("function speechEngine()"), mic.indexOf("function transcriptOf"));
  assert.ok(body.indexOf("nativeSpeechEngine()") < body.indexOf("webkitSpeechRecognition"));
  const engine = read("lib/native-speech-engine.ts");
  assert.match(engine, /hasNativePlugin\("SpeechRecognition"\)/);
});

test("native push tokens ride in PushDevice without a migration", () => {
  assert.equal(nativeEndpoint("ios", "ab"), "native:ios:ab");
  assert.deepEqual(parseNativeEndpoint("native:ios:abc"), { platform: "ios", token: "abc" });
  assert.equal(parseNativeEndpoint("https://fcm.googleapis.com/x"), null);
  assert.equal(isNativeEndpoint("https://web.push.apple.com/x"), false);
  const hex = "A".repeat(64);
  assert.deepEqual(cleanNativeToken("ios", hex), { platform: "ios", token: "a".repeat(64) });
  assert.equal(cleanNativeToken("ios", "not hex!"), null);
  assert.equal(cleanNativeToken("web", hex), null);
  const push = read("lib/push.ts");
  assert.match(push, /filter\(\(device\) => !isNativeEndpoint\(device\.endpoint\)\)/);
  const route = read("app/api/push/native/route.ts");
  assert.match(route, /getLiveSession\(\)/);
  assert.match(route, /session\.role === "ADMIN"/);
  assert.doesNotMatch(route, /body\.role/);
});

test("APNs sender stays off until Eric's key is in env; JWT is a valid ES256 token", () => {
  assert.equal(apnsConfigFrom({}), null);
  assert.equal(apnsConfigFrom({ APNS_KEY_ID: "K", APNS_TEAM_ID: "T" }), null);
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const cfg = apnsConfigFrom({ APNS_KEY_ID: "KEY123", APNS_TEAM_ID: "TEAM45", APNS_PRIVATE_KEY: pem.replace(/\n/g, "\\n"), APNS_ENV: "development" });
  assert.ok(cfg);
  assert.equal(cfg!.host, "api.sandbox.push.apple.com");
  assert.equal(cfg!.bundleId, "app.jobcommand.shop");
  const jwt = apnsJwt(cfg!, 1_760_000_000);
  const [h, b, s] = jwt.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(h, "base64url").toString()), { alg: "ES256", kid: "KEY123" });
  assert.deepEqual(JSON.parse(Buffer.from(b, "base64url").toString()), { iss: "TEAM45", iat: 1_760_000_000 });
  assert.ok(verify("sha256", Buffer.from(`${h}.${b}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url")));
  const payload = apnsPayload({ title: "Signed", body: "EST-1", href: "https://evil.example/x" });
  assert.equal(payload.href, "/");
  assert.equal(payload.aps.sound, "default");
  assert.equal(safeTapPath("/?job=1"), "/?job=1");
  assert.equal(safeTapPath("//evil"), "/");
});
