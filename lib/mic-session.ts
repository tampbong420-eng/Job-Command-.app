/**
 * One listening session of the one mic, with a guaranteed end.
 *
 * Why: the mic used to wait for the speech engine's `onend` before it showed "not listening".
 * iPhone Safari/Chrome (WebKit) sometimes never fires `onend` (after stop(), after a blocked mic,
 * when the page is hidden), so the button stayed on "Listening…" and later taps did nothing.
 *
 * Rules here:
 *  - `stop()` (a tap, release, Done, Cancel) resets right away: it calls the engine's stop() and
 *    abort() and finishes immediately. It never waits for `onend`.
 *  - An engine error finishes too (WebKit may send `onerror` with no `onend`).
 *  - Hard cap: after `maxMs` (60 s) it stops by itself.
 *  - `onFinish` runs exactly once, whatever fires first. Late engine events are ignored.
 */

export const MIC_MAX_LISTEN_MS = 60_000;

export type MicEngine = {
  onend: (() => void) | null;
  onerror: ((event?: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

export type MicTimers = {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};

export type MicEndReason = "stopped" | "ended" | "error" | "timeout" | "start-failed";

export type MicSession = {
  /** Starts the engine. False if it threw (already finished with "start-failed"). */
  start: () => boolean;
  /** User stop: reset now, never wait on the engine. Safe to call any number of times. */
  stop: () => void;
  readonly done: boolean;
};

const realTimers: MicTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createMicSession(
  engine: MicEngine,
  opts: {
    onFinish: (reason: MicEndReason) => void;
    onError?: (error: string | undefined) => void;
    maxMs?: number;
    timers?: MicTimers;
  }
): MicSession {
  const timers = opts.timers || realTimers;
  const maxMs = opts.maxMs ?? MIC_MAX_LISTEN_MS;
  let done = false;
  let maxTimer: unknown = null;

  function quiet() {
    try {
      engine.stop();
    } catch {
      /* already stopped */
    }
    try {
      engine.abort?.();
    } catch {
      /* not supported or already gone */
    }
  }

  function finish(reason: MicEndReason) {
    if (done) return;
    done = true;
    if (maxTimer !== null) timers.clear(maxTimer);
    maxTimer = null;
    // Late onend/onerror from the engine must not run anything again.
    engine.onend = null;
    engine.onerror = null;
    opts.onFinish(reason);
  }

  engine.onend = () => finish("ended");
  engine.onerror = (event) => {
    opts.onError?.(event?.error);
    // WebKit can send an error and then never send onend: end now, and make sure the mic is let go.
    if (!done) quiet();
    finish("error");
  };

  return {
    start() {
      if (done) return false;
      try {
        engine.start();
      } catch {
        quiet();
        finish("start-failed");
        return false;
      }
      if (!done) {
        maxTimer = timers.set(() => {
          maxTimer = null;
          if (done) return;
          quiet();
          finish("timeout");
        }, maxMs);
      }
      return !done;
    },
    stop() {
      if (done) return;
      quiet();
      finish("stopped");
    },
    get done() {
      return done;
    },
  };
}

/** Stop anything the app is reading aloud. Called when the page loads and every time the mic starts. */
export function hushSpeech(root: { speechSynthesis?: { cancel: () => void } } | undefined = typeof window === "undefined" ? undefined : window) {
  try {
    root?.speechSynthesis?.cancel();
  } catch {
    /* no speech on this phone */
  }
  try {
    // Stop ElevenLabs audio too (stored on window by hooks/use-voice).
    const w = typeof window === "undefined" ? undefined : (window as unknown as { __jcTtsAudio?: HTMLAudioElement | null });
    w?.__jcTtsAudio?.pause();
    if (w) w.__jcTtsAudio = null;
  } catch {
    /* no-op */
  }
}
