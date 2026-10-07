"use client";

/**
 * ONE mic for the whole app (Option 1, approved 2026-10-02).
 *
 *   - Lives in the top bar's right slot (`[data-one-mic-slot]`, Eric 2026-10-02). Screens without the top bar
 *     (signup) keep the round floating button bottom-right above the dock. Only one mic is ever shown.
 *   - Hold to talk (or tap once to start, tap again to stop).
 *   - A text box is selected → the words type into that box. A “Typing into: X” pill shows where.
 *   - Nothing selected → the AI helper sheet opens with confirm chips. Nothing saves until Confirm.
 *
 * Screens register what they can do with `useVoiceScope`. The top scope turns the words into chips.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, Lock, Mic, RotateCcw, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import {
  canDictate,
  fieldName,
  joinDictation,
  pickVoiceTarget,
  speechForField,
  type FieldFacts,
} from "@/lib/voice-target";
import { talkChips } from "@/lib/voice-actions";
import { micLift } from "@/lib/mic-spot";
import { isNativeApp } from "@/lib/native-app";
import { nativeSpeechEngine } from "@/lib/native-speech-engine";
import { createMicSession, hushSpeech, type MicSession } from "@/lib/mic-session";

export type MicChip = {
  id: string;
  label: string;
  /** Where it lands, e.g. “Materials”, “Hours · 8.0 hr today”. */
  dest: string;
  /** Set when this person isn’t allowed to do it. Shown, never run. */
  blocked?: string;
  run?: () => unknown | Promise<unknown>;
};

export type VoiceScope = {
  id: string;
  /** Short name for what the helper is working on: “Harbor Point HOA”. */
  label: string;
  /** Higher wins. Stage pages 10, open job folder 20, desk-wide fallback 0. */
  priority?: number;
  /** Two or three things to say, shown when the sheet is empty. */
  examples?: string[];
  propose: (text: string) => MicChip[];
};

type Registry = {
  add: (scope: VoiceScope) => () => void;
};

const MicContext = createContext<Registry | null>(null);

/** Tell the one mic what this screen can do. Pass null to sit out. */
export function useVoiceScope(scope: VoiceScope | null) {
  const registry = useContext(MicContext);
  const latest = useRef(scope);
  latest.current = scope;
  const id = scope?.id || "";
  const label = scope?.label || "";
  const priority = scope?.priority ?? 10;
  useEffect(() => {
    if (!registry || !id) return;
    return registry.add({
      id,
      label,
      priority,
      get examples() {
        return latest.current?.examples;
      },
      propose: (text) => latest.current?.propose(text) || [],
    });
  }, [registry, id, label, priority]);
}

/**
 * For screens that already understand a spoken line (lead card, bid, invoice lines, setup):
 * the helper shows one chip that hands the words to that screen’s parser, plus a camera chip.
 */
export function useTalkScope(
  input: {
    id: string;
    label: string;
    dest: string;
    examples?: string[];
    priority?: number;
    parse?: (text: string) => void;
    snap?: () => void;
    roll?: () => void;
  } | null
) {
  useVoiceScope(
    input && (input.parse || input.snap)
      ? {
          id: input.id,
          label: input.label,
          priority: input.priority ?? 10,
          examples: input.examples,
          propose: (text) =>
            talkChips(text, input.dest)
              .filter((chip) => (chip.kind === "parse" ? Boolean(input.parse) : Boolean(chip.kind === "roll" ? input.roll : input.snap)))
              .map((chip, index) => ({
                id: `${input.id}-${chip.kind}-${index}`,
                label: chip.label,
                dest: chip.dest,
                run: () => (chip.kind === "parse" ? input.parse?.(text) : chip.kind === "roll" ? input.roll?.() : input.snap?.()),
              })),
        }
      : null
  );
}

type SpeechResult = ArrayLike<{ transcript: string }> & { isFinal?: boolean };
type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<SpeechResult> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event?: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

