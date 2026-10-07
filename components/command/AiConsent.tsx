"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AI_CONSENT_EVENT,
  AI_CONSENT_HEADER,
  AI_NEVER_SENDS,
  AI_PROVIDER,
  AI_PROVIDER_DETAIL,
  AI_SENDS,
  AI_USE_LINE,
  AI_WITHOUT_LINE,
  aiKindForUrl,
  readAiConsent,
  writeAiConsent,
  type AiChoice,
  type AiKind,
} from "@/lib/ai-consent";
import { aiOffAnswer } from "@/lib/ai-off-fallback";
import styles from "./AiConsent.module.css";

type Ctx = { accountKey: string; choice: AiChoice | null; set: (choice: AiChoice) => void; review: () => void };
const AiConsentContext = createContext<Ctx | null>(null);

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * One-time AI permission. Wraps fetch for the AI routes only (lib/ai-consent AI_ENDPOINTS): the first time
 * voice, a photo, or typed notes would go to the AI, the screen asks. Allow → the request goes out with
 * x-jc-ai-consent: granted. Not now → it never leaves the phone; the on-phone parser answers instead.
 */
export function AiConsentGate({ accountKey, children }: { accountKey: string; children?: React.ReactNode }) {
  const [choice, setChoice] = useState<AiChoice | null>(null);
  const [asking, setAsking] = useState<{ kind: AiKind; review: boolean } | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const waiters = useRef<Array<(choice: AiChoice) => void>>([]);
  const keyRef = useRef(accountKey);
  keyRef.current = accountKey;

  useEffect(() => {
    setChoice(readAiConsent(storage(), accountKey)?.choice || null);
  }, [accountKey]);

  const settle = useCallback((next: AiChoice) => {
    writeAiConsent(storage(), keyRef.current, next);
    setChoice(next);
    setAsking(null);
    const pending = waiters.current.splice(0);
    pending.forEach((resolve) => resolve(next));
    window.dispatchEvent(new CustomEvent(AI_CONSENT_EVENT, { detail: { choice: next } }));
  }, []);

  // Ask once per person per phone; later calls reuse the stored answer.
  const ask = useCallback((kind: AiKind) => {
    const stored = readAiConsent(storage(), keyRef.current)?.choice;
    if (stored) return Promise.resolve(stored);
    return new Promise<AiChoice>((resolve) => {
      waiters.current.push(resolve);
      setAsking((current) => current || { kind, review: false });
    });
  }, []);

  useEffect(() => {
    const original = window.fetch;
    const gated: typeof window.fetch = async (input, init) => {
      const url = requestUrl(input);
      const kind = aiKindForUrl(url, window.location.origin);
      const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (!kind || method !== "POST") return original(input, init);
      const answer = await ask(kind);
      if (answer === "granted") {
        const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
        headers.set(AI_CONSENT_HEADER, "granted");
        return original(input, { ...init, headers });
      }
      const path = new URL(url, window.location.origin).pathname;
      const body = await aiOffAnswer(kind, path, init?.body);
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json", [AI_CONSENT_HEADER]: "denied" },
      });
    };
    window.fetch = gated;
    return () => {
      if (window.fetch === gated) window.fetch = original;
    };
  }, [ask]);

  useEffect(() => {
    if (!asking) return;
    setHost(document.querySelector<HTMLElement>(".app-shell") || document.body);
  }, [asking]);

  const value: Ctx = {
    accountKey,
    choice,
    set: settle,
    review: () => setAsking({ kind: "text", review: true }),
  };

  return (
    <AiConsentContext.Provider value={value}>
      {children}
      {asking && host
        ? createPortal(
            <AiConsentSheet
              review={asking.review}
              current={choice}
              onAllow={() => settle("granted")}
              onDecline={() => settle("denied")}
              onClose={asking.review ? () => setAsking(null) : undefined}
            />,
            host
          )
        : null}
    </AiConsentContext.Provider>
  );
}

export function AiConsentSheet({
  review,
  current,
  onAllow,
  onDecline,
  onClose,
}: {
  review?: boolean;
  current?: AiChoice | null;
  onAllow: () => void;
  onDecline: () => void;
  onClose?: () => void;
}) {
  const allowRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Start at the top (the provider name), with Allow focused for keyboards / VoiceOver.
    sheetRef.current?.scrollTo({ top: 0 });
    allowRef.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className={styles.veil} data-ai-consent="1" role="dialog" aria-modal="true" aria-labelledby="ai-consent-title">
      <div className={styles.sheet} ref={sheetRef}>
        <p className={styles.kicker}>Before the AI helps</p>
        <h2 id="ai-consent-title" className={styles.title}>
          Send this to {AI_PROVIDER}?
        </h2>
        <p className={styles.body}>
          jobcommand.app uses <b>{AI_PROVIDER_DETAIL}</b> to turn your talk, photos, and notes into drafts. With your OK, the
          jobcommand.app server sends {AI_PROVIDER}:
        </p>
        <ul className={styles.list}>
          {AI_SENDS.map((row) => (
            <li key={row.kind}>
              <b>{row.title}.</b> {row.body}
            </li>
          ))}
        </ul>
        <p className={styles.body}>{AI_NEVER_SENDS}</p>
        <p className={styles.body}>{AI_USE_LINE}</p>
        <p className={styles.muted}>{AI_WITHOUT_LINE}</p>
        {review && current ? (
          <p className={styles.now} data-ai-current={current}>
            Right now: {current === "granted" ? "AI is on" : "AI is off"}
          </p>
        ) : null}
        <div className={styles.actions}>
          <button ref={allowRef} type="button" className={styles.allow} onClick={onAllow} data-ai-allow="1">
            Allow
          </button>
          <button type="button" className={styles.decline} onClick={onDecline} data-ai-decline="1">
            Not now
          </button>
        </div>
        {onClose ? (
          <button type="button" className={styles.close} onClick={onClose}>
            Close
          </button>
        ) : null}
        <a className={styles.link} href="/privacy" target="_blank" rel="noreferrer">
          Privacy Policy
        </a>
      </div>
    </div>
  );
}

/** Settings block: shows the current choice, flips it, and re-opens the full screen. */
export function AiPrivacySettings() {
  const ctx = useContext(AiConsentContext);
  const [choice, setChoice] = useState<AiChoice | null>(ctx?.choice ?? null);
  useEffect(() => setChoice(ctx?.choice ?? null), [ctx?.choice]);
  if (!ctx) return null;
  const label = choice === "granted" ? "On — allowed" : choice === "denied" ? "Off — not sent" : "Not asked yet";
  return (
    <div className={styles.settings} data-ai-settings="1" data-ai-choice={choice || "unset"}>
      <p className="card-label">AI &amp; your data</p>
      <p className={styles.body}>
        Voice, photos, and notes go to <strong className={styles.em}>{AI_PROVIDER}</strong> only if you allow it.
      </p>
      <p className={styles.body}>
        Right now: <strong className={styles.state}>{label}</strong>
      </p>
      <div className={styles.actions}>
        <button
          type="button"
          className={choice === "granted" ? styles.allowOn : styles.pick}
          aria-pressed={choice === "granted"}
          onClick={() => ctx.set("granted")}
        >
          AI on
        </button>
        <button
          type="button"
          className={choice === "denied" ? styles.declineOn : styles.pick}
          aria-pressed={choice === "denied"}
          onClick={() => ctx.set("denied")}
        >
          AI off
        </button>
      </div>
      <button type="button" className={styles.close} onClick={ctx.review} data-ai-review="1">
        What gets sent?
      </button>
    </div>
  );
}
