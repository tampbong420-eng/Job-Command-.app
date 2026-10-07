import test from "node:test";
import assert from "node:assert/strict";
import { createMicSession, hushSpeech, MIC_MAX_LISTEN_MS, type MicEngine, type MicEndReason, type MicTimers } from "./mic-session";

/** A speech engine like iPhone WebKit on a bad day: stop() does nothing visible and onend never comes. */
function deafEngine(opts: { abort?: boolean; startThrows?: boolean } = {}) {
  const calls: string[] = [];
  const engine: MicEngine = {
    onend: null,
    onerror: null,
    start: () => {
      calls.push("start");
      if (opts.startThrows) throw new Error("not allowed");
    },
    stop: () => void calls.push("stop"),
  };
  if (opts.abort !== false) engine.abort = () => void calls.push("abort");
  return { engine, calls };
}

function fakeTimers() {
  let now = 0;
  let next = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  const timers: MicTimers = {
    set: (fn, ms) => {
      const id = next++;
      pending.set(id, { at: now + ms, fn });
      return id;
    },
    clear: (id) => void pending.delete(id as number),
  };
  const advance = (ms: number) => {
    now += ms;
    for (const [id, t] of [...pending]) {
      if (t.at <= now) {
        pending.delete(id);
        t.fn();
      }
    }
  };
  return { timers, advance, pending };
}

function session(engine: MicEngine, timers = fakeTimers().timers) {
  const ends: MicEndReason[] = [];
  const errors: (string | undefined)[] = [];
  const s = createMicSession(engine, { onFinish: (r) => ends.push(r), onError: (e) => errors.push(e), timers });
  return { s, ends, errors };
}

test("stop resets right away even when the engine never fires onend (WebKit)", () => {
  const { engine, calls } = deafEngine();
  const { s, ends } = session(engine);
  assert.equal(s.start(), true);
  s.stop();
  assert.deepEqual(ends, ["stopped"]);
  assert.equal(s.done, true);
  assert.deepEqual(calls, ["start", "stop", "abort"]);
});

test("stop works on engines with no abort()", () => {
  const { engine, calls } = deafEngine({ abort: false });
  const { s, ends } = session(engine);
  s.start();
  s.stop();
  assert.deepEqual(ends, ["stopped"]);
  assert.deepEqual(calls, ["start", "stop"]);
});

test("tapping stop again and again is harmless; finish runs once", () => {
  const { engine } = deafEngine();
  const { s, ends } = session(engine);
  s.start();
  s.stop();
  s.stop();
  s.stop();
  assert.deepEqual(ends, ["stopped"]);
});

test("a late onend after stop does not finish twice", () => {
  const { engine } = deafEngine();
  const onend = () => engine.onend?.();
  const { s, ends } = session(engine);
  s.start();
  s.stop();
  onend();
  assert.deepEqual(ends, ["stopped"]);
  assert.equal(engine.onend, null);
});

test("normal engine end finishes once", () => {
  const { engine } = deafEngine();
  const { s, ends } = session(engine);
  s.start();
  engine.onend?.();
  s.stop();
  assert.deepEqual(ends, ["ended"]);
});

test("blocked mic error with no onend still resets and lets go of the mic", () => {
  const { engine, calls } = deafEngine();
  const { s, ends, errors } = session(engine);
  s.start();
  engine.onerror?.({ error: "not-allowed" });
  assert.deepEqual(errors, ["not-allowed"]);
  assert.deepEqual(ends, ["error"]);
  assert.ok(calls.includes("abort"));
  engine.onend?.(); // already detached; nothing happens
  assert.deepEqual(ends, ["error"]);
});

test("start that throws ends at once and reports false", () => {
  const { engine } = deafEngine({ startThrows: true });
  const { s, ends } = session(engine);
  assert.equal(s.start(), false);
  assert.deepEqual(ends, ["start-failed"]);
});

test("60 second cap stops a mic that was never stopped", () => {
  const t = fakeTimers();
  const { engine, calls } = deafEngine();
  const { s, ends } = session(engine, t.timers);
  s.start();
  t.advance(MIC_MAX_LISTEN_MS - 1);
  assert.deepEqual(ends, []);
  t.advance(1);
  assert.deepEqual(ends, ["timeout"]);
  assert.ok(calls.includes("stop") && calls.includes("abort"));
  assert.equal(MIC_MAX_LISTEN_MS, 60_000);
});

test("stopping clears the 60 second timer", () => {
  const t = fakeTimers();
  const { engine } = deafEngine();
  const { s, ends } = session(engine, t.timers);
  s.start();
  s.stop();
  assert.equal(t.pending.size, 0);
  t.advance(MIC_MAX_LISTEN_MS * 2);
  assert.deepEqual(ends, ["stopped"]);
});

test("OneMic never waits on onend: taps stop on the press, the bar stops too", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../components/command/OneMic.tsx", import.meta.url), "utf8");
  assert.match(src, /createMicSession\(engine/);
  assert.doesNotMatch(src, /engine\.onend\s*=\s*finish/);
  // press while listening stops on pointerdown
  assert.match(src, /if \(listening \|\| rec\.current\) \{[\s\S]{0,200}stopListening\(\);/);
  // the Listening bar takes taps and stops
  assert.match(src, /className="one-mic-listen"[\s\S]{0,300}pointerEvents: "auto"[\s\S]{0,200}onPointerDown=\{[\s\S]{0,80}stopListening\(\)/);
});

test("hushSpeech cancels read-aloud and never throws", () => {
  let cancels = 0;
  hushSpeech({ speechSynthesis: { cancel: () => void cancels++ } });
  assert.equal(cancels, 1);
  hushSpeech({});
  hushSpeech(undefined);
  hushSpeech({ speechSynthesis: { cancel: () => { throw new Error("nope"); } } });
});

test("no robot voice: coach and signup never read aloud; mic hushes speech on load and on start", async () => {
  const { readFile } = await import("node:fs/promises");
  const read = (p: string) => readFile(new URL(p, import.meta.url), "utf8");
  const coach = await read("../components/command/StageCoach.tsx");
  const setup = await read("../components/command/CompanySetup.tsx");
  const mic = await read("../components/command/OneMic.tsx");
  assert.doesNotMatch(coach, /\.speak\(/);
  assert.doesNotMatch(coach, /useVoice/);
  assert.doesNotMatch(setup, /\.speak\(/);
  assert.doesNotMatch(setup, /useVoice/);
  assert.ok((mic.match(/hushSpeech\(\)/g) || []).length >= 2);
  // Nothing restarts listening by itself, and nothing about listening is saved.
  assert.doesNotMatch(mic, /onend[^\n]*start\(/);
  assert.doesNotMatch(mic, /localStorage/);
});