/** One mic, two engines: Apple's recognizer inside the iPhone app (WKWebView has no Web Speech), Web Speech on the web. */
function speechEngine(): SpeechRec | null {
  if (typeof window === "undefined") return null;
  const native = nativeSpeechEngine();
  if (native) return native;
  const root = window as Window & {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  const Ctor = root.SpeechRecognition || root.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

function transcriptOf(results: ArrayLike<SpeechResult>) {
  const parts: string[] = [];
  for (let i = 0; i < results.length; i += 1) {
    const text = results[i]?.[0]?.transcript?.trim();
    if (text) parts.push(text);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

type Box = HTMLInputElement | HTMLTextAreaElement;

function factsOf(el: Element | null): FieldFacts | null {
  if (!el || !(el instanceof HTMLElement)) return null;
  const input = el as HTMLInputElement;
  return {
    tag: el.tagName,
    type: el.tagName === "INPUT" ? input.type : null,
    readOnly: Boolean(input.readOnly),
    disabled: Boolean(input.disabled),
    voice: el.dataset.voice || null,
    inputMode: el.getAttribute("inputmode"),
    contentEditable: false,
  };
}

function labelTextOf(el: HTMLElement) {
  const label = (el as HTMLInputElement).labels?.[0];
  if (!label) return "";
  const copy = label.cloneNode(true) as HTMLElement;
  copy.querySelectorAll("input,textarea,select,button,small").forEach((node) => node.remove());
  return copy.textContent || "";
}

function nameOf(el: HTMLElement) {
  return fieldName({
    voiceLabel: el.dataset.voiceLabel,
    ariaLabel: el.getAttribute("aria-label"),
    labelText: labelTextOf(el),
    placeholder: el.getAttribute("placeholder"),
    name: el.getAttribute("name"),
  });
}

/** React keeps its own copy of a box’s value; set it the way a keyboard would. */
function typeInto(el: Box, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  try {
    el.setSelectionRange(value.length, value.length);
  } catch {
    /* number-ish inputs don't support selection */
  }
}

type Sheet = {
  heard: string;
  listening: boolean;
  scope: VoiceScope | null;
  chips: MicChip[];
  picked: Record<string, boolean>;
  saving: boolean;
};

type Typing = { el: Box; name: string; base: string; numeric: boolean };

/** What the mic should not rest on: step/Next buttons first, then tags, chips and headings. */
const MARKS = '.sched-chip, .sched-stop-hrs, .sched-stops-head, .ja-card-head, .ja-st, h1, h2, h3, [class*="chip"], [class~="tag"], [class*="-tag"], [class*="tag-"], [class*="badge"]';
const AVOID = `.tumbler-step, button, ${MARKS}`;

function isStepButton(el: HTMLElement) {
  if (el.classList.contains("tumbler-step")) return true;
  if (el.tagName !== "BUTTON") return false;
  if (/(^|[-_\s])(primary|cta|next|finish|submit)([-_\s]|$)/i.test(el.className)) return true;
  const label = (el.getAttribute("aria-label") || el.textContent || "").trim();
  return /^(next|continue|finish|send|save|confirm|add\b|\+|＋|▶|›|→)/i.test(label) || /→\s*$/.test(label);
}

export function OneMicProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const scopes = useRef(new Map<string, VoiceScope & { order: number }>());
  const order = useRef(0);
  const [version, setVersion] = useState(0);
  const registry = useMemo<Registry>(
    () => ({
      add(scope) {
        order.current += 1;
        const key = `${scope.id}#${order.current}`;
        scopes.current.set(key, { ...scope, order: order.current, propose: scope.propose, get examples() {
          return scope.examples;
        } });
        setVersion((v) => v + 1);
        return () => {
          scopes.current.delete(key);
          setVersion((v) => v + 1);
        };
      },
    }),
    []
  );

  const ranked = useCallback(() => {
    return [...scopes.current.values()].sort((a, b) => (b.priority ?? 10) - (a.priority ?? 10) || b.order - a.order);
  }, []);

  return (
    <MicContext.Provider value={registry}>
      {children}
      {enabled ? <OneMicButton ranked={ranked} version={version} /> : null}
    </MicContext.Provider>
  );
}

function OneMicButton({ ranked, version }: { ranked: () => VoiceScope[]; version: number }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [dockGap, setDockGap] = useState(84);
  const [lift, setLift] = useState(0);
  const [listening, setListening] = useState(false);
  const [held, setHeld] = useState(false);
  const [typing, setTyping] = useState<Typing | null>(null);
  const [pill, setPill] = useState<{ top: number; left: number } | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const rec = useRef<MicSession | null>(null);
  /** The press that stopped a live mic; its release must not do anything else. */
  const stoppedOnDown = useRef(false);
  const pressAt = useRef(0);
  const holdMode = useRef(false);
  const lastBox = useRef<{ el: HTMLElement; at: number | null }>({ el: null as unknown as HTMLElement, at: null });
  const heardRef = useRef("");

  // Find the app shell + dock so the mic sits in the same spot above the dock on every screen.
  useEffect(() => {
    let raf = 0;
    const find = () => {
      const shell = document.querySelector<HTMLElement>(".app-shell");
      setHost((current) => (current === shell ? current : shell));
      const bar = shell?.querySelector<HTMLElement>("[data-one-mic-slot]") || null;
      setSlot((current) => (current === bar ? current : bar));
      const dock = shell?.querySelector<HTMLElement>(".dock");
      const h = dock ? dock.getBoundingClientRect().height : 0;
      setDockGap(Math.round((h || 0) + 14));
    };
    find();
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(find);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", find);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("resize", find);
    };
  }, []);

  // Remember the last text box, so a tap that steals focus still types where they were.
  useEffect(() => {
    const onIn = (event: FocusEvent) => {
      const el = event.target as HTMLElement;
      if (el && canDictate(factsOf(el))) lastBox.current = { el, at: null };
    };
    const onOut = (event: FocusEvent) => {
      if (event.target === lastBox.current.el) lastBox.current = { el: lastBox.current.el, at: Date.now() };
    };
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
    };
  }, []);

  // Mic is always off on load (nothing saved can turn it back on) and nothing is being read aloud.
  useEffect(() => {
    hushSpeech();
    return () => rec.current?.stop();
  }, []);

  // iPhone ends speech without telling us when the page is hidden; let go of the mic and reset.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") rec.current?.stop();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  // Tell the page to leave room at the bottom so the round mic never sits on a Next/Save button.
  useEffect(() => {
    if (!host || slot) return;
    host.setAttribute("data-one-mic-room", "1");
    return () => host.removeAttribute("data-one-mic-room");
  }, [host, slot]);

  // When the mic is raised above a pinned bar, the page needs that much more room so its last items still clear it.
  useEffect(() => {
    if (!host) return;
    host.style.setProperty("--one-mic-lift", `${lift}px`);
    return () => {
      host.style.removeProperty("--one-mic-lift");
    };
  }, [host, lift]);

  // When the page comes to rest with a Next/step button, a tag, or a heading under the mic, slide the mic up
  // just clear of it (only if the new spot is clear too). Bottom padding lets the last items scroll clear.
  useEffect(() => {
    if (!host) return;
    if (slot) {
      setLift(0);
      return;
    }
    let raf = 0;
    let timer = 0;
    const measure = () => {
      const shell = host.getBoundingClientRect();
      const size = 68 + 10; // button + its dark ring
      const base = { left: shell.right - 16 - size + 5, right: shell.right - 16 + 5, bottom: shell.bottom - dockGap + 5, top: shell.bottom - dockGap - size + 5 };
      const steps: DOMRect[] = [];
      const marks: DOMRect[] = [];
      for (const el of host.querySelectorAll<HTMLElement>(AVOID)) {
        if (el.closest("[data-one-mic], [data-one-mic-sheet], .one-mic-listen, .one-mic-pill, .dock, .ja-bar")) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || r.bottom <= shell.top + 60 || r.top >= base.bottom || r.right <= base.left) continue;
        // Small step buttons (▶) and pinned bars must be cleared; a wide in-flow button only loses its far end, so
        // it's avoided like a tag (only when a clear spot is close).
        const pinned = /sticky|fixed/.test(getComputedStyle(el).position);
        if (isStepButton(el) && (pinned || r.width < 160)) steps.push(r);
        else if ((isStepButton(el) || el.matches(MARKS)) && r.height <= 64) marks.push(r);
      }
      setLift((current) => {
        const next = micLift(base, steps, marks);
        return current === next ? current : next;
      });
    };
    const soon = () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        raf = requestAnimationFrame(measure);
      }, 140);
    };
    measure();
    const observer = new MutationObserver(soon);
    observer.observe(host, { childList: true, subtree: true, characterData: true });
    host.addEventListener("scroll", soon, true);
    window.addEventListener("resize", soon);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      observer.disconnect();
      host.removeEventListener("scroll", soon, true);
      window.removeEventListener("resize", soon);
    };
  }, [host, dockGap, slot]);

  // Keep the “Typing into” pill pinned just above the box while we type.
  useEffect(() => {
    if (!typing || !host) {
      setPill(null);
      return;
    }
    let raf = 0;
    const place = () => {
      const box = typing.el.getBoundingClientRect();
      const shell = host.getBoundingClientRect();
      setPill({ top: Math.max(8, box.top - shell.top - 44), left: Math.max(10, Math.min(box.left - shell.left, shell.width - 230)) });
      raf = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(raf);
  }, [typing, host]);

  function proposeFor(text: string): { scope: VoiceScope | null; chips: MicChip[] } {
    const list = ranked();
    for (const scope of list) {
      const chips = scope.propose(text);
      if (chips.length) return { scope, chips };
    }
    return { scope: list[0] || null, chips: [] };
  }

  function pickChecks(chips: MicChip[]) {
    return Object.fromEntries(chips.map((chip) => [chip.id, !chip.blocked]));
  }

  function openSheet(heard: string, live: boolean) {
    const top = ranked()[0] || null;
    setSheet({ heard, listening: live, scope: top, chips: [], picked: {}, saving: false });
  }

  function refreshChips(heard: string) {
    const { scope, chips } = proposeFor(heard);
    setSheet((current) =>
      current ? { ...current, heard, listening: false, scope: scope || current.scope, chips, picked: pickChecks(chips) } : current
    );
  }

  /** Always resets on the spot: never waits for the engine's onend (WebKit may never send it). */
  function stopListening() {
    if (rec.current) rec.current.stop();
    else {
      // Nothing live but the screen still says listening: clear it.
      setListening(false);
      setHeld(false);
      setSheet((current) => (current?.listening ? { ...current, listening: false } : current));
    }
  }

  function begin(mode: "field" | "helper", target?: Box) {
    const engine = speechEngine();
    if (!engine) {
      if (mode === "field") {
        toast.error("This phone can’t hear here. Type it in the box instead.");
      } else {
        openSheet("", false);
      }
      return false;
    }
    rec.current?.stop();
    rec.current = null;
    hushSpeech(); // never talk over the mic
    heardRef.current = "";
    engine.lang = "en-US";
    engine.continuous = true;
    engine.interimResults = true;
    let typingNow: Typing | null = null;
    if (mode === "field" && target) {
      const numeric = ["decimal", "numeric"].includes(target.getAttribute("inputmode") || "") || target.type === "number";
      typingNow = { el: target, name: nameOf(target), base: target.value, numeric };
      setTyping(typingNow);
      target.classList.add("mic-target");
      target.focus({ preventScroll: true });
    } else {
      openSheet("", true);
    }
    engine.onresult = (event) => {
      const heard = transcriptOf(event.results);
      heardRef.current = heard;
      if (typingNow) {
        const words = typingNow.numeric ? speechForField(heard, "decimal") : heard;
        typeInto(typingNow.el, typingNow.numeric ? words || typingNow.base : joinDictation(typingNow.base, words));
      } else {
        setSheet((current) => (current ? { ...current, heard } : current));
      }
    };
    const finish = () => {
      setListening(false);
      setHeld(false);
      if (rec.current === session) rec.current = null;
      if (typingNow) {
        typingNow.el.classList.remove("mic-target");
        typingNow.el.dispatchEvent(new Event("change", { bubbles: true }));
        const el = typingNow.el;
        window.setTimeout(() => setTyping((current) => (current?.el === el ? null : current)), 900);
      } else {
        refreshChips(heardRef.current);
      }
    };
    const session: MicSession = createMicSession(engine, {
      onFinish: finish,
      onError: (error) => {
        if (error === "not-allowed" || error === "audio-capture") {
          toast.error(
            isNativeApp()
              ? "Mic is off for jobcommand.app. Turn on Microphone and Speech Recognition in iPhone Settings › jobcommand.app, or type it."
              : "Mic is blocked. Allow the microphone for this site, or type it."
          );
        } else if (error === "service-not-allowed") {
          toast.error("Speech isn’t available on this phone right now. Type it in the box instead.");
        }
      },
    });
    rec.current = session;
    setListening(true);
    return session.start();
  }

  function targetNow(): Box | null {
    const active = document.activeElement as HTMLElement | null;
    const recent = lastBox.current;
    const picked = pickVoiceTarget<HTMLElement>({
      active,
      activeOk: Boolean(active && active !== document.body && canDictate(factsOf(active))),
      recent: recent.el && recent.el.isConnected ? recent.el : null,
      recentOk: Boolean(recent.el && recent.el.isConnected && canDictate(factsOf(recent.el))),
      blurredAgoMs: recent.at === null ? (recent.el === active ? 0 : null) : Date.now() - recent.at,
    });
    return picked.mode === "field" ? (picked.field as Box) : null;
  }

  function onDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.preventDefault(); // keep the text box selected
    pressAt.current = Date.now();
    if (listening || rec.current) {
      // Tap while listening = stop, right on the press (don't count on the release arriving).
      holdMode.current = false;
      stoppedOnDown.current = true;
      stopListening();
      return;
    }
    stoppedOnDown.current = false;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* fine */
    }
    holdMode.current = true;
    setHeld(true);
    const target = targetNow();
    begin(target ? "field" : "helper", target || undefined);
  }

  function onUp() {
    const quick = Date.now() - pressAt.current < 380;
    if (stoppedOnDown.current) {
      stoppedOnDown.current = false;
      return;
    }
    if (!holdMode.current) return;
    holdMode.current = false;
    setHeld(false);
    if (quick) return; // tap: keep listening until tapped again
    stopListening();
  }

  async function confirm() {
    if (!sheet) return;
    const chosen = sheet.chips.filter((chip) => sheet.picked[chip.id] && !chip.blocked);
    if (!chosen.length) {
      setSheet(null);
      return;
    }
    setSheet({ ...sheet, saving: true });
    let done = 0;
    for (const chip of chosen) {
      try {
        await chip.run?.();
        done += 1;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : `Couldn’t save: ${chip.label}`);
      }
    }
    if (done) toast.success(done === 1 ? "Saved 1 thing." : `Saved ${done} things.`);
    setSheet(null);
  }

  const visible = Boolean(host);
  if (!visible || !host) return null;
  void version;
  const chosenCount = sheet ? sheet.chips.filter((chip) => sheet.picked[chip.id] && !chip.blocked).length : 0;
  const examples = sheet?.scope?.examples?.length
    ? sheet.scope.examples
    : ["Change Jordan’s hours to 6"];

  const fab = (
    <button
      type="button"
      className={`one-mic-fab${listening ? " listening" : ""}${slot ? " in-bar" : ""}`}
      style={slot ? undefined : { bottom: dockGap + lift }}
      aria-label={listening ? "Stop listening" : "Talk. Hold to talk, or tap to start"}
      aria-pressed={listening}
      data-one-mic
      data-no-swipe
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onMouseDown={(event) => event.preventDefault()}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (listening || rec.current) stopListening();
        else {
          const target = targetNow();
          begin(target ? "field" : "helper", target || undefined);
        }
      }}
    >
      <Mic aria-hidden />
    </button>
  );

  return (
    <>
      {!sheet && slot ? createPortal(fab, slot) : null}
      {createPortal(
    <>
      {typing && pill ? (
        <div className="one-mic-pill" style={{ top: pill.top, left: pill.left }} role="status" aria-live="polite">
          <i aria-hidden /> Typing into: {typing.name}
        </div>
      ) : null}
      {listening && !sheet ? (
        <div
          className="one-mic-listen"
          style={{ bottom: dockGap + lift + 4, right: slot ? 14 : undefined, pointerEvents: "auto", cursor: "pointer" }}
          role="status"
          aria-live="polite"
          data-no-swipe
          onPointerDown={(event) => {
            event.preventDefault();
            stopListening();
          }}
        >
          <span className="one-mic-wave" aria-hidden>
            {Array.from({ length: 9 }, (_, i) => (
              <b key={i} style={{ animationDelay: `${(i % 5) * 90}ms` }} />
            ))}
          </span>
          <span>
            <b>Listening…</b>
            <small>{held ? "Let go to stop" : "Tap here or the mic to stop"}</small>
          </span>
        </div>
      ) : null}
      {sheet ? (
        <div className="one-mic-scrim" onClick={() => !sheet.listening && setSheet(null)}>
          <section
            className="one-mic-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="AI helper"
            data-one-mic-sheet
            onClick={(event) => event.stopPropagation()}
          >
            <i className="one-mic-grip" aria-hidden />
            <header>
              <span className="one-mic-badge" aria-hidden>
                <Mic />
              </span>
              <h2>AI helper</h2>
              <small>{sheet.scope?.label || "No box selected"}</small>
            </header>
            <label className="one-mic-said">
              <span>{sheet.listening ? "Listening… say it now" : "You said (fix any words here)"}</span>
              <textarea
                value={sheet.heard}
                rows={2}
                data-voice="off"
                data-no-swipe
                placeholder={sheet.listening ? "…" : `Try: “${examples[0]}”`}
                onChange={(event) => {
                  const heard = event.target.value;
                  setSheet((current) => (current ? { ...current, heard } : current));
                }}
                onBlur={() => !sheet.listening && refreshChips(sheet.heard)}
              />
            </label>
            {sheet.listening ? (
              <button type="button" className="one-mic-wide" onClick={stopListening}>
                <span className="one-mic-wave small" aria-hidden>
                  {Array.from({ length: 7 }, (_, i) => (
                    <b key={i} style={{ animationDelay: `${(i % 4) * 90}ms` }} />
                  ))}
                </span>
                Done talking
              </button>
            ) : sheet.chips.length ? (
              <>
                <p className="one-mic-count">
                  I’ll do {sheet.chips.filter((chip) => !chip.blocked).length === 1 ? "1 thing" : `${sheet.chips.filter((chip) => !chip.blocked).length} things`} — tap to change
                </p>
                <ul className="one-mic-chips" aria-live="polite">
                  {sheet.chips.map((chip) => {
                    const on = Boolean(sheet.picked[chip.id]) && !chip.blocked;
                    return (
                      <li key={chip.id}>
                        <button
                          type="button"
                          className={`one-mic-chip${on ? " on" : ""}${chip.blocked ? " blocked" : ""}`}
                          role="checkbox"
                          aria-checked={on}
                          aria-disabled={chip.blocked ? true : undefined}
                          onClick={() =>
                            !chip.blocked &&
                            setSheet((current) =>
                              current ? { ...current, picked: { ...current.picked, [chip.id]: !current.picked[chip.id] } } : current
                            )
                          }
                        >
                          <span className="one-mic-check" aria-hidden>
                            {chip.blocked ? <Lock /> : on ? <Check /> : null}
                          </span>
                          <span className="one-mic-chip-text">
                            <b>{chip.label}</b>
                            <em>→ {chip.dest}</em>
                            {chip.blocked ? <small>{chip.blocked}</small> : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <div className="one-mic-empty">
                <p>{sheet.heard.trim() ? "I didn’t catch something to do. Fix the words above, or try:" : "Say what happened, in your own words. Like:"}</p>
                <ul>
                  {examples.slice(0, 3).map((line) => (
                    <li key={line}>
                      <Sparkles aria-hidden /> “{line}”
                    </li>
                  ))}
                </ul>
                {sheet.heard.trim() ? (
                  <button type="button" className="one-mic-wide ghost" onClick={() => refreshChips(sheet.heard)}>
                    <RotateCcw aria-hidden /> Read it again
                  </button>
                ) : null}
              </div>
            )}
            <div className="one-mic-actions">
              <button type="button" className="one-mic-cancel" onClick={() => (sheet.listening ? (stopListening(), setSheet(null)) : setSheet(null))}>
                <X aria-hidden /> Cancel
              </button>
              <button
                type="button"
                className="one-mic-confirm"
                disabled={sheet.listening || sheet.saving || !chosenCount}
                onClick={() => void confirm()}
              >
                <Check aria-hidden /> {sheet.saving ? "Saving…" : chosenCount ? `Confirm ${chosenCount}` : "Confirm"}
              </button>
            </div>
            <p className="one-mic-foot">Nothing saves until you confirm</p>
          </section>
        </div>
      ) : null}
      {!sheet && !slot ? fab : null}
    </>,
    host
      )}
    </>
  );
}
