"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GatePerson } from "@/lib/types";
import { shopBrand } from "@/lib/shop-brand";
import { devPinAutoTryAllowed } from "@/lib/pin-gate";
import { usePinGateStatus } from "@/components/command/usePinGate";
import gs from "@/components/command/PinSecurity.module.css";
import { ForgotPin } from "@/components/command/ForgotPin";
import { ShopField } from "@/components/command/ShopField";

export function PinBypass({ onFail }: { onFail?: () => void } = {}) {
  const router = useRouter();
  const running = useRef(false);
  const [stuck, setStuck] = useState(false);
  const failRef = useRef(onFail);
  failRef.current = onFail;
  const { enabled: pinGateEnabled } = usePinGateStatus();

  const openShop = useCallback(async () => {
    if (running.current) return;
    // Eric 2026-10-05: ALWAYS try bypass first — if DB flag disables PIN gate, this succeeds.
    // If bypass is forbidden (403), the PIN gate is enabled and user must enter PIN.
    running.current = true;
    setStuck(false);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    try {
      // Owner bypass: no PIN, straight in as admin.
      const signed = await fetch("/api/bypass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: controller.signal,
      });
      if (!signed.ok) {
        if (failRef.current) failRef.current();
        else setStuck(true);
        return;
      }
      router.refresh();
    } catch {
      setStuck(true);
    } finally {
      window.clearTimeout(timer);
      running.current = false;
    }
  }, [router]);

  useEffect(() => {
    void openShop();
  }, [openShop]);

  return (
    <button type="button" className="open-shop" onClick={() => void openShop()} aria-label="Opening the shop…">
      {stuck ? <b>Tap to open</b> : null}
    </button>
  );
}

type Choice = { id: string; name: string; role: "ADMIN" | "CREW" };

/**
 * PIN-first gate (go-public B1). A signed-out phone sees no names: the person types their own PIN and the
 * server finds them. Only if two logins share the PIN does it show those two names. With `people` of one
 * (the crew invite page) it opens that person's keypad directly. Wrong PINs lock the phone out on the server
 * (5 tries → 5 minutes, then longer).
 */
