"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import s from "@/components/command/PinSecurity.module.css";
import { ShopField } from "@/components/command/ShopField";

const only = (value: string, max: number) => value.replace(/\D/g, "").slice(0, max);

/**
 * "Forgot PIN?" on the sign-in screen (owner recovery, Eric 10:34 AM CT). Step 1 sends a one-time 6-digit
 * code to the owner email and the backup email. Step 2: code + new PIN twice → signed in on THIS phone
 * (works on a brand-new phone). Crew are told to ask the office, who can reset a crew PIN.
 */
export function ForgotPin({ onClose, shop = "", onShop }: { onClose: () => void; shop?: string; onShop?: (next: string) => void }) {
  const router = useRouter();
  const [step, setStep] = useState<"ask" | "code">("ask");
  const [note, setNote] = useState("");
  const [connected, setConnected] = useState(true);
  const [codeBox, setCodeBox] = useState(true);
  const [code, setCode] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Multi-shop B2: a brand-new phone may need to say which shop (the shop's phone number) once.
  const [shopTyped, setShopTyped] = useState(shop);
  const [askShop, setAskShop] = useState(false);
  const typeShop = (next: string) => {
    setShopTyped(next);
    onShop?.(next);
  };

  async function post(body: Record<string, string>) {
    const response = await fetch("/api/session/recover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(shopTyped ? { ...body, shop: shopTyped } : body),
    });
    return { status: response.status, payload: (await response.json().catch(() => ({}))) as Record<string, unknown> };
  }

  async function send() {
    setBusy(true);
    setError("");
    try {
      const { status, payload } = await post({ action: "start" });
      if (payload.needShop) {
        setAskShop(true);
        setError(String(payload.message || "Type your shop's phone number."));
        return;
      }
      if (status === 429) {
        setError(String(payload.message || "Too many codes asked for. Try again in an hour."));
        return;
      }
      setConnected(payload.emailConnected !== false);
      setCodeBox(payload.codeBox !== false);
      setNote(String(payload.message || ""));
      setStep("code");
    } catch {
      setError("No connection. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setError("");
    if (next !== again) {
      setError("The two new PINs don't match.");
      return;
    }
    setBusy(true);
    try {
      const { payload } = await post({ action: "finish", code, next, again });
      if (!payload.ok) {
        setError(String(payload.error || "That didn't work. Try again."));
        return;
      }
      router.refresh();
    } catch {
      setError("No connection. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="access-gate" data-forgot-pin={step}>
      <p className="card-label">Forgot PIN?</p>
      <div className={s.sheet}>
        {step === "ask" ? (
          <>
            <h2>Get a reset code</h2>
            <p>
              <b>Owner:</b> we&rsquo;ll email a 6-digit code to the office email and the backup email on file. It works on any
              phone, even a new one.
            </p>
            <p>
              <b>Crew:</b> ask the office. They can reset your PIN from Office › Change PIN.
            </p>
            {askShop ? <ShopField value={shopTyped} onChange={typeShop} /> : null}
            {error ? <p className={s.error} role="alert">{error}</p> : null}
            <button type="button" className={s.bigButton} onClick={() => void send()} disabled={busy} data-forgot-send="1">
              {busy ? "Sending…" : "Email me a code"}
            </button>
          </>
        ) : (
          <>
            {connected ? (
              <p className={s.done} role="status">{note}</p>
            ) : (
              <div className={s.banner} role="alert" data-forgot-not-connected="1">
                <b>No code was sent</b>
                <span>{note}</span>
              </div>
            )}
            {codeBox ? (
            <>
            <label className={s.field}>
              6-digit code
              <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(only(e.target.value, 6))} data-forgot-code="1" />
            </label>
            <label className={s.field}>
              New PIN
              <input type="password" inputMode="numeric" autoComplete="new-password" value={next} onChange={(e) => setNext(only(e.target.value, 6))} />
            </label>
            <label className={s.field}>
              New PIN again
              <input type="password" inputMode="numeric" autoComplete="new-password" value={again} onChange={(e) => setAgain(only(e.target.value, 6))} />
            </label>
            {error ? <p className={s.error} role="alert">{error}</p> : null}
            <button
              type="button"
              className={s.save}
              onClick={() => void finish()}
              disabled={busy || code.length !== 6 || next.length < 4 || again.length < 4}
              data-forgot-finish="1"
            >
              {busy ? "Saving…" : "Set new PIN and sign in"}
            </button>
            <button type="button" className={`ghost-action ${s.wide}`} onClick={() => void send()} disabled={busy}>
              Send a new code
            </button>
            </>
            ) : null}
          </>
        )}
        <button type="button" className={`ghost-action ${s.wide}`} onClick={onClose} disabled={busy}>
          Back to PIN
        </button>
      </div>
    </section>
  );
}
