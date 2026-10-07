/**
 * The one mic, inside the iPhone app. iOS WKWebView has no working Web Speech
 * (webkitSpeechRecognition is missing or errors), so the app uses Apple's on-device
 * speech recognizer through @capacitor-community/speech-recognition, wrapped to look
 * exactly like the Web Speech object OneMic already drives. The website keeps Web Speech.
 */

export type SpeechResultLike = ArrayLike<{ transcript: string }> & { isFinal?: boolean };

/** Same shape OneMic uses for window.SpeechRecognition. */
export type SpeechRecLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<SpeechResultLike> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event?: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
};

type Handle = { remove: () => Promise<void> };
type PermissionState = "granted" | "denied" | "prompt" | "prompt-with-rationale";

/** The parts of the plugin we use (matches @capacitor-community/speech-recognition v7). */
export type NativeSpeechPlugin = {
  available(): Promise<{ available: boolean }>;
  checkPermissions(): Promise<{ speechRecognition: PermissionState }>;
  requestPermissions(): Promise<{ speechRecognition: PermissionState }>;
  start(options?: { language?: string; maxResults?: number; partialResults?: boolean; popup?: boolean }): Promise<{ matches?: string[] }>;
  stop(): Promise<void>;
  addListener(eventName: "partialResults", fn: (data: { matches: string[] }) => void): Promise<Handle>;
  addListener(eventName: "listeningState", fn: (data: { status: "started" | "stopped" }) => void): Promise<Handle>;
};

/** How long to wait for Apple's last partial result after Stop before ending. */
export const NATIVE_STOP_GRACE_MS = 450;

export function nativeSpeechAdapter(
  plugin: NativeSpeechPlugin,
  timers: { set: (fn: () => void, ms: number) => unknown } = { set: (fn, ms) => setTimeout(fn, ms) }
): SpeechRecLike {
  let handles: Handle[] = [];
  let ended = true;
  let started = false;
  let stopping = false;

  const rec: SpeechRecLike = {
    lang: "en-US",
    continuous: true,
    interimResults: true,
    onresult: null,
    onend: null,
    onerror: null,
    start() {
      ended = false;
      started = false;
      stopping = false;
      void run();
    },
    stop() {
      if (ended) return;
      stopping = true;
      if (!started) return; // run() sees `stopping` and ends cleanly
      plugin
        .stop()
        .catch(() => undefined)
        .finally(() => timers.set(end, NATIVE_STOP_GRACE_MS));
    },
  };

  function end() {
    if (ended) return;
    ended = true;
    const old = handles;
    handles = [];
    for (const h of old) void h.remove().catch(() => undefined);
    rec.onend?.();
  }

  function fail(error: string) {
    rec.onerror?.({ error });
    end();
  }

  async function run() {
    try {
      const { available } = await plugin.available();
      if (!available) return fail("service-not-allowed");
      let perm = await plugin.checkPermissions();
      if (perm.speechRecognition !== "granted") perm = await plugin.requestPermissions();
      if (perm.speechRecognition !== "granted") return fail("not-allowed");
      if (stopping) return end();
      handles.push(
        await plugin.addListener("partialResults", (data) => {
          // iOS sends the whole utterance so far each time, not just the new words.
          const text = String(data?.matches?.[0] || "").trim();
          if (!text || ended) return;
          const row = Object.assign([{ transcript: text }], { isFinal: false });
          rec.onresult?.({ results: [row] });
        })
      );
      handles.push(
        await plugin.addListener("listeningState", (data) => {
          if (data?.status === "stopped") timers.set(end, stopping ? NATIVE_STOP_GRACE_MS : 0);
        })
      );
      await plugin.start({ language: rec.lang || "en-US", maxResults: 1, partialResults: true, popup: false });
      started = true;
      if (stopping) {
        await plugin.stop().catch(() => undefined);
        timers.set(end, NATIVE_STOP_GRACE_MS);
      }
    } catch {
      fail("aborted");
    }
  }

  return rec;
}
