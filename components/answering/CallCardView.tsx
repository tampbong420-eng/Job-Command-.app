"use client";

import { useState, useTransition } from "react";
import s from "@/components/answering/answering.module.css";
import { markCallHandledAction } from "@/app/answering/actions";
import { bookedLabel, callerLabel, chipFor, durationLabel, mapsLink, telLink, whenLabel } from "@/lib/answering/view";
import { prettyUs } from "@/lib/answering/forwarding";

export type CallCardData = {
  id: string;
  callerName: string;
  callerPhone: string;
  fromNumber: string;
  outcome: string;
  mode: string;
  address: string;
  jobType: string;
  details: string;
  preferredTime: string;
  urgency: string;
  summary: string;
  transcript: Array<{ role: "agent" | "user"; text: string }>;
  recordingUrl: string;
  durationSec: number;
  bookedDate: string;
  bookedStart: string;
  bookedEnd: string;
  createdAt: string;
  reviewed: boolean;
  simulated: boolean;
  job: { id: string; code: string } | null;
};

const TONE = { booked: s.chipBooked, back: s.chipBack, spam: s.chipSpam } as const;

export function CallCardView({ card, timeZone }: { card: CallCardData; timeZone: string }) {
  const [reviewed, setReviewed] = useState(card.reviewed);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const chip = chipFor(card.outcome);
  const phone = card.callerPhone || card.fromNumber;
  const tel = telLink(phone);
  const booked = bookedLabel(card.bookedDate, card.bookedStart, card.bookedEnd);
  const directions = mapsLink(card.address);

  const toggle = () =>
    start(async () => {
      const result = await markCallHandledAction(card.id, !reviewed);
      if (result.ok) setReviewed(!reviewed);
      setNote(result.message);
    });

  return (
    <main className={s.screen} data-call-card="1">
      <div className={s.top}>
        <a className={s.back} href="/calls" aria-label="Back to calls">‹ Calls</a>
      </div>

      <div className={s.row}>
        <span className={`${s.chip} ${TONE[chip.tone]}`}>{chip.label}</span>
        {card.urgency === "urgent" ? <span className={`${s.chip} ${s.chipBack}`}>Urgent</span> : null}
        {card.simulated ? <span className={`${s.chip} ${s.chipSim}`}>Test call</span> : null}
      </div>
      <h1 className={s.who}>{callerLabel(card)}</h1>
      <div className={s.phone}>{prettyUs(phone)}</div>
      <p className={s.muted} style={{ margin: "4px 0 14px" }}>
        {whenLabel(card.createdAt, timeZone)}
        {card.durationSec ? ` · ${durationLabel(card.durationSec)}` : ""}
        {card.mode === "message" ? " · message only" : ""}
      </p>

      {booked ? (
        <section className={s.booked} aria-label="Booked time">
          <p className={s.kicker} style={{ color: "#bbf7d0" }}>Estimate visit booked</p>
          <p className={s.bookedWhen}>{booked}</p>
          <p className={s.muted} style={{ color: "#dcfce7", margin: 0 }}>On the schedule as an estimate.</p>
          {card.job ? (
            <a className={`${s.btn} ${s.btnDark}`} style={{ marginTop: 12 }} href={`/?job=${card.job.id}`}>
              Open job {card.job.code}
            </a>
          ) : null}
        </section>
      ) : null}

      <section className={s.card} aria-label="Summary">
        <h2 className={s.cardTitle}>Summary</h2>
        <p className={s.summary}>{card.summary || "The AI summary shows up a few seconds after the call ends."}</p>
      </section>

      <section className={s.card} aria-label="Details">
        <dl className={s.facts}>
          {card.address ? (
            <div>
              <dt>Address</dt>
              <dd>
                {card.address}{" "}
                {directions ? (
                  <a className={s.factLink} href={directions} target="_blank" rel="noreferrer">
                    Directions
                  </a>
                ) : null}
              </dd>
            </div>
          ) : null}
          {card.jobType ? (
            <div>
              <dt>Job</dt>
              <dd>{card.jobType}</dd>
            </div>
          ) : null}
          {card.details ? (
            <div>
              <dt>Details</dt>
              <dd>{card.details}</dd>
            </div>
          ) : null}
          {card.preferredTime ? (
            <div>
              <dt>Best time for them</dt>
              <dd>{card.preferredTime}</dd>
            </div>
          ) : null}
          {!card.address && !card.jobType && !card.details && !card.preferredTime ? <dd className={s.muted}>No details captured.</dd> : null}
        </dl>
      </section>

      <section className={s.card} aria-label="Recording">
        <h2 className={s.cardTitle}>Recording</h2>
        {card.recordingUrl ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <audio className={s.audio} controls preload="none" src={card.recordingUrl} />
        ) : (
          <p className={s.muted} style={{ margin: 0 }}>No recording for this call.</p>
        )}
      </section>

      <section className={s.card} aria-label="Transcript">
        <details className={s.transcript}>
          <summary>Transcript ({card.transcript.length} lines)</summary>
          {card.transcript.length ? (
            card.transcript.map((turn, index) => (
              <p key={index} className={`${s.turn} ${turn.role === "user" ? s.turnUser : ""}`}>
                <span className={s.turnWho}>{turn.role === "agent" ? "AI" : "Caller"}</span>
                {turn.text}
              </p>
            ))
          ) : (
            <p className={s.muted}>No transcript yet.</p>
          )}
        </details>
      </section>

      <button type="button" className={`${s.btn} ${s.btnWide} ${s.btnDark}`} onClick={toggle} disabled={pending}>
        {reviewed ? "Handled ✓ (tap to undo)" : "Mark handled"}
      </button>
      {note ? <p className={s.toast} role="status">{note}</p> : null}

      <div className={s.dock}>
        <div className={s.dockInner} style={{ gridTemplateColumns: "1fr" }}>
          {tel ? (
            <a className={`${s.btn} ${s.btnGreen} ${s.callBack}`} href={tel} data-call-back="1">
              Call back {prettyUs(phone)}
            </a>
          ) : (
            <span className={`${s.btn} ${s.btnDark} ${s.callBack}`}>No number to call</span>
          )}
        </div>
      </div>
    </main>
  );
}
