"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { changeMyPin, myPinSafety } from "@/app/pin-actions";
import s from "@/components/command/PinSecurity.module.css";
import { CrewPinReset, RecoveryEmails } from "@/components/command/PinRecoveryOffice";

const digits = (value: string) => value.replace(/\D/g, "").slice(0, 6);

/**
 * Big "Change PIN" button (go-public B1). Office page and crew › My account. Current PIN, then the new
 * PIN twice (4–6 numbers). The server hashes it and refuses easy PINs and the end of any shop phone.
 * Shows a "please change your PIN" banner while the PIN is still the last 4 of a phone number.
 */
export function ChangePin({ office = false }: { office?: boolean }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [safety, setSafety] = useState<{ mine: "ok" | "phone" | "unset" | "reset"; crewOnPhonePin: number } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    myPinSafety()
      .then((row) => live && setSafety(row))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [done]);

  function close() {
    setOpen(false);
    setCurrent("");
    setNext("");
    setAgain("");
    setError("");
  }

  function save() {
    setError("");
    if (next !== again) {
      setError("The two new PINs don't match.");
      return;
    }
    start(async () => {
      try {
        const result = await changeMyPin({ current, next, again });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        close();
        setDone(true);
        toast.success("PIN changed. Use the new PIN next time you sign in.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not change the PIN.");
      }
    });
  }

  return (
    <div className={`company-block ${s.block}`} data-change-pin="1">
      {safety?.mine === "phone" ? (
        <div className={s.banner} role="alert" data-pin-banner="phone">
          <b>Please change your PIN</b>
          <span>Your PIN is the last 4 numbers of a shop phone. That number is printed on every invoice, so anyone could guess it.</span>
        </div>
      ) : null}
      {safety?.mine === "reset" ? (
        <div className={s.banner} role="alert" data-pin-banner="reset">
          <b>Please pick your own PIN</b>
          <span>The office reset your PIN. Tap Change PIN and pick one only you know.</span>
        </div>
      ) : null}
      {office && safety && safety.crewOnPhonePin > 0 ? (
        <div className={s.banner} data-pin-banner="crew">
          <b>
            {safety.crewOnPhonePin} crew PIN{safety.crewOnPhonePin === 1 ? " is" : "s are"} still the end of a phone number
          </b>
          <span>Ask them to tap Change PIN under My account on their phone.</span>
        </div>
      ) : null}
      {done ? <p className={s.done}>PIN changed. Use the new PIN next time you sign in.</p> : null}
      {!open ? (
        <button type="button" className={s.bigButton} onClick={() => { setOpen(true); setDone(false); }}>
          Change PIN
        </button>
      ) : (
        <div className={s.sheet} data-change-pin-sheet="1">
          <h2>Change PIN</h2>
          <p>4 to 6 numbers. Not 0000 or 1234, and not the end of a phone number.</p>
          <label className={s.field}>
            Current PIN
            <input type="password" inputMode="numeric" autoComplete="current-password" value={current} onChange={(e) => setCurrent(digits(e.target.value))} />
          </label>
          <label className={s.field}>
            New PIN
            <input type="password" inputMode="numeric" autoComplete="new-password" value={next} onChange={(e) => setNext(digits(e.target.value))} />
          </label>
          <label className={s.field}>
            New PIN again
            <input type="password" inputMode="numeric" autoComplete="new-password" value={again} onChange={(e) => setAgain(digits(e.target.value))} />
          </label>
          {error ? <p className={s.error} role="alert">{error}</p> : null}
          <div className={s.row}>
            <button type="button" className={s.cancel} onClick={close} disabled={pending}>
              Cancel
            </button>
            <button type="button" className={s.save} onClick={save} disabled={pending || next.length < 4 || again.length < 4}>
              {pending ? "Saving…" : "Save PIN"}
            </button>
          </div>
        </div>
      )}
      {office ? <CrewPinReset /> : null}
      {office ? <RecoveryEmails /> : null}
    </div>
  );
}
