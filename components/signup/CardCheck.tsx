"use client";

/**
 * $1 card check on "Free for 14 days" (mockups: /workspace/mockups/signup/card-check).
 * Stripe mode (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY): Stripe.js card element + Apple Pay / Google Pay
 * via the Payment Request API; the card never touches our server, only a pm_ id. Mock mode: our
 * own fields; only last4, brand, and a SHA-256 of the number are sent. Either way the server places
 * a $1 hold and releases it right away (app/api/setup/card-check).
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { SignupIcon } from "@/components/signup/SignupIcon";
import s from "@/components/signup/signup.module.css";
import { cx } from "@/components/signup/SignupSheet";
import { brandLabel, type Declined } from "@/lib/card-check";

export type CardPhase =
  | { phase: "enter"; problem?: string }
  | { phase: "checking"; brand: string; last4: string; tick: number }
  | { phase: "ok"; token: string; brand: string; last4: string; wallet: string }
  | { phase: "declined"; brand: string; last4: string; expiry: string; declined: Declined }
  | { phase: "blocked"; token: string; brand: string; last4: string; reason: string; title: string; line: string; subscribe: string };

export type GuardInfo = { phone: string; email: string; name: string; businessName: string; businessAddress: string };

export type CardEntryHandle = { start: () => void; ready: () => boolean; reset: () => void };

type StripeLike = {
  elements: () => { create: (kind: string, options?: unknown) => StripeElement };
  createPaymentMethod: (input: unknown) => Promise<{ paymentMethod?: { id: string; card?: { brand?: string; last4?: string } }; error?: { code?: string; message?: string } }>;
  handleNextAction: (input: { clientSecret: string }) => Promise<{ error?: { code?: string } }>;
  paymentRequest: (input: unknown) => PaymentRequestLike;
};
type StripeElement = { mount: (el: HTMLElement) => void; on: (event: string, cb: (e: { complete?: boolean }) => void) => void; destroy: () => void; clear?: () => void; focus?: () => void };
type PaymentRequestLike = {
  canMakePayment: () => Promise<{ applePay?: boolean; googlePay?: boolean } | null>;
  show: () => void;
  on: (event: string, cb: (ev: { paymentMethod: { id: string; card?: { brand?: string; last4?: string } }; complete: (status: string) => void }) => void) => void;
};

const PK = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";

function loadStripe(): Promise<StripeLike | null> {
  if (!PK) return Promise.resolve(null);
  const w = window as unknown as { Stripe?: (key: string) => StripeLike };
  if (w.Stripe) return Promise.resolve(w.Stripe(PK));
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://js.stripe.com/v3";
    script.async = true;
    script.onload = () => resolve(w.Stripe ? w.Stripe(PK) : null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

/** Native install id (Keychain / ANDROID_ID) once the Capacitor projects exist; "" on the web. */
export function readDeviceId(): string {
  const native = (window as unknown as { JobCommandNative?: { installId?: string | (() => string) } }).JobCommandNative;
  const id = typeof native?.installId === "function" ? native.installId() : native?.installId;
  return typeof id === "string" ? id.slice(0, 120) : "";
}