export function AccessGate({ people, shop, shopId }: { people: GatePerson[]; shop?: string | null; shopId?: string | null }) {
  const router = useRouter();
  const known = people.length === 1 ? people[0] : null;
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  // Synchronous in-flight guard: setBusy(true) only applies after re-render, so a fast
  // double-tap on "Open" would fire two submit() calls that both see busy === false and
  // double-count one wrong PIN against the 5-attempt lockout. The ref applies instantly.
  const busyRef = useRef(false);
  const [miss, setMiss] = useState(false);
  const [rateNote, setRateNote] = useState("");
  const [locked, setLocked] = useState(0);
  const [choose, setChoose] = useState<Choice[] | null>(null);
  const [forgot, setForgot] = useState(false);
  // Multi-shop B2: when the server can't tell which shop this phone belongs to, ask once for the shop phone.
  const [shopTyped, setShopTyped] = useState(shopId || "");
  const [needShop, setNeedShop] = useState("");
  const shopName = shopBrand({ businessName: shop }).name;

  useEffect(() => {
    if (locked <= 0) return;
    const timer = window.setTimeout(() => setLocked((left) => Math.max(0, left - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [locked]);

  async function submit(nextPin: string, accountId?: string) {
    if (nextPin.length < 4 || busyRef.current || locked > 0) return;
    busyRef.current = true;
    setBusy(true);
    setMiss(false);
    setRateNote("");
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: nextPin, accountId: accountId || known?.id || undefined, shop: shopTyped || undefined }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        locked?: number;
        choose?: Choice[];
        needShop?: boolean;
        message?: string;
      };
      if (payload.needShop) {
        setNeedShop(payload.message || "Type your shop's phone number once on this phone.");
        return;
      }
      setNeedShop("");
      if (response.status === 429) {
        // Only the PIN throttle reports `locked`. The middleware edge rate-limit returns no
        // `locked` field — don't fabricate a "5 minute" PIN lockout for it; show its own message.
        const serverLocked = Number(payload.locked);
        if (serverLocked > 0) {
          setLocked(serverLocked);
        } else {
          setRateNote(payload.message || "Too many requests. Wait a moment.");
        }
        setPin("");
        setChoose(null);
        return;
      }
      if (payload.choose?.length) {
        setChoose(payload.choose);
        return;
      }
      if (!response.ok || !payload.ok) {
        setMiss(true);
        setPin("");
        setChoose(null);
        return;
      }
      router.refresh();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function tap(digit: string) {
    if (busyRef.current || locked > 0) return;
    setPin((current) => (current + digit).slice(0, 6));
    setMiss(false);
  }

  const minutes = Math.ceil(locked / 60);
  const status =
    locked > 0
      ? `Too many wrong PINs. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`
      : rateNote
        ? rateNote
        : miss
          ? "Wrong PIN. Try again."
          : "Type your PIN, then tap Open. Stays on this phone for 14 days.";

  if (forgot) return <ForgotPin shop={shopTyped} onShop={setShopTyped} onClose={() => setForgot(false)} />;

  if (needShop) {
    return (
      <section className="access-gate" data-pin-shop="1">
        <p className="card-label">One time on this phone</p>
        <h1>Which shop?</h1>
        <p className={`${gs.status} ${gs.alert}`} role="status" aria-live="polite">
          {needShop}
        </p>
        <ShopField value={shopTyped} onChange={setShopTyped} />
        <button
          type="button"
          className={`access-key ${gs.openKey} ${gs.wide}`}
          disabled={busy || shopTyped.replace(/\D/g, "").length < 7}
          onClick={() => void submit(pin)}
          data-pin-shop-go="1"
        >
          {busy ? "Opening…" : "Open"}
        </button>
        <button type="button" className={`ghost-action ${gs.wide}`} onClick={() => { setNeedShop(""); setPin(""); }}>
          Back
        </button>
      </section>
    );
  }

  if (choose) {
    return (
      <section className="access-gate" data-pin-choose="1">
        <p className="card-label">Two people use this PIN</p>
        <h1>Which one are you?</h1>
        <ul className="access-people">
          {choose.map((person) => (
            <li key={person.id}>
              <button type="button" className="access-person" disabled={busy} onClick={() => void submit(pin, person.id)}>
                <span className="access-mark">{person.name.slice(0, 1)}</span>
                <span>
                  <b>{person.name}</b>
                  <small>{person.role === "ADMIN" ? "Office" : "Field"}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className={`ghost-action ${gs.wide}`} onClick={() => { setChoose(null); setPin(""); }}>
          Back
        </button>
      </section>
    );
  }

  return (
    <section className="access-gate" data-pin-first="1">
      <p className="card-label">{known ? (known.role === "ADMIN" ? "Office" : "Field") : "Sign in"}</p>
      <h1>{known ? known.name : shop?.trim() ? `Open ${shopName}` : "Sign in to your shop"}</h1>
      <p className={`${gs.status} ${locked > 0 || miss || rateNote ? gs.alert : ""}`} role="status" aria-live="polite">
        {status}
      </p>
      <p className="access-dots" aria-hidden>
        {Array.from({ length: Math.max(4, pin.length) }, (_, index) => (
          <i key={index} className={pin.length > index ? "on" : ""} />
        ))}
      </p>
      <div className="access-pad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "Open"].map((key) => (
          <button
            key={key}
            type="button"
            className={`access-key ${key === "Open" ? gs.openKey : ""}`}
            disabled={busy || locked > 0 || (key === "Open" && pin.length < 4)}
            aria-label={key === "⌫" ? "Delete" : key}
            onClick={() => {
              if (key === "⌫") {
                setPin((current) => current.slice(0, -1));
                return;
              }
              if (key === "Open") {
                void submit(pin);
                return;
              }
              tap(key);
            }}
          >
            {key}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={gs.bigSignin}
        disabled={busy || locked > 0 || pin.length < 4}
        onClick={() => void submit(pin)}
        data-signin-go="1"
      >
        {busy ? "Opening…" : "Sign In"}
      </button>
      <p className={gs.help}>
        {known
          ? "Type the PIN you picked when you set up your account."
          : "Office and crew: type your own PIN. New crew: open the invite link the office sent you."}
      </p>
      <button type="button" className={`ghost-action ${gs.wide}`} onClick={() => setForgot(true)} data-forgot-pin-open="1">
        Forgot PIN?
      </button>
      {known ? null : (
        <a className={gs.bigSignup} href="/api/shop/new" data-new-shop="1">
          Sign Up
        </a>
      )}
    </section>
  );
}

