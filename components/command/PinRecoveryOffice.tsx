"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { getRecoveryEmails, listCrewLogins, resetCrewPin, saveRecoveryEmails } from "@/app/pin-actions";
import s from "@/components/command/PinSecurity.module.css";

const digits = (value: string) => value.replace(/\D/g, "").slice(0, 6);

/** Office › under Change PIN: the two emails "Forgot PIN?" sends a code to. Office only (server checks too). */
export function RecoveryEmails() {
  const [owner, setOwner] = useState("");
  const [backup, setBackup] = useState("");
  const [connected, setConnected] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    getRecoveryEmails()
      .then((row) => {
        if (!row) return;
        setOwner(row.ownerEmail);
        setBackup(row.recoveryEmail);
        setConnected(row.emailConnected);
        setLoaded(true);
      })
      .catch(() => undefined);
  }, []);

  function save() {
    setError("");
    start(async () => {
      const result = await saveRecoveryEmails({ ownerEmail: owner, recoveryEmail: backup });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOwner(result.ownerEmail);
      setBackup(result.recoveryEmail);
      toast.success("Recovery emails saved.");
    });
  }

  if (!loaded) return null;
  return (
    <div className={s.sheet} data-recovery-emails="1">
      <h2>If you lose your phone</h2>
      <p>Sign in on any phone with your PIN. Forgot the PIN? Tap Forgot PIN? on the sign-in screen and we email a code to both of these.</p>
      {!connected ? (
        <div className={s.banner} data-recovery-not-connected="1">
          <b>Email isn&rsquo;t connected yet</b>
          <span>Codes can&rsquo;t be emailed until email is set up. Keep your PIN somewhere safe for now.</span>
        </div>
      ) : null}
      <label className={s.field}>
        Owner email
        <input className={s.text} type="email" autoComplete="email" value={owner} onChange={(e) => setOwner(e.target.value)} data-owner-email="1" />
      </label>
      <label className={s.field}>
        Backup email
        <input className={s.text} type="email" autoComplete="email" value={backup} onChange={(e) => setBackup(e.target.value)} data-backup-email="1" />
      </label>
      {error ? <p className={s.error} role="alert">{error}</p> : null}
      <button type="button" className={s.save} onClick={save} disabled={pending}>
        {pending ? "Saving…" : "Save emails"}
      </button>
    </div>
  );
}

/** Office › Reset a crew PIN. Sets a PIN the office tells them; their phone then asks them to pick their own. */
export function CrewPinReset() {
  const [crew, setCrew] = useState<{ id: string; name: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    listCrewLogins()
      .then(setCrew)
      .catch(() => undefined);
  }, []);

  function close() {
    setOpen(false);
    setWho("");
    setNext("");
    setAgain("");
    setError("");
  }

  function save() {
    setError("");
    if (next !== again) {
      setError("The two PINs don't match.");
      return;
    }
    start(async () => {
      const result = await resetCrewPin({ accountId: who, next, again });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      close();
      toast.success(`${result.name}'s PIN is reset. Tell them the new PIN. Their phone will ask them to pick their own.`);
    });
  }

  if (!crew.length) return null;
  if (!open) {
    return (
      <button type="button" className={s.bigButton} onClick={() => setOpen(true)} data-crew-pin-reset-open="1">
        Reset a crew PIN
      </button>
    );
  }
  return (
    <div className={s.sheet} data-crew-pin-reset="1">
      <h2>Reset a crew PIN</h2>
      <p>Pick who forgot their PIN, then type a new one to tell them. 4 to 6 numbers, not the end of a phone number.</p>
      <div className={s.pickList} role="radiogroup" aria-label="Crew member">
        {crew.map((person) => (
          <button
            key={person.id}
            type="button"
            role="radio"
            aria-checked={who === person.id}
            className={`${s.pick} ${who === person.id ? s.pickOn : ""}`}
            onClick={() => setWho(person.id)}
          >
            {person.name}
          </button>
        ))}
      </div>
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
        <button type="button" className={s.save} onClick={save} disabled={pending || !who || next.length < 4 || again.length < 4}>
          {pending ? "Saving…" : "Reset PIN"}
        </button>
      </div>
    </div>
  );
}
