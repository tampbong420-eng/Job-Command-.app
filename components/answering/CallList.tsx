import s from "@/components/answering/answering.module.css";
import { bookedLabel, callerLabel, chipFor, whenLabel } from "@/lib/answering/view";

export type CallRow = {
  id: string;
  callerName: string;
  callerPhone: string;
  fromNumber: string;
  outcome: string;
  jobType: string;
  summary: string;
  bookedDate: string;
  bookedStart: string;
  bookedEnd: string;
  createdAt: string;
  reviewed: boolean;
  simulated: boolean;
};

const TONE = { booked: s.chipBooked, back: s.chipBack, spam: s.chipSpam } as const;

export function CallList({ cards, timeZone, minutes }: { cards: CallRow[]; timeZone: string; minutes: { used: number; cap: number } }) {
  return (
    <main className={s.screen} data-call-list="1">
      <div className={s.top}>
        <a className={s.back} href="/?tab=company" aria-label="Back to Office">‹ Office</a>
        <span className={s.grow} />
        <a className={`${s.btn} ${s.btnDark}`} href="/answering">Setup</a>
      </div>
      <p className={s.kicker}>AI answering</p>
      <h1 className={s.title}>Calls</h1>
      <p className={s.muted} style={{ margin: "6px 0 14px" }}>
        {minutes.used} of {minutes.cap} min used this month
      </p>
      {cards.length ? (
        <div className={s.callList}>
          {cards.map((card) => {
            const chip = chipFor(card.outcome);
            const booked = bookedLabel(card.bookedDate, card.bookedStart, "");
            return (
              <a key={card.id} href={`/calls/${card.id}`} className={`${s.callRow} ${card.reviewed ? "" : s.callRowNew}`}>
                <span className={s.callName}>{callerLabel(card)}</span>
                <span className={s.callWhen}>{whenLabel(card.createdAt, timeZone)}</span>
                <span className={s.row}>
                  <span className={`${s.chip} ${TONE[chip.tone]}`}>{chip.label}</span>
                  {card.simulated ? <span className={`${s.chip} ${s.chipSim}`}>Test call</span> : null}
                </span>
                <span />
                <span className={s.callLine}>
                  {booked ? `${booked}${card.jobType ? ` · ${card.jobType}` : ""}` : card.jobType || card.summary.slice(0, 90) || "No details yet"}
                </span>
              </a>
            );
          })}
        </div>
      ) : (
        <p className={s.empty}>No calls yet. When the AI answers a call, its Call Card shows up here.</p>
      )}
    </main>
  );
}