function newAttempt() {
  const c = (window as unknown as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

type CheckReply = {
  ok?: boolean;
  token?: string;
  brand?: string;
  last4?: string;
  wallet?: string;
  declined?: Declined;
  blocked?: { reason: string; title: string; line: string; subscribe: string };
  action?: { clientSecret: string; paymentIntentId: string };
  busy?: boolean;
  error?: string;
};

async function post(body: Record<string, unknown>): Promise<CheckReply> {
  try {
    const response = await fetch("/api/setup/card-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return (await response.json().catch(() => ({ error: "Couldn’t check the card. Try again." }))) as CheckReply;
  } catch {
    return { error: "No connection. Try again." };
  }
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/**
 * Go-public B4: with no Stripe publishable key there is no real card check, so signup says so plainly
 * (no fake card form, no fake "$1 returned"). Nothing is held or charged.
 */
export const CARD_CHECK_CONNECTED = Boolean(PK);
export const CARD_NOT_CONNECTED_LINE = "Card check isn\u2019t connected yet. No card needed today. Nothing is held or charged.";

export const CardEntry = forwardRef<CardEntryHandle, { info: GuardInfo; onPhase: (phase: CardPhase) => void; onReady?: (ready: boolean) => void; prefill?: { number: string; expiry: string } }>(
  // prefill is kept for callers; there is no hand-typed card form any more (Stripe Elements or "not connected").
  function CardEntry({ info, onPhase, onReady }, ref) {
    const [stripe, setStripe] = useState<StripeLike | null>(null);
    const [stripeComplete, setStripeComplete] = useState(false);
    const [wallets, setWallets] = useState<{ applePay: boolean; googlePay: boolean }>({ applePay: false, googlePay: false });
    const mountRef = useRef<HTMLDivElement>(null);
    const cardRef = useRef<StripeElement | null>(null);
    const prRef = useRef<PaymentRequestLike | null>(null);
    const busy = useRef(false);

    // Not connected: nothing to type, so the step is ready (server records "Card check skipped").
    const fieldsOk = PK ? stripeComplete : true;
    useEffect(() => onReady?.(fieldsOk), [fieldsOk, onReady]);

    useEffect(() => {
      if (!PK) return;
      let alive = true;
      void loadStripe().then((loaded) => {
        if (!alive || !loaded || !mountRef.current) return;
        setStripe(loaded);
        const card = loaded.elements().create("card", {
          hidePostalCode: false,
          style: { base: { color: "#ffffff", fontSize: "20px", fontWeight: "600", "::placeholder": { color: "#8e8e94" } }, invalid: { color: "#ff9b8a" } },
        });
        card.mount(mountRef.current);
        card.on("change", (event) => setStripeComplete(Boolean(event.complete)));
        cardRef.current = card;
        const pr = loaded.paymentRequest({ country: "US", currency: "usd", total: { label: "Card check · released right away", amount: 100 }, requestPayerName: false });
        prRef.current = pr;
        void pr.canMakePayment().then((can) => alive && setWallets({ applePay: Boolean(can?.applePay), googlePay: Boolean(can?.googlePay) }));
        pr.on("paymentmethod", async (ev) => {
          const brand = ev.paymentMethod.card?.brand || "card";
          const last4 = ev.paymentMethod.card?.last4 || "";
          const reply = await runCheck({ paymentMethodId: ev.paymentMethod.id }, brand, last4, "", true);
          ev.complete(reply ? "success" : "fail");
        });
      });
      return () => {
        alive = false;
        cardRef.current?.destroy();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /** Sends one check; walks the "Checking your card…" ticks; reports ok / declined / blocked. */
    async function runCheck(card: Record<string, unknown>, brand: string, last4: string, exp: string, fromWallet = false) {
      if (busy.current) return false;
      busy.current = true;
      const attemptId = newAttempt();
      const guard = { ...info, deviceId: readDeviceId() };
      try {
        onPhase({ phase: "checking", brand, last4, tick: 1 });
        const started = Date.now();
        let reply = await post({ attemptId, ...card, ...guard });
        if (reply.action && stripe) {
          const done = await stripe.handleNextAction({ clientSecret: reply.action.clientSecret });
          reply = done.error
            ? { declined: { code: "authentication_required", title: "That card didn’t work", line: "Your bank wants you to confirm it’s you. Try again and approve it." } }
            : await post({ attemptId, paymentIntentId: reply.action.paymentIntentId, ...guard });
        }
        // Let each tick show for a beat so the steps read, even when the check is instant (mock).
        const pause = Math.max(0, 900 - (Date.now() - started));
        await wait(pause);
        if (reply.declined || reply.error) {
          onPhase({
            phase: "declined",
            brand,
            last4,
            expiry: exp,
            declined: reply.declined || { code: "error", title: "That card didn’t work", line: reply.error || "Couldn’t check the card." },
          });
          return false;
        }
        const shown = { brand: reply.brand || brandLabel(brand), last4: reply.last4 || last4 };
        onPhase({ phase: "checking", ...shown, tick: 2 });
        await wait(550);
        if (reply.blocked && reply.token) {
          onPhase({ phase: "blocked", token: reply.token, ...shown, ...reply.blocked });
          return true;
        }
        onPhase({ phase: "checking", ...shown, tick: 3 });
        await wait(450);
        onPhase({ phase: "ok", token: reply.token || "", ...shown, wallet: reply.wallet || (fromWallet ? "wallet" : "") });
        return true;
      } finally {
        busy.current = false;
      }
    }

    async function start() {
      if (busy.current) return;
      if (PK) {
        if (!stripe || !cardRef.current) return onPhase({ phase: "enter", problem: "Card form is still loading. Try again in a second." });
        onPhase({ phase: "checking", brand: "card", last4: "", tick: 0 });
        const made = await stripe.createPaymentMethod({ type: "card", card: cardRef.current });
        if (!made.paymentMethod) return onPhase({ phase: "enter", problem: made.error?.message || "Check the card details." });
        await runCheck({ paymentMethodId: made.paymentMethod.id }, made.paymentMethod.card?.brand || "card", made.paymentMethod.card?.last4 || "", "");
        return;
      }
      onPhase({ phase: "checking", brand: "", last4: "", tick: 0 });
      await runCheck({ mock: { notConnected: true } }, "", "", "");
    }

    function wallet(kind: "apple" | "google") {
      if (PK) {
        prRef.current?.show();
        return;
      }
      // No wallets without Stripe keys (go-public B4: no fake Apple/Google Pay).
      void kind;
    }

    useImperativeHandle(ref, () => ({
      start: () => void start(),
      ready: () => fieldsOk,
      reset: () => {
        cardRef.current?.clear?.();
        window.setTimeout(() => cardRef.current?.focus?.(), 60);
      },
    }));

    const showWallets = wallets.applePay || wallets.googlePay;
    return (
      <div data-card-entry="1" data-card-mode={PK ? "stripe" : "mock"}>
        {showWallets ? (
          <>
            <div className={s.walletRow}>
              {wallets.applePay ? (
                <button type="button" className={s.walletApple} onClick={() => wallet("apple")} data-wallet="apple" aria-label="Apple Pay">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.9-.9-3.1-.8-1.6 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3.1.7c1.3 0 2.1-1.1 2.8-2.3.9-1.3 1.3-2.6 1.3-2.6s-2.5-1-2.5-3.8zM14.1 5.8c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.7 1.4-.6.7-1.1 1.8-1 2.8 1 .1 2.1-.5 2.7-1.2z" />
                  </svg>
                  Pay
                </button>
              ) : null}
              {wallets.googlePay ? (
                <button type="button" className={s.walletGoogle} onClick={() => wallet("google")} data-wallet="google" aria-label="Google Pay">
                  <b>
                    <i style={{ color: "#4285f4" }}>G</i>
                  </b>
                  Pay
                </button>
              ) : null}
            </div>
            <div className={s.orCard}>
              <span>or enter a card</span>
            </div>
          </>
        ) : null}
        {PK ? (
          <div className={cx(s.cardBox, stripeComplete && s.cardBoxOk)}>
            <SignupIcon name="card" />
            <div ref={mountRef} className={s.cardMount} />
          </div>
        ) : (
          <div className={cx(s.cardBox, s.cardBoxOk)} data-card-not-connected="1" role="status">
            <div className={s.cardLine}>
              <SignupIcon name="card" />
              <span className={s.cardNotConnected}>{CARD_NOT_CONNECTED_LINE}</span>
            </div>
          </div>
        )}
      </div>
    );
  }
);

const STEPS = ["Card details look right", "$1 hold on your card", "Release the $1 right away", "Start your 30 free days"];

export function CardChecking({ phase }: { phase: Extract<CardPhase, { phase: "checking" }> }) {
  return (
    <div data-card-checking="1">
      <div className={cx(s.hero, s.spinHero)}>
        <div className={s.ring}>
          <img src="/brand/jc-shield@2x.webp" alt="" width={84} height={84} />
        </div>
        <i className={s.spinArc} aria-hidden="true" />
      </div>
      <h1 className={cx(s.q, s.dn, s.center)}>{PK ? "Checking your card…" : "Starting your free days…"}</h1>
      {!PK ? (
        <p className={cx(s.help, s.center)}>No card check today. Nothing is held or charged.</p>
      ) : (
      <p className={cx(s.help, s.center)}>
        Putting a $1 hold on{" "}
        <b>
          {phase.brand && phase.brand !== "card" ? phase.brand : "your card"}
          {phase.last4 ? ` •••• ${phase.last4}` : ""}
        </b>
        .<br />
        This takes a few seconds. Don’t close the app.
      </p>
      )}
      {PK ? (
      <ul className={s.ckSteps}>
        {STEPS.map((label, index) => {
          const state = index < phase.tick ? "done" : index === phase.tick ? "now" : "todo";
          return (
            <li key={label} className={cx(state === "done" && s.ckDone, state === "now" && s.ckNow)} data-step-state={state}>
              <span className={s.ckDot}>{state === "done" ? <SignupIcon name="check" /> : null}</span>
              {state === "now" ? `${label}…` : label}
            </li>
          );
        })}
      </ul>
      ) : null}
    </div>
  );
}

export function CardOk({ phase, freeUntil, price }: { phase: Extract<CardPhase, { phase: "ok" }>; freeUntil: string; price: string }) {
  // No last4 = card check isn't connected (go-public B4): say so, never "$1 returned".
  const skipped = !phase.last4;
  const rows: Array<[string, string, boolean?]> = [
    ...(skipped
      ? ([["Card", "Not needed yet"], ["Card check", "Not connected yet"]] as Array<[string, string, boolean?]>)
      : ([["Card", `${phase.brand} •••• ${phase.last4}`], ["$1 check", "Returned ✓", true]] as Array<[string, string, boolean?]>)),
    ["Free until", freeUntil],
    ["Then", price],
    ["Cancel", "Anytime · Office › Billing"],
  ];
  return (
    <div data-card-ok="1">
      <div className={s.hero}>
        <div className={s.ring}>
          <img src="/brand/jc-shield@2x.webp" alt="" width={84} height={84} />
        </div>
        <div className={s.badge}>
          <SignupIcon name="check" />
        </div>
      </div>
      <h1 className={cx(s.q, s.dn, s.center)}>{skipped ? "You\u2019re in." : "Card OK. $1 returned."}</h1>
      <p className={cx(s.help, s.center)}>
        {skipped ? "Card check isn\u2019t connected yet, so nothing was held or charged." : "We released the $1 hold right away."}
        <br />
        Your 30 free days start now.
      </p>
      <div className={cx(s.card, s.okTable)}>
        {rows.map(([label, value, lime]) => (
          <div key={label} className={s.okRow}>
            <span>{label}</span>
            <b className={lime ? s.okLime : undefined}>{value}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardDeclined({ phase }: { phase: Extract<CardPhase, { phase: "declined" }> }) {
  return (
    <div data-card-declined={phase.declined.code}>
      <div className={s.hero}>
        <div className={cx(s.ring, s.ringBad)}>
          <img src="/brand/jc-shield@2x.webp" alt="" width={84} height={84} />
        </div>
        <div className={cx(s.badge, s.badgeBad)} aria-hidden="true">
          ✕
        </div>
      </div>
      <h1 className={cx(s.q, s.dn, s.center, s.badQ)}>{phase.declined.title}</h1>
      <p className={cx(s.help, s.center)}>
        {phase.declined.line}
        <br />
        <b>Nothing was charged.</b> Try again anytime.
      </p>
      {phase.last4 ? (
        <div className={cx(s.cardBox, s.cardBoxBad)}>
          <div className={s.cardLine}>
            <SignupIcon name="card" />
            <span className={s.cardMasked}>•••• •••• •••• {phase.last4}</span>
            {phase.expiry ? <span className={s.cardMaskedExp}>{phase.expiry}</span> : null}
            <span className={s.cardBad} aria-hidden="true">
              ✕
            </span>
          </div>
        </div>
      ) : null}
      <div className={s.tryBox}>
        <div className={s.tryK}>TRY THIS</div>
        <ul>
          <li>Check the card number, date, and ZIP.</li>
          <li>Use a different card, or Apple Pay.</li>
          <li>Still stuck? Call the number on your card.</li>
        </ul>
      </div>
    </div>
  );
}

export function CardBlocked({ phase, helpHref }: { phase: Extract<CardPhase, { phase: "blocked" }>; helpHref: string }) {
  return (
    <div data-card-blocked={phase.reason}>
      <div className={s.hero}>
        <div className={cx(s.ring, s.ringGold)}>
          <img src="/brand/jc-shield@2x.webp" alt="" width={84} height={84} />
        </div>
        <div className={cx(s.badge, s.badgeGold)} aria-hidden="true">
          !
        </div>
      </div>
      <h1 className={cx(s.q, s.dn, s.center, s.goldQ)}>{phase.title}</h1>
      <p className={cx(s.help, s.center)}>
        {phase.line}
        <br />
        {phase.last4 ? <>We released the $1 hold. </> : null}
        <b>Nothing was charged.</b>
      </p>
      <div className={cx(s.card, s.okTable)}>
        <div className={s.okRow}>
          <span>Card</span>
          <b>{phase.last4 ? `${phase.brand} •••• ${phase.last4}` : "Not needed yet"}</b>
        </div>
        <div className={s.okRow}>
          <span>Free trial</span>
          <b>Already used</b>
        </div>
        <div className={s.okRow}>
          <span>Plan</span>
          <b>{phase.subscribe.replace(/^Subscribe /, "")}</b>
        </div>
        <div className={s.okRow}>
          <span>Your answers</span>
          <b className={s.okLime}>Kept ✓</b>
        </div>
      </div>
      <a className={cx(s.linkish, s.wrongLink)} href={helpHref} data-trial-wrong="1">
        Think this is wrong? Text us.
      </a>
    </div>
  );
}
