"use client";

import { useState, useTransition } from "react";
import s from "@/components/answering/answering.module.css";
import { saveAnsweringAction, connectRetellAction } from "@/app/answering/actions";
import { FORWARDING_CARRIERS, forwardingCode, prettyUs, tenDigits } from "@/lib/answering/forwarding";
import type { ConnectStep } from "@/lib/answering/connect";

type Props = {
  shopName: string;
  shopPhone: string;
  hoursLine: string;
  addonActive: boolean;
  retellKeySet: boolean;
  connected: boolean;
  settings: { enabled: boolean; voice: "male" | "female"; estimatorId: string; estimateMinutes: number; bufferMinutes: number; retellNumber: string };
  people: Array<{ id: string; name: string; title: string }>;
  minutes: { used: number; cap: number; percent: number; overCap: boolean; calls: number; month: string };
  newCalls: number;
};

const LENGTHS = [30, 45, 60, 90, 120];
const BUFFERS = [0, 15, 30, 45, 60];

export function AnsweringSetup(props: Props) {
  const [form, setForm] = useState(props.settings);
  const [note, setNote] = useState("");
  const [steps, setSteps] = useState<ConnectStep[]>([]);
  const [carrier, setCarrier] = useState(FORWARDING_CARRIERS[0].id);
  const [pending, start] = useTransition();
  const picked = FORWARDING_CARRIERS.find((c) => c.id === carrier) || FORWARDING_CARRIERS[0];
  const forwardTo = form.retellNumber;

  const save = (patch: Partial<Props["settings"]>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    start(async () => {
      const result = await saveAnsweringAction(patch);
      setNote(result.message);
    });
  };

  const connect = () =>
    start(async () => {
      const result = await connectRetellAction();
      setSteps(result.steps);
      setNote(result.message);
    });

  const meterTone = props.minutes.overCap ? s.meterOver : props.minutes.percent >= 80 ? s.meterWarn : "";

  return (
    <main className={s.screen} data-answering-setup="1">
      <div className={s.top}>
        <a className={s.back} href="/?tab=company" aria-label="Back to Office">‹ Office</a>
      </div>
      <p className={s.kicker}>{props.shopName}</p>
      <h1 className={s.title}>AI Answering</h1>
      <p className={s.muted} style={{ margin: "6px 0 14px" }}>
        Missed calls forward to your new 501 line. The AI answers with your shop name, takes the details, and books an estimate.
      </p>

      {props.connected ? (
        <div className={`${s.banner} ${s.bannerLive}`} role="status">
          <span className={`${s.dot} ${s.dotLive}`} />
          <span>Live. Calls to {prettyUs(form.retellNumber)} are answered by the AI.</span>
        </div>
      ) : (
        <div className={`${s.banner} ${s.bannerOff}`} role="status" data-not-connected="1">
          <span className={`${s.dot} ${s.dotOff}`} />
          <span>Not connected yet. The AI can&apos;t answer any calls until the steps below are done.</span>
        </div>
      )}
      {!props.addonActive ? (
        <div className={`${s.banner} ${s.bannerOff}`} role="note">
          <span className={`${s.dot} ${s.dotOff}`} />
          <span>The $59/mo add-on is off, so the AI will only take messages. Turn it on in Office › Billing.</span>
        </div>
      ) : null}

      <a className={`${s.btn} ${s.btnWide} ${s.btnDark}`} href="/calls" style={{ marginBottom: 14 }}>
        Calls{props.newCalls ? ` · ${props.newCalls} new` : ""}
      </a>

      <section className={s.card} aria-label="Minutes this month">
        <h2 className={s.cardTitle}>Minutes this month</h2>
        <div className={s.meterNums}>
          <span className={s.meterBig}>{props.minutes.used}</span>
          <span className={s.muted}>of {props.minutes.cap} min used · {props.minutes.calls} calls</span>
        </div>
        <div className={s.meterTrack} role="progressbar" aria-valuenow={props.minutes.percent} aria-valuemin={0} aria-valuemax={100}>
          <div className={`${s.meterFill} ${meterTone}`} style={{ width: `${Math.max(2, props.minutes.percent)}%` }} />
        </div>
        <p className={s.note}>
          {props.minutes.overCap
            ? "Cap reached. Until the 1st, the AI only takes messages (no booking)."
            : `$59/mo includes ${props.minutes.cap} minutes. After that the AI only takes messages until the 1st.`}
        </p>
      </section>

      <section className={s.card}>
        <h2 className={s.cardTitle}>AI answers missed calls</h2>
        <div className={s.choice}>
          <button type="button" className={`${s.choiceBtn} ${form.enabled ? s.choiceOn : ""}`} aria-pressed={form.enabled} onClick={() => save({ enabled: true })} disabled={pending}>
            On
          </button>
          <button type="button" className={`${s.choiceBtn} ${!form.enabled ? s.choiceOnOff : ""}`} aria-pressed={!form.enabled} onClick={() => save({ enabled: false })} disabled={pending}>
            Off
          </button>
        </div>
        <p className={s.note}>Off = the AI only takes a message.</p>
      </section>

      <section className={s.card}>
        <h2 className={s.cardTitle}>Phone voice</h2>
        <div className={s.choice}>
          <button type="button" className={`${s.choiceBtn} ${form.voice === "male" ? s.choiceOn : ""}`} aria-pressed={form.voice === "male"} onClick={() => save({ voice: "male" })} disabled={pending}>
            Male
          </button>
          <button type="button" className={`${s.choiceBtn} ${form.voice === "female" ? s.choiceOn : ""}`} aria-pressed={form.voice === "female"} onClick={() => save({ voice: "female" })} disabled={pending}>
            Female
          </button>
        </div>
      </section>

      <section className={s.card}>
        <h2 className={s.cardTitle}>Estimate visits</h2>
        <label className={s.field}>
          <span className={s.label}>Who goes to estimates</span>
          <select className={s.select} value={form.estimatorId} onChange={(e) => save({ estimatorId: e.target.value })} disabled={pending}>
            {props.people.length ? null : <option value="">Add a crew member first</option>}
            {props.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.title ? ` · ${p.title}` : ""}
              </option>
            ))}
          </select>
        </label>
        <div className={s.row}>
          <label className={`${s.field} ${s.grow}`}>
            <span className={s.label}>Visit length</span>
            <select className={s.select} value={form.estimateMinutes} onChange={(e) => save({ estimateMinutes: Number(e.target.value) })} disabled={pending}>
              {LENGTHS.map((m) => (
                <option key={m} value={m}>{m} min</option>
              ))}
            </select>
          </label>
          <label className={`${s.field} ${s.grow}`}>
            <span className={s.label}>Drive time</span>
            <select className={s.select} value={form.bufferMinutes} onChange={(e) => save({ bufferMinutes: Number(e.target.value) })} disabled={pending}>
              {BUFFERS.map((m) => (
                <option key={m} value={m}>{m} min</option>
              ))}
            </select>
          </label>
        </div>
        <p className={s.note}>Books inside your hours ({props.hoursLine}) and never on top of a job or another estimate.</p>
      </section>

      <section className={s.card} aria-label="Setup steps">
        <h2 className={s.cardTitle}>Set up the line</h2>
        <ol className={s.steps}>
          <li className={s.step}>
            <span className={s.stepNum}>1</span>
            <span className={s.stepText}>
              <b>Make a Retell account</b>
              <span className={s.muted}>At retellai.com. Add a card (calls are billed per minute).</span>
            </span>
          </li>
          <li className={s.step}>
            <span className={s.stepNum}>2</span>
            <span className={s.stepText}>
              <b>Buy a 501 number in Retell</b>
              <span className={s.muted}>Retell › Phone Numbers › Buy. Pick area code 501.</span>
            </span>
          </li>
          <li className={s.step}>
            <span className={`${s.stepNum} ${props.retellKeySet ? s.stepDone : ""}`}>{props.retellKeySet ? "✓" : "3"}</span>
            <span className={s.stepText}>
              <b>Add the Retell API key</b>
              <span className={s.muted}>Retell › API Keys. Use the key with the webhook badge. It goes on the server, not in a text.</span>
              <span className={props.retellKeySet ? s.ok : s.bad}>{props.retellKeySet ? " Key is set." : " Not set yet."}</span>
            </span>
          </li>
          <li className={s.step}>
            <span className={`${s.stepNum} ${props.connected ? s.stepDone : ""}`}>{props.connected ? "✓" : "4"}</span>
            <span className={s.stepText}>
              <b>Type the 501 number, then Connect</b>
              <label className={s.field} style={{ marginTop: 8 }}>
                <span className={s.label}>Your new 501 number</span>
                <input
                  className={s.input}
                  inputMode="tel"
                  autoComplete="off"
                  placeholder="(501) 000-0000"
                  value={form.retellNumber ? prettyUs(form.retellNumber) : ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, retellNumber: e.target.value }))}
                  onBlur={(e) => save({ retellNumber: e.target.value })}
                />
              </label>
              <button type="button" className={`${s.btn} ${s.btnWide} ${s.btnGreen}`} onClick={connect} disabled={pending || !props.retellKeySet}>
                {props.connected ? "Reconnect" : "Connect"}
              </button>
              {!props.retellKeySet ? <span className={s.note}>Connect turns on after step 3.</span> : null}
            </span>
          </li>
          <li className={s.step}>
            <span className={s.stepNum}>5</span>
            <span className={s.stepText}>
              <b>Forward missed calls from {props.shopPhone ? prettyUs(props.shopPhone) : "your shop phone"}</b>
              <span className={s.muted}>On the shop phone, open the keypad and dial the code. Your phone still rings first.</span>
              <label className={s.field} style={{ marginTop: 8 }}>
                <span className={s.label}>Your phone company</span>
                <select className={s.select} value={carrier} onChange={(e) => setCarrier(e.target.value)}>
                  {FORWARDING_CARRIERS.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <span className={s.label}>Turn on</span>
              <span className={s.code} data-forward-code="1">{forwardTo ? forwardingCode(picked, forwardTo) : picked.on}</span>
              <span className={s.label} style={{ display: "block", marginTop: 8 }}>Turn off</span>
              <span className={s.code}>{picked.off}</span>
              <span className={s.note} style={{ display: "block" }}>{forwardTo ? picked.note.replaceAll("NUMBER", tenDigits(forwardTo)) : picked.note}</span>
              <span className={s.note} style={{ display: "block" }}>
                Codes differ by carrier and plan. If one doesn&apos;t work, call your carrier and ask for &quot;conditional call forwarding&quot; to {forwardTo ? prettyUs(forwardTo) : "your new 501 number"}.
              </span>
            </span>
          </li>
          <li className={s.step}>
            <span className={s.stepNum}>6</span>
            <span className={s.stepText}>
              <b>Test it</b>
              <span className={s.muted}>From another phone, call your shop number and don&apos;t answer. The AI should pick up and say {props.shopName}.</span>
            </span>
          </li>
        </ol>
        {steps.length ? (
          <ul className={s.steps} style={{ marginTop: 14 }} aria-label="Connect result">
            {steps.map((step) => (
              <li key={step.label} className={step.ok ? s.ok : s.bad}>
                {step.ok ? "✓" : "✗"} {step.label}
                {step.detail ? <span className={s.muted}> · {step.detail}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {note ? (
        <p className={s.toast} role="status">
          {note}
        </p>
      ) : null}
    </main>
  );
}
